import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { doc, getDoc, setDoc, addDoc, serverTimestamp, collection, getDocs, increment, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import SelectorCliente from '../components/SelectorCliente.jsx'

function calcularDiff(anterior, nuevo) {
  const cambios = []
  const compararLista = (listaAnterior, listaNueva, seccion) => {
    listaNueva.forEach((item, i) => {
      const ant = listaAnterior[i] || {}
      Object.keys(item).forEach(campo => {
        const a = String(ant[campo] ?? ''), b = String(item[campo] ?? '')
        if (a !== b) cambios.push({ seccion, fila: i+1, campo, de: a||'(vacío)', a: b||'(vacío)' })
      })
    })
  }
  if (anterior) {
    compararLista(anterior.entregas||[], nuevo.entregas, 'Entregas')
    compararLista(anterior.levantes||[], nuevo.levantes, 'Levantes')
    compararLista(anterior.clientesPuntuales||[], nuevo.clientesPuntuales, 'Clientes puntuales')
    compararLista(anterior.devoluciones||[], nuevo.devoluciones, 'Devolución pallets')
  }
  return cambios
}

// Calcula cuánto cambió el REC (palletDesarmar en levantes/puntuales) y el DEV (devoluciones)
// por cliente, comparando el estado anterior contra el nuevo. Devuelve un mapa
// { cliente: { rec: delta, dev: delta } } con solo los deltas (pueden ser negativos
// si se borró o redujo un valor).
function calcularDeltasPallets(anterior, nuevo) {
  const deltas = {}

  function sumar(cliente, campo, valor) {
    if (!cliente) return
    if (!deltas[cliente]) deltas[cliente] = { rec: 0, dev: 0 }
    deltas[cliente][campo] += valor
  }

  function procesarListaRec(listaAnterior, listaNueva) {
    listaNueva.forEach((item, i) => {
      const ant = listaAnterior[i] || {}
      const clienteNuevo = item.cliente || ''
      const clienteAnterior = ant.cliente || ''
      const valNuevo = Number(item.palletDesarmar) || 0
      const valAnterior = Number(ant.palletDesarmar) || 0

      if (clienteNuevo === clienteAnterior) {
        // Mismo cliente en la fila: solo cambió la cantidad
        const delta = valNuevo - valAnterior
        if (delta !== 0) sumar(clienteNuevo, 'rec', delta)
      } else {
        // Cambió el cliente de la fila: revertir el valor viejo del cliente viejo,
        // aplicar el valor nuevo al cliente nuevo
        if (valAnterior !== 0) sumar(clienteAnterior, 'rec', -valAnterior)
        if (valNuevo !== 0) sumar(clienteNuevo, 'rec', valNuevo)
      }
    })
  }

  function procesarDevoluciones(listaAnterior, listaNueva) {
    listaNueva.forEach((item, i) => {
      const ant = listaAnterior[i] || {}
      const clienteNuevo = item.cliente || ''
      const clienteAnterior = ant.cliente || ''
      const valNuevo = Number(item.cantidad) || 0
      const valAnterior = Number(ant.cantidad) || 0

      if (clienteNuevo === clienteAnterior) {
        const delta = valNuevo - valAnterior
        if (delta !== 0) sumar(clienteNuevo, 'dev', delta)
      } else {
        if (valAnterior !== 0) sumar(clienteAnterior, 'dev', -valAnterior)
        if (valNuevo !== 0) sumar(clienteNuevo, 'dev', valNuevo)
      }
    })
  }

  procesarListaRec(anterior?.levantes || [], nuevo.levantes)
  procesarListaRec(anterior?.clientesPuntuales || [], nuevo.clientesPuntuales)
  procesarDevoluciones(anterior?.devoluciones || [], nuevo.devoluciones)

  return deltas
}

function hoy() { return new Date().toISOString().split('T')[0] }
// Antes de las 12:00 -> mañana, después -> tarde
function turnoActual() { return new Date().getHours() < 12 ? 'mañana' : 'tarde' }
const entregaVacia = () => ({ remitente:'', destinatario:'', aCobrar:'', bultos:'', remito:'', comentarios:'', ok:false, remitoOk:false })
const levanteVacio = () => ({ cliente:'', horaLlegada:'', horaSalida:'', bultos:'', palletDesarmar:'', comChofer:'', comOficina:'', controlOk:false })
const puntualVacio = () => ({ cliente:'', horaLlegada:'', horaSalida:'', bultos:'', palletDesarmar:'', comChofer:'', comOficina:'', controlOk:false })
const devVacia = () => ({ cliente:'', cantidad:'' })

const IS = { width:'100%', padding:'10px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'16px', boxSizing:'border-box' }
const ISD = { ...IS, background:'#f5f5f5', color:'#888', cursor:'not-allowed' }
const LS = { fontSize:'12px', color:'#666', marginBottom:'4px', display:'block' }

export default function Planilla() {
  const { fecha, choferId } = useParams()
  const [searchParams] = useSearchParams()
  const { usuario } = useAuth()
  const navigate = useNavigate()

  const esChofer = usuario.rol === 'chofer'
  const esOficina = usuario.rol === 'admin' || usuario.rol === 'operador'
  const soloLectura = esChofer && fecha < hoy()

  const [nombreChofer, setNombreChofer] = useState('')
  const [todosClientes, setTodosClientes] = useState([])
  const [turno, setTurno] = useState(
    searchParams.get('turno') === 'tarde' ? 'tarde' :
    searchParams.get('turno') === 'mañana' ? 'mañana' :
    turnoActual()
  )
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [confirmarReinicio, setConfirmarReinicio] = useState(null)
  const [horaManualValor, setHoraManualValor] = useState('')
  const [okStates, setOkStates] = useState([false])
  const [remitoOkStates, setRemitoOkStates] = useState([false])
  const [avisoPlantilla, setAvisoPlantilla] = useState('') // mensaje de éxito/error al cargar plantilla
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false)
  // Se incrementa cada vez que se aplican datos remotos (nunca mientras hay una
  // edición local pendiente). Forma parte de la key de los inputs no controlados
  // para que se actualicen visualmente cuando llega un cambio de otro dispositivo.
  const [refreshKey, setRefreshKey] = useState(0)

  // Datos viven completamente fuera de React en refs
  const datos = useRef({
    entregas: [entregaVacia()],
    levantes: Array(9).fill(null).map(levanteVacio),
    clientesPuntuales: Array(4).fill(null).map(puntualVacio),
    devoluciones: Array(3).fill(null).map(devVacia)
  })
  const datosAnteriores = useRef(null)
  const timerRef = useRef(null)
  const listo = useRef(false)
  const usuarioRef = useRef(usuario)
  useEffect(() => { usuarioRef.current = usuario }, [usuario])

  // Snapshot visual para renders selectivos
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => { cargarChoferYClientes() }, [choferId])

  // Escucha en tiempo real el documento de este chofer/fecha/turno.
  // Antes se leía una sola vez con getDoc, así que si el chofer marcaba una
  // hora desde el celular, quien tenía la planilla abierta en la compu no lo
  // veía hasta recargar la página.
  //
  // Resguardos para no pisar una edición en curso:
  // - Se ignoran los snapshots con hasPendingWrites=true (son el eco de
  //   nuestro propio guardado, todavía no confirmado por el servidor).
  // - Se ignoran los snapshots mientras hay un guardado con debounce pendiente
  //   (timerRef.current), para no pisar lo que se está por guardar.
  useEffect(() => {
    listo.current = false
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setCargando(true)
    const ref = doc(db, 'planillas', fecha, 'choferes', `${choferId}_${turno}`)
    let primerSnapshot = true

    const unsub = onSnapshot(ref, snap => {
      if (snap.metadata.hasPendingWrites) return
      if (!primerSnapshot && timerRef.current) return

      aplicarDatos(snap, primerSnapshot)

      if (primerSnapshot) {
        primerSnapshot = false
        setCargando(false)
        setTimeout(() => { listo.current = true }, 200)
      }
    }, () => {
      setCargando(false)
    })

    return () => unsub()
  }, [fecha, choferId, turno])

  async function cargarChoferYClientes() {
    const [sc, sk] = await Promise.all([
      getDoc(doc(db, 'choferes', choferId)),
      getDocs(collection(db, 'clientes'))
    ])
    setNombreChofer(sc.exists() ? sc.data().nombre : choferId)
    setTodosClientes(sk.docs.map(d => d.data().nombre).sort())
  }

  function aplicarDatos(snap, esCargaInicial) {
    if (snap.exists()) {
      const d = snap.data()
      datos.current = {
        entregas: (() => {
          const todas = (d.entregas||[entregaVacia()]).map(x=>({...entregaVacia(),...x}))
          // El filtro de filas vacías solo se aplica en la carga inicial
          // (para limpiar filas viejas guardadas de días anteriores).
          // En las actualizaciones en tiempo real posteriores NO se filtra,
          // porque si no, una fila recién agregada (todavía vacía) se borra
          // sola apenas se confirma el guardado en Firestore.
          if (!esCargaInicial) return todas.length > 0 ? todas : [entregaVacia()]
          const conDatos = todas.filter(e => e.remitente || e.destinatario || e.aCobrar || e.bultos || e.remito || e.comentarios)
          return conDatos.length > 0 ? conDatos : [entregaVacia()]
        })(),
        levantes: (d.levantes||Array(9).fill(null).map(levanteVacio)).map(x=>({...levanteVacio(),...x})),
        clientesPuntuales: (d.clientesPuntuales||Array(4).fill(null).map(puntualVacio)).map(x=>({...puntualVacio(),...x})),
        devoluciones: d.devoluciones||Array(3).fill(null).map(devVacia)
      }
      datosAnteriores.current = JSON.parse(JSON.stringify(datos.current))
    } else {
      datos.current = {
        entregas: [entregaVacia()],
        levantes: Array(9).fill(null).map(levanteVacio),
        clientesPuntuales: Array(4).fill(null).map(puntualVacio),
        devoluciones: Array(3).fill(null).map(devVacia)
      }
      datosAnteriores.current = null
    }
    setOkStates(datos.current.entregas.map(e => e.ok || false))
    setRemitoOkStates(datos.current.entregas.map(e => e.remitoOk || false))
    setSnapshot(JSON.parse(JSON.stringify(datos.current)))
    // Solo llegamos acá cuando no hay edición local pendiente, así que es
    // seguro remontar los inputs no controlados para que muestren el dato fresco.
    setRefreshKey(k => k + 1)
  }

  const guardar = useCallback(async () => {
    if (!listo.current || soloLectura) return
    setGuardando(true)
    const ref = doc(db, 'planillas', fecha, 'choferes', `${choferId}_${turno}`)
    const nuevo = JSON.parse(JSON.stringify(datos.current))
    const diff = calcularDiff(datosAnteriores.current, nuevo)

    // Calculamos qué cambió en términos de pallets, para actualizar el saldo acumulado por cliente
    const deltas = calcularDeltasPallets(datosAnteriores.current, nuevo)
    const promesasSaldo = Object.entries(deltas)
      .filter(([, d]) => d.rec !== 0 || d.dev !== 0)
      .map(([cliente, d]) => {
        const idCliente = cliente.toLowerCase().replace(/\s+/g, '-')
        return setDoc(doc(db, 'saldosPallets', idCliente), {
          cliente,
          rec: increment(d.rec),
          dev: increment(d.dev)
        }, { merge: true })
      })

    await Promise.all([
      setDoc(ref, { ...nuevo, modificadoPor: usuarioRef.current.uid, modificadoNombre: usuarioRef.current.nombre, modificadoAt: serverTimestamp() }, { merge: true }),
      ...promesasSaldo
    ])

    if (diff.length > 0 || !datosAnteriores.current) {
      await addDoc(collection(db, 'planillas', fecha, 'choferes', `${choferId}_${turno}`, 'historial'), {
        modificadoPor: usuarioRef.current.uid, modificadoNombre: usuarioRef.current.nombre,
        modificadoAt: new Date().toISOString(), fecha, choferId, turno, cambios: diff, snapshot: nuevo
      })
      datosAnteriores.current = nuevo
    }
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }, [fecha, choferId, turno, soloLectura])

  function programar(delay) {
    if (!listo.current || soloLectura) return
    if (timerRef.current) clearTimeout(timerRef.current)
    if (delay === 0) {
      timerRef.current = null
      guardar()
    } else {
      timerRef.current = setTimeout(() => { timerRef.current = null; guardar() }, delay)
    }
  }

  function set(seccion, i, campo, valor, delay=3000) {
    datos.current[seccion][i][campo] = valor
    setSnapshot(JSON.parse(JSON.stringify(datos.current)))
    programar(delay)
  }

  // Verifica si la planilla actual (este chofer/turno/fecha) tiene algo cargado en Levantes.
  // Solo Levantes importa para esta validación, ya que es lo que la plantilla precargada llena.
  function planillaTieneAlgoEnLevantes() {
    return datos.current.levantes.some(l => l.cliente && l.cliente.trim())
  }

  async function cargarPlantillaPrecargada() {
    setAvisoPlantilla('')
    if (planillaTieneAlgoEnLevantes()) {
      setAvisoPlantilla('Esta planilla ya tiene clientes cargados en Levantes. Borrá los datos a mano si querés reemplazarlos por la plantilla precargada.')
      return
    }
    setCargandoPlantilla(true)
    try {
      const ref = doc(db, 'retirosPrecargados', `${choferId}_${turno}`)
      const snap = await getDoc(ref)
      if (!snap.exists() || !(snap.data().clientes || []).length) {
        setAvisoPlantilla('No hay una plantilla precargada guardada para este chofer y turno. Podés crearla desde Admin → Retiros precargados.')
        setCargandoPlantilla(false)
        return
      }
      const clientesPlantilla = snap.data().clientes
      const nuevosLevantes = clientesPlantilla.map(cliente => ({ ...levanteVacio(), cliente }))
      // Si la plantilla tiene más clientes que filas actuales, se agregan filas extra
      while (nuevosLevantes.length < datos.current.levantes.length) {
        nuevosLevantes.push(levanteVacio())
      }
      datos.current.levantes = nuevosLevantes
      setSnapshot(JSON.parse(JSON.stringify(datos.current)))
      programar(0)
      setAvisoPlantilla(`Se cargaron ${clientesPlantilla.length} cliente${clientesPlantilla.length !== 1 ? 's' : ''} de la plantilla.`)
      setTimeout(() => setAvisoPlantilla(''), 4000)
    } catch (e) {
      setAvisoPlantilla('Error al cargar la plantilla. Probá de nuevo.')
    }
    setCargandoPlantilla(false)
  }

  function horaActual() {
    return new Date().toLocaleTimeString('es-UY', { hour:'2-digit', minute:'2-digit' })
  }

  function marcarHora(seccion, i, campo) {
    const yaTiene = datos.current[seccion][i][campo]
    if (yaTiene) {
      setHoraManualValor(yaTiene && yaTiene.includes(':') ? yaTiene : '')
      setConfirmarReinicio({ seccion, i, campo })
      return
    }
    const hora = horaActual()
    datos.current[seccion][i][campo] = hora
    setSnapshot(JSON.parse(JSON.stringify(datos.current)))
    programar(0)
  }

  function confirmarReinicioHora() {
    const { seccion, i, campo } = confirmarReinicio
    const hora = horaActual()
    datos.current[seccion][i][campo] = hora
    setSnapshot(JSON.parse(JSON.stringify(datos.current)))
    setConfirmarReinicio(null)
    programar(0)
  }

  function confirmarHoraManual(horaElegida) {
    if (!horaElegida) return
    const { seccion, i, campo } = confirmarReinicio
    datos.current[seccion][i][campo] = horaElegida
    setSnapshot(JSON.parse(JSON.stringify(datos.current)))
    setConfirmarReinicio(null)
    programar(0)
  }

  if (cargando || !snapshot) return <div style={{ padding:'40px', textAlign:'center' }}>Cargando...</div>

  const { entregas, levantes, clientesPuntuales, devoluciones } = snapshot
  const levantesChofer = levantes.map((l,i)=>({...l,_i:i})).filter(l=>l.cliente)
  const puntualesChofer = clientesPuntuales.map((l,i)=>({...l,_i:i})).filter(l=>l.cliente)
  const entregasChofer = entregas.map((e,i)=>({...e,_i:i})).filter(e=>e.remitente||e.destinatario)

  // Input no controlado que no pierde foco
  function Campo({ seccion, i, campo, delay=5000, type='text', disabled=false, placeholder='' }) {
    const initialValue = datos.current[seccion][i][campo]
    return (
      <input
        key={`${fecha}-${choferId}-${turno}-${seccion}-${i}-${campo}-${refreshKey}`}
        defaultValue={initialValue}
        disabled={disabled}
        type={type}
        placeholder={placeholder}
        style={disabled ? ISD : IS}
        onChange={ev => {
          datos.current[seccion][i][campo] = ev.target.value
          programar(delay)
        }}
      />
    )
  }

  function FilaLevante({ l, i, seccion, clienteEditable, oficina }) {
    const controlOk = snapshot[seccion][i]?.controlOk || false
    return (
      <div style={{ display:'grid', gridTemplateColumns:'1.3fr 90px 90px 70px 90px 1fr 1fr 44px', gap:'6px', marginBottom:'8px', alignItems:'end', background: controlOk ? '#e6ffed' : 'transparent', borderRadius:'8px', padding:'4px', boxSizing:'border-box' }}>
        <div>
          {clienteEditable ? (
            <SelectorCliente
              value={l.cliente}
              disabled={soloLectura}
              clientes={todosClientes}
              style={soloLectura ? ISD : IS}
              onSelect={(nombre) => set(seccion, i, 'cliente', nombre, 0)}
            />
          ) : (
            <div style={{...ISD, display:'flex', alignItems:'center'}}>{l.cliente}</div>
          )}
        </div>
        <div>
          {esChofer && !soloLectura ? (
            <button onClick={() => marcarHora(seccion, i, 'horaLlegada')}
              style={{...IS, background: l.horaLlegada?'#e6ffed':'#f7f7f7', cursor:'pointer', textAlign:'center', padding:'7px 4px', fontSize:'13px'}}>
              {l.horaLlegada || '⏱'}
            </button>
          ) : (
            <Campo seccion={seccion} i={i} campo="horaLlegada" type="time" delay={0} disabled={soloLectura} />
          )}
        </div>
        <div>
          {esChofer && !soloLectura ? (
            <button onClick={() => marcarHora(seccion, i, 'horaSalida')}
              style={{...IS, background: l.horaSalida?'#e6ffed':'#f7f7f7', cursor:'pointer', textAlign:'center', padding:'7px 4px', fontSize:'13px'}}>
              {l.horaSalida || '⏱'}
            </button>
          ) : (
            <Campo seccion={seccion} i={i} campo="horaSalida" type="time" delay={0} disabled={soloLectura} />
          )}
        </div>
        <div><Campo seccion={seccion} i={i} campo="bultos" type="number" delay={3000} disabled={soloLectura} /></div>
        <div><Campo seccion={seccion} i={i} campo="palletDesarmar" type="number" delay={3000} disabled={soloLectura} /></div>
        <div><Campo seccion={seccion} i={i} campo="comChofer" delay={5000} disabled={soloLectura && !esChofer} placeholder="..." /></div>
        <div><Campo seccion={seccion} i={i} campo="comOficina" delay={5000} disabled={!esOficina} placeholder="..." /></div>
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center' }}>
          {oficina ? (
            <button
              onClick={() => { set(seccion, i, 'controlOk', !datos.current[seccion][i].controlOk, 0) }}
              title="Control oficina"
              style={{ width:'36px', height:'36px', borderRadius:'50%', border:`2px solid ${controlOk?'#3182ce':'#ddd'}`, background:controlOk?'#3182ce':'white', color:controlOk?'white':'#aaa', cursor:'pointer', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
              ✓
            </button>
          ) : (
            <div style={{ width:'36px', height:'36px', borderRadius:'50%', border:`2px solid ${controlOk?'#3182ce':'#ddd'}`, background:controlOk?'#3182ce':'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', color:controlOk?'white':'#ddd' }}>
              ✓
            </div>
          )}
        </div>
      </div>
    )
  }

  function HeaderLevante() {
    return (
      <div style={{ display:'grid', gridTemplateColumns:'1.3fr 90px 90px 70px 90px 1fr 1fr 44px', gap:'6px', marginBottom:'4px' }}>
        {['Cliente','Llegada','Salida','Bultos','Pallets a desarmar','Com. chofer','Com. oficina','✓'].map(h => <label key={h} style={LS}>{h}</label>)}
      </div>
    )
  }

  // Tarjeta vertical para la vista del chofer en celular — un cliente por tarjeta.
  // El layout en tabla (FilaLevante) sigue siendo el que usa la oficina en pantallas grandes.
  function TarjetaLevanteChofer({ l, i, seccion }) {
    return (
      <div style={{
        background: l.controlOk ? '#e6ffed' : '#f8f9fa', border: `1px solid ${l.controlOk ? '#a3e8b8' : '#e2e8f0'}`, borderRadius:'10px',
        padding:'14px', marginBottom:'12px'
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
          <span style={{ fontWeight:'700', fontSize:'16px', color:'#1a1a2e' }}>{l.cliente}</span>
          {l.controlOk && (
            <span style={{ background:'#3182ce', color:'white', borderRadius:'12px', padding:'2px 10px', fontSize:'11px', fontWeight:'600' }}>
              ✓ Controlado
            </span>
          )}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
          <div>
            <label style={LS}>Llegada</label>
            {!soloLectura ? (
              <button onClick={() => marcarHora(seccion, i, 'horaLlegada')}
                style={{...IS, background: l.horaLlegada?'#e6ffed':'white', cursor:'pointer', textAlign:'center', fontWeight:'600', padding:'12px'}}>
                {l.horaLlegada || '⏱ Marcar'}
              </button>
            ) : (
              <div style={{...ISD, padding:'12px', textAlign:'center'}}>{l.horaLlegada || '-'}</div>
            )}
          </div>
          <div>
            <label style={LS}>Salida</label>
            {!soloLectura ? (
              <button onClick={() => marcarHora(seccion, i, 'horaSalida')}
                style={{...IS, background: l.horaSalida?'#e6ffed':'white', cursor:'pointer', textAlign:'center', fontWeight:'600', padding:'12px'}}>
                {l.horaSalida || '⏱ Marcar'}
              </button>
            ) : (
              <div style={{...ISD, padding:'12px', textAlign:'center'}}>{l.horaSalida || '-'}</div>
            )}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
          <div>
            <label style={LS}>Bultos</label>
            <Campo seccion={seccion} i={i} campo="bultos" type="number" delay={3000} disabled={soloLectura} />
          </div>
          <div>
            <label style={LS}>Pallets a desarmar</label>
            <Campo seccion={seccion} i={i} campo="palletDesarmar" type="number" delay={3000} disabled={soloLectura} />
          </div>
        </div>

        <div>
          <label style={LS}>Comentario</label>
          <Campo seccion={seccion} i={i} campo="comChofer" delay={5000} disabled={soloLectura} placeholder="Agregar comentario..." />
        </div>

        {l.comOficina && (
          <div style={{ marginTop:'10px', padding:'8px 10px', background:'#fff8e1', borderRadius:'6px', fontSize:'13px', color:'#8a6d00' }}>
            <strong>Oficina:</strong> {l.comOficina}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding:'clamp(12px,4vw,24px)', maxWidth:'1100px', margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px', flexWrap:'wrap' }}>
        <button onClick={() => navigate('/')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', padding:'4px' }}>←</button>
        <div>
          <h2 style={{ margin:0, color:'#1a1a2e', fontSize:'clamp(17px,4.5vw,22px)' }}>{nombreChofer}</h2>
          <div style={{ fontSize:'13px', color:'#888' }}>{fecha}</div>
        </div>
        {soloLectura && (
          <span style={{ background:'#fff3cd', color:'#856404', padding:'4px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:'600' }}>
            Solo lectura
          </span>
        )}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
          {guardando && <span style={{ color:'#888', fontSize:'12px' }}>Guardando...</span>}
          {guardado && !guardando && <span style={{ color:'green', fontSize:'12px' }}>✓ Guardado</span>}
          <div style={{ display:'flex', gap:'6px' }}>
            {['mañana','tarde'].map(t => (
              <button key={t} onClick={() => setTurno(t)}
                style={{ padding:'10px 16px', borderRadius:'8px', border:'none', cursor:'pointer', fontWeight:'600', fontSize:'14px', background:turno===t?'#1a1a2e':'#e2e8f0', color:turno===t?'white':'#444' }}>
                {t.charAt(0).toUpperCase()+t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ENTREGAS oficina */}
      {esOficina && (
        <div style={{ background:'white', borderRadius:'12px', padding:'20px', marginBottom:'20px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
            <h3 style={{ margin:0, color:'#1a1a2e' }}>Entregas</h3>
            <button onClick={() => {
              datos.current.entregas = [...datos.current.entregas, entregaVacia()]
              setSnapshot(JSON.parse(JSON.stringify(datos.current)))
              programar(0)
            }}
              style={{ padding:'6px 14px', background:'#ebf8ff', color:'#3182ce', border:'1px solid #3182ce', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>
              + Agregar entrega
            </button>
          </div>
          {entregas.map((e, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 100px 80px 110px 1fr 80px 32px', gap:'8px', marginBottom:'10px', alignItems:'end', background: snapshot.entregas[i]?.remitoOk ? '#e6ffed' : snapshot.entregas[i]?.ok ? '#fffde7' : 'transparent', borderRadius:'8px', padding:'4px', boxSizing:'border-box' }}>
              <div>{i===0&&<label style={LS}>Remitente</label>}<Campo seccion="entregas" i={i} campo="remitente" delay={5000} /></div>
              <div>{i===0&&<label style={LS}>Destinatario</label>}<Campo seccion="entregas" i={i} campo="destinatario" delay={5000} /></div>
              <div>{i===0&&<label style={LS}>A cobrar</label>}<Campo seccion="entregas" i={i} campo="aCobrar" delay={5000} /></div>
              <div>{i===0&&<label style={LS}>Bultos</label>}<Campo seccion="entregas" i={i} campo="bultos" type="number" delay={3000} /></div>
              <div>{i===0&&<label style={LS}>N° remito</label>}<Campo seccion="entregas" i={i} campo="remito" delay={5000} /></div>
              <div>{i===0&&<label style={LS}>Comentarios</label>}<Campo seccion="entregas" i={i} campo="comentarios" delay={5000} /></div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
                {i===0&&<label style={{...LS, textAlign:'center', whiteSpace:'nowrap'}}>Chofer / Remito</label>}
                <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                  {/* Check amarillo del chofer (solo lectura para oficina) */}
                  <div
                    title="Chofer marcó OK"
                    style={{ width:'32px', height:'32px', borderRadius:'50%', border:`2px solid ${snapshot.entregas[i]?.ok ? '#f59e0b' : '#ddd'}`, background: snapshot.entregas[i]?.ok ? '#fef3c7' : 'white', color: snapshot.entregas[i]?.ok ? '#f59e0b' : '#ccc', fontSize:'15px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    ✓
                  </div>
                  {/* Check verde de oficina — remito firmado recibido */}
                  <button
                    onClick={() => {
                      const nuevoValor = !datos.current.entregas[i].remitoOk
                      set('entregas', i, 'remitoOk', nuevoValor, 0)
                      setRemitoOkStates(prev => { const n=[...prev]; n[i]=nuevoValor; return n })
                    }}
                    title="Remito firmado recibido"
                    style={{ width:'32px', height:'32px', borderRadius:'50%', border:`2px solid ${snapshot.entregas[i]?.remitoOk ? '#38a169' : '#ddd'}`, background: snapshot.entregas[i]?.remitoOk ? '#38a169' : 'white', color: snapshot.entregas[i]?.remitoOk ? 'white' : '#aaa', cursor:'pointer', fontSize:'15px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    ✓
                  </button>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:'2px' }}>
                {i===0&&<div style={{ height:'20px' }}/>}
                {datos.current.entregas.length > 1 && (
                  <button onClick={() => {
                    datos.current.entregas = datos.current.entregas.filter((_, idx) => idx !== i)
                    setSnapshot(JSON.parse(JSON.stringify(datos.current)))
                    programar(0)
                  }}
                    title="Quitar fila"
                    style={{ width:'28px', height:'28px', background:'none', border:'none', color:'#ccc', fontSize:'18px', cursor:'pointer', padding:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ENTREGAS chofer */}
      {esChofer && entregasChofer.length > 0 && (
        <div style={{ background:'white', borderRadius:'12px', padding:'20px', marginBottom:'20px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin:'0 0 16px', color:'#1a1a2e' }}>Entregas</h3>

          {/* Tarjetas — mobile */}
          <div className="berro-tarjetas-chofer">
            {entregasChofer.map(e => {
              const i = e._i
              return (
                <div key={i} style={{ background: okStates[i] ? '#fffde7' : '#f8f9fa', border: `1px solid ${okStates[i] ? '#fcd34d' : '#e2e8f0'}`, borderRadius:'10px', padding:'14px', marginBottom:'12px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                    <span style={{ fontWeight:'700', fontSize:'15px', color:'#1a1a2e' }}>{e.remitente} → {e.destinatario}</span>
                    <button disabled={soloLectura}
                      onClick={() => { set('entregas', i, 'ok', !datos.current.entregas[i].ok, 0); setOkStates(prev => { const n=[...prev]; n[i]=!n[i]; return n }) }}
                      style={{ width:'36px', height:'36px', flexShrink:0, borderRadius:'50%', border:`2px solid ${okStates[i]?'#f59e0b':'#ddd'}`, background:okStates[i]?'#fef3c7':'white', color:okStates[i]?'#f59e0b':'#aaa', cursor:soloLectura?'not-allowed':'pointer', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      ✓
                    </button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px', fontSize:'13px', color:'#666' }}>
                    <div><strong>A cobrar:</strong> {e.aCobrar || '-'}</div>
                    <div><strong>Bultos:</strong> {e.bultos || '-'}</div>
                    <div><strong>N° remito:</strong> {e.remito || '-'}</div>
                  </div>
                  <label style={LS}>Comentario</label>
                  <Campo seccion="entregas" i={i} campo="comentarios" delay={5000} disabled={soloLectura} placeholder="Comentario..." />
                </div>
              )
            })}
          </div>

          {/* Tabla — desktop */}
          <div className="berro-tabla-chofer" style={{ overflowX:'auto' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 100px 80px 110px 1fr 60px', gap:'8px', marginBottom:'4px' }}>
              {['Remitente','Destinatario','A cobrar','Bultos','N° remito','Comentarios','OK'].map(h=><label key={h} style={LS}>{h}</label>)}
            </div>
            {entregasChofer.map(e => {
              const i = e._i
              return (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 100px 80px 110px 1fr 60px', gap:'8px', marginBottom:'8px', alignItems:'center', background: okStates[i] ? '#fffde7' : 'transparent', borderRadius:'8px', padding:'4px', boxSizing:'border-box' }}>
                  <div style={{...ISD, display:'flex', alignItems:'center'}}>{e.remitente}</div>
                  <div style={{...ISD, display:'flex', alignItems:'center'}}>{e.destinatario}</div>
                  <div style={{...ISD, display:'flex', alignItems:'center'}}>{e.aCobrar}</div>
                  <div style={{...ISD, display:'flex', alignItems:'center'}}>{e.bultos}</div>
                  <div style={{...ISD, display:'flex', alignItems:'center'}}>{e.remito}</div>
                  <Campo seccion="entregas" i={e._i} campo="comentarios" delay={5000} disabled={soloLectura} placeholder="Comentario..." />
                  <div style={{ display:'flex', justifyContent:'center' }}>
                    <button disabled={soloLectura}
                      onClick={() => { set('entregas', i, 'ok', !datos.current.entregas[i].ok, 0); setOkStates(prev => { const n=[...prev]; n[i]=!n[i]; return n }) }}
                      style={{ width:'36px', height:'36px', borderRadius:'50%', border:`2px solid ${okStates[i]?'#f59e0b':'#ddd'}`, background:okStates[i]?'#fef3c7':'white', color:okStates[i]?'#f59e0b':'#aaa', cursor:soloLectura?'not-allowed':'pointer', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      ✓
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


      {/* LEVANTES */}
      <div style={{ background:'white', borderRadius:'12px', padding:'20px', marginBottom:'20px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', flexWrap:'wrap', gap:'10px' }}>
          <h3 style={{ margin:0, color:'#1a1a2e' }}>Levantes</h3>
          {esOficina && (
            <button onClick={cargarPlantillaPrecargada} disabled={cargandoPlantilla}
              style={{ padding:'8px 16px', background:'#ebf8ff', color:'#3182ce', border:'1px solid #3182ce', borderRadius:'8px', fontSize:'13px', fontWeight:'600', cursor: cargandoPlantilla ? 'not-allowed' : 'pointer' }}>
              {cargandoPlantilla ? 'Cargando...' : '📋 Cargar planilla precargada'}
            </button>
          )}
        </div>
        {avisoPlantilla && (
          <div style={{ background: avisoPlantilla.startsWith('Se cargaron') ? '#e6ffed' : '#fff3cd', color: avisoPlantilla.startsWith('Se cargaron') ? '#276749' : '#856404', padding:'10px 14px', borderRadius:'8px', fontSize:'13px', marginBottom:'14px' }}>
            {avisoPlantilla}
          </div>
        )}
        {esOficina && <div style={{ overflowX:'auto' }}><HeaderLevante />{levantes.map((l,i)=><FilaLevante key={i} l={l} i={i} seccion="levantes" clienteEditable={true} oficina={true} />)}</div>}
        {esChofer && (levantesChofer.length===0
          ? <p style={{ color:'#888', fontSize:'14px' }}>No hay clientes cargados para este turno todavía.</p>
          : <>
              {/* Tarjetas — vista mobile del chofer */}
              <div className="berro-tarjetas-chofer">
                {levantesChofer.map(l => <TarjetaLevanteChofer key={l._i} l={l} i={l._i} seccion="levantes" />)}
              </div>
              {/* Tabla — vista desktop del chofer */}
              <div className="berro-tabla-chofer" style={{ overflowX:'auto' }}>
                <HeaderLevante />
                {levantesChofer.map(l=><FilaLevante key={l._i} l={l} i={l._i} seccion="levantes" clienteEditable={false} oficina={false} />)}
              </div>
            </>
        )}
      </div>

      {/* CLIENTES PUNTUALES oficina */}
      {esOficina && (
        <div style={{ background:'white', borderRadius:'12px', padding:'20px', marginBottom:'20px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', overflowX:'auto' }}>
          <h3 style={{ margin:'0 0 16px', color:'#1a1a2e' }}>Clientes puntuales</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1.3fr 90px 90px 70px 90px 1fr 1fr 44px', gap:'6px', marginBottom:'4px' }}>
            {['Cliente','Llegada','Salida','Bultos','Pallets a desarmar','Com. chofer','Com. oficina','✓'].map(h=><label key={h} style={LS}>{h}</label>)}
          </div>
          {clientesPuntuales.map((l,i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1.3fr 90px 90px 70px 90px 1fr 1fr 44px', gap:'6px', marginBottom:'8px', alignItems:'end', background: snapshot.clientesPuntuales[i]?.controlOk ? '#e6ffed' : 'transparent', borderRadius:'8px', padding:'4px', boxSizing:'border-box' }}>
              <Campo seccion="clientesPuntuales" i={i} campo="cliente" delay={5000} placeholder="Nombre cliente" />
              <Campo seccion="clientesPuntuales" i={i} campo="horaLlegada" type="time" delay={0} />
              <Campo seccion="clientesPuntuales" i={i} campo="horaSalida" type="time" delay={0} />
              <Campo seccion="clientesPuntuales" i={i} campo="bultos" type="number" delay={3000} />
              <Campo seccion="clientesPuntuales" i={i} campo="palletDesarmar" type="number" delay={3000} />
              <Campo seccion="clientesPuntuales" i={i} campo="comChofer" delay={5000} placeholder="..." />
              <Campo seccion="clientesPuntuales" i={i} campo="comOficina" delay={5000} placeholder="..." />
              <div style={{ display:'flex', justifyContent:'center', alignItems:'center' }}>
                <button
                  onClick={() => set('clientesPuntuales', i, 'controlOk', !datos.current.clientesPuntuales[i].controlOk, 0)}
                  title="Control oficina"
                  style={{ width:'36px', height:'36px', borderRadius:'50%', border:`2px solid ${snapshot.clientesPuntuales[i]?.controlOk?'#3182ce':'#ddd'}`, background:snapshot.clientesPuntuales[i]?.controlOk?'#3182ce':'white', color:snapshot.clientesPuntuales[i]?.controlOk?'white':'#aaa', cursor:'pointer', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  ✓
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CLIENTES PUNTUALES chofer */}
      {esChofer && puntualesChofer.length > 0 && (
        <div style={{ background:'white', borderRadius:'12px', padding:'20px', marginBottom:'20px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin:'0 0 16px', color:'#1a1a2e' }}>Clientes puntuales</h3>
          <div className="berro-tarjetas-chofer">
            {puntualesChofer.map(l => <TarjetaLevanteChofer key={l._i} l={l} i={l._i} seccion="clientesPuntuales" />)}
          </div>
          <div className="berro-tabla-chofer" style={{ overflowX:'auto' }}>
            <HeaderLevante />
            {puntualesChofer.map(l => <FilaLevante key={l._i} l={l} i={l._i} seccion="clientesPuntuales" clienteEditable={false} oficina={false} />)}
          </div>
        </div>
      )}

      {/* DEVOLUCIÓN PALLETS */}
      <div style={{ background:'white', borderRadius:'12px', padding:'20px', marginBottom:'20px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin:'0 0 16px', color:'#1a1a2e' }}>Devolución de Pallets</h3>
        {devoluciones.map((d,i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:'8px', marginBottom:'10px', alignItems:'end' }}>
            <div>
              {i===0&&<label style={LS}>Cliente</label>}
              <SelectorCliente
                value={d.cliente}
                disabled={soloLectura}
                clientes={todosClientes}
                style={soloLectura ? ISD : IS}
                onSelect={(nombre) => set('devoluciones', i, 'cliente', nombre, 0)}
              />
            </div>
            <div>
              {i===0&&<label style={LS}>Cantidad</label>}
              <Campo seccion="devoluciones" i={i} campo="cantidad" type="number" delay={3000} disabled={soloLectura} />
            </div>
          </div>
        ))}
      </div>

      {/* MODAL REINICIO HORA */}
      {confirmarReinicio && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'16px' }}>
          <div style={{ background:'white', borderRadius:'12px', padding:'24px', maxWidth:'340px', width:'100%', boxShadow:'0 4px 20px rgba(0,0,0,0.2)' }}>
            <p style={{ marginBottom:'18px', color:'#1a1a2e', fontSize:'15px', textAlign:'center' }}>Ya marcaste esta hora. ¿Qué querés hacer?</p>

            <div style={{ marginBottom:'16px' }}>
              <label style={{ fontSize:'12px', color:'#666', marginBottom:'6px', display:'block' }}>Elegir hora manualmente</label>
              <div style={{ display:'flex', gap:'8px' }}>
                <input
                  type="time"
                  value={horaManualValor}
                  onChange={e => setHoraManualValor(e.target.value)}
                  style={{ flex:1, padding:'10px', border:'1px solid #ddd', borderRadius:'8px', fontSize:'16px', boxSizing:'border-box' }}
                />
                <button onClick={() => confirmarHoraManual(horaManualValor)} disabled={!horaManualValor}
                  style={{ padding:'10px 16px', background: horaManualValor ? '#3182ce' : '#ccc', color:'white', border:'none', borderRadius:'8px', cursor: horaManualValor ? 'pointer' : 'not-allowed', fontWeight:'600', fontSize:'14px' }}>
                  Usar
                </button>
              </div>
            </div>

            <div style={{ display:'flex', gap:'12px' }}>
              <button onClick={() => setConfirmarReinicio(null)} style={{ padding:'12px 16px', background:'#f0f0f0', color:'#444', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'600', flex:1, fontSize:'13px' }}>Cancelar</button>
              <button onClick={confirmarReinicioHora} style={{ padding:'12px 16px', background:'#1a1a2e', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'600', flex:1, fontSize:'13px' }}>Reiniciar a ahora</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .berro-tarjetas-chofer { display: none; }
        .berro-tabla-chofer { display: block; }
        @media (max-width: 720px) {
          .berro-tarjetas-chofer { display: block; }
          .berro-tabla-chofer { display: none; }
        }
      `}</style>
    </div>
  )
}
