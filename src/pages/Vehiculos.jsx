import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, deleteField, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useAsignacion } from '../hooks/useAsignacion'
import { hoyLocal } from '../utils/fechas'
import { turnoActual, fechaCorta, nombreVehiculo, enTallerEnTurno, calcularAsignacion, PROPIO, filaSinCamioneta, textoFila, estadoControl, detalleItems } from '../utils/vehiculos'
import FichaVehiculo from '../components/FichaVehiculo.jsx'
import ControlVehiculo from '../components/ControlVehiculo.jsx'
import AlertaReportes from '../components/AlertaReportes.jsx'

// Pantalla de camionetas (pensada para el celular: tarjetas y botones grandes).
// Dos pestañas: "Hoy" (quién maneja qué en cada turno) y "Camionetas" (la lista).
// Tocando una camioneta se abre su ficha: fallas, daños, taller y editar.
//
// Colecciones:
//  "vehiculos": { numero, matricula, choferTitularId, esBackup, enTaller, tallerDesde, tallerDesdeTurno, tallerVisto, creadoAt }
//    - esBackup: la camioneta de reserva (hay una sola). Va aparte de enTaller porque el backup también se puede romper.
//    - tallerVisto: false cuando se manda al taller, para avisarle a mantenimiento.
//  "asignacionesVehiculos/<fecha>_<turno>": { manual: { choferId: vehiculoId | '' | '__propio' }, registro: { choferId: { vehiculoId, motivo, detalle } } }
//    - manual: cambios hechos a mano ('' = sin camioneta, '__propio' = vehículo propio / tercero).
//    - registro: lo que quedó guardado de quién manejó qué. Se actualiza solo mientras el turno no pasó;
//      cuando el turno termina queda congelado, aunque después cambie el titular o vuelva una camioneta del taller.
//  "reportesVehiculos": fallas y daños (ver FichaVehiculo.jsx).
//  "controlesVehiculos": el control quincenal de cada camioneta (ver ControlVehiculo.jsx).
//  "recepcionesVehiculos": cuando el chofer contesta "¿Está todo bien?" al empezar (ver RecepcionCamioneta.jsx).

const FORM_VACIO = { numero: '', matricula: '', choferTitularId: '', esBackup: false }

const IS = { width: '100%', padding: '14px', border: '1px solid #ccc', borderRadius: '10px', fontSize: '17px', boxSizing: 'border-box', background: 'white' }
const LABEL = { display: 'block', fontSize: '15px', fontWeight: '600', color: '#333', marginBottom: '6px' }
const BTN = { padding: '14px 18px', borderRadius: '10px', border: 'none', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }
const CAJA = { background: 'white', borderRadius: '14px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }

// Ordena por número de camioneta (2 antes que 10). El backup va al final.
function ordenar(a, b) {
  if (!!a.esBackup !== !!b.esBackup) return a.esBackup ? 1 : -1
  return String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true })
}

// Convierte un objeto a texto siempre en el mismo orden (también lo de adentro), para comparar si cambió.
// Firestore puede devolver los campos en otro orden, por eso se ordena todo.
function textoOrdenado(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj ?? null)
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + textoOrdenado(obj[k])).join(',') + '}'
}

function leerPestania(rol) {
  try { return sessionStorage.getItem('vehiculos_tab') || (rol === 'mantenimiento' ? 'camionetas' : 'hoy') }
  catch { return rol === 'mantenimiento' ? 'camionetas' : 'hoy' }
}

export default function Vehiculos() {
  const { usuario } = useAuth()
  const puedeEditar = ['admin', 'coordinador'].includes(usuario.rol)
  const esAdmin = usuario.rol === 'admin'
  const esMant = usuario.rol === 'mantenimiento'
  // El control quincenal lo hace Gustavo; si falta, lo pueden hacer Alvaro o Juan
  const puedeControlar = ['admin', 'coordinador', 'mantenimiento'].includes(usuario.rol)

  const [fecha, setFecha] = useState(hoyLocal())
  const [turno, setTurno] = useState(turnoActual())
  const asign = useAsignacion(fecha, turno)
  const { cargado, vehiculos, fijos, puntuales, manual, congelado, filas, vehiculoPorId, nombreChofer } = asign

  const [reportes, setReportes] = useState([])
  const [controles, setControles] = useState([])
  const [controlandoId, setControlandoId] = useState(null) // camioneta a la que se le está haciendo el control
  const [pestania, setPestaniaState] = useState(() => leerPestania(usuario.rol))
  const [fichaId, setFichaId] = useState(null)
  // Si se llega desde la alerta de Planillas ("Ver"), se abre directo la ficha de esa camioneta
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const id = params.get('ficha')
    if (id) {
      setFichaId(id)
      setParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [mensaje, setMensaje] = useState('')

  // Formulario de camioneta: null = cerrado, 'nuevo' = agregando, o el id de la camioneta que se edita
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [aviso, setAviso] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [eligiendoTurnoTaller, setEligiendoTurnoTaller] = useState(false)
  const [cambiando, setCambiando] = useState(null)   // choferId al que se le está cambiando la camioneta
  const [agregandoOtro, setAgregandoOtro] = useState(false)
  const [otro, setOtro] = useState({ choferId: '', vehiculoId: '' })

  function setPestania(p) {
    setPestaniaState(p)
    try { sessionStorage.setItem('vehiculos_tab', p) } catch { /* sin memoria del navegador: no pasa nada */ }
  }

  useEffect(() => onSnapshot(
    collection(db, 'reportesVehiculos'),
    s => setReportes(s.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => setReportes([])
  ), [])

  useEffect(() => onSnapshot(
    collection(db, 'controlesVehiculos'),
    s => setControles(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creadoAt || 0) - (a.creadoAt || 0))),
    () => setControles([])
  ), [])

  // Qué choferes ya contestaron "¿Está todo bien?" ese día
  const [recepciones, setRecepciones] = useState([])
  useEffect(() => onSnapshot(
    query(collection(db, 'recepcionesVehiculos'), where('fecha', '==', fecha)),
    s => setRecepciones(s.docs.map(d => d.data())),
    () => setRecepciones([])
  ), [fecha])

  useEffect(() => { setCambiando(null); setAgregandoOtro(false) }, [fecha, turno])

  // ── Guardar el registro de quién maneja qué ──
  // Mientras el turno no pasó, admin y coordinador lo guardan solo cuando cambia.
  // ultimoGuardado evita guardar dos veces lo mismo: así nunca puede quedar guardando en bucle.
  const registroCalculado = {}
  asign.calculado.forEach(f => { registroCalculado[f.choferId] = { vehiculoId: f.vehiculoId, motivo: f.motivo, detalle: f.detalle } })
  const textoRegistro = textoOrdenado(registroCalculado)
  const ultimoGuardado = useRef('')
  useEffect(() => {
    if (!cargado || congelado || !puedeEditar) return
    if (textoOrdenado(asign.asignDoc?.registro || {}) === textoRegistro) return
    const clave = `${fecha}_${turno}|${textoRegistro}`
    if (ultimoGuardado.current === clave) return
    ultimoGuardado.current = clave
    setDoc(doc(db, 'asignacionesVehiculos', `${fecha}_${turno}`),
      { registro: registroCalculado, fecha, turno, actualizadoAt: Date.now() },
      { merge: true }
    ).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargado, congelado, puedeEditar, textoRegistro, fecha, turno])

  const lista = [...vehiculos].sort(ordenar)
  const usadaPor = {}
  filas.forEach(f => { if (f.vehiculoId) usadaPor[f.vehiculoId] = f.choferId })
  const esTurnoDeAhora = fecha === hoyLocal() && turno === turnoActual()

  // ── Avisos ──
  // (Las fallas y daños nuevos se avisan con la ventana de AlertaReportes.jsx)
  const avisosTaller = esMant ? lista.filter(v => v.enTaller && v.tallerVisto === false) : []
  // Controles con algo en "Mal" que Juan todavía no vio
  const avisosControles = esAdmin ? controles.filter(c => c.hayMal && !c.vistoAdmin) : []
  const controlesDe = id => controles.filter(c => c.vehiculoId === id)
  const faltanControl = lista.filter(v => estadoControl(controlesDe(v.id)[0], v).falta)
  const sinCamioneta = !congelado ? filas.filter(filaSinCamioneta) : []

  async function marcarVistoControl(c) {
    try {
      await updateDoc(doc(db, 'controlesVehiculos', c.id), { vistoAdmin: true })
    } catch {
      window.alert('No se pudo guardar. Revisá la conexión y probá de nuevo.')
    }
  }
  async function marcarVistoTaller(v) {
    try {
      await updateDoc(doc(db, 'vehiculos', v.id), { tallerVisto: true })
    } catch {
      window.alert('No se pudo guardar. Revisá la conexión y probá de nuevo.')
    }
  }

  // ── Alta y edición de camionetas ──
  function abrirNuevo() {
    setForm(FORM_VACIO); setAviso(''); setEditando('nuevo')
  }
  function abrirEditar(v) {
    setForm({ numero: v.numero || '', matricula: v.matricula || '', choferTitularId: v.choferTitularId || '', esBackup: !!v.esBackup })
    setAviso(''); setEditando(v.id)
  }
  function cerrarForm() {
    setEditando(null); setAviso('')
  }

  async function guardar() {
    const numero = form.numero.trim()
    const matricula = form.matricula.trim().toUpperCase()
    const otras = vehiculos.filter(v => v.id !== editando)

    if (!numero) { setAviso('Poné el número de la camioneta.'); return }
    if (!matricula) { setAviso('Poné la matrícula.'); return }
    if (otras.some(v => String(v.numero).trim() === numero)) {
      setAviso(`Ya hay otra camioneta con el número ${numero}.`); return
    }
    if (form.esBackup && otras.some(v => v.esBackup)) {
      setAviso('Ya hay una camioneta marcada como backup. Sacale la marca a esa primero.'); return
    }
    const titularId = form.esBackup ? '' : form.choferTitularId
    if (titularId) {
      const otra = otras.find(v => v.choferTitularId === titularId)
      if (otra) {
        setAviso(`${nombreChofer(titularId)} ya es titular de la camioneta ${otra.numero}. Cambialo ahí primero.`); return
      }
    }

    const datos = { numero, matricula, choferTitularId: titularId, esBackup: form.esBackup }
    setGuardando(true)
    try {
      if (editando === 'nuevo') {
        await addDoc(collection(db, 'vehiculos'), { ...datos, enTaller: false, tallerDesde: '', tallerDesdeTurno: '', creadoAt: Date.now() })
      } else {
        await updateDoc(doc(db, 'vehiculos', editando), datos)
      }
      cerrarForm()
    } catch {
      setAviso('No se pudo guardar. Revisá la conexión y probá de nuevo.')
    }
    setGuardando(false)
  }

  async function borrar() {
    const v = vehiculoPorId(editando)
    if (!v) return
    if (!window.confirm(`¿Borrar la camioneta ${v.numero} (${v.matricula})?`)) return
    try {
      await deleteDoc(doc(db, 'vehiculos', v.id))
      cerrarForm()
      setFichaId(null)
    } catch {
      setAviso('No se pudo borrar. Revisá la conexión y probá de nuevo.')
    }
  }

  // ── Taller ──
  async function mandarATaller(v, desdeTurno) {
    const hoy = hoyLocal()
    setEligiendoTurnoTaller(false) // se cierra enseguida, sin esperar a que el servidor confirme
    // Avisar qué pasa con el chofer: se calcula con la camioneta ya en el taller
    const conTaller = vehiculos.map(x => x.id === v.id ? { ...x, enTaller: true, tallerDesde: hoy, tallerDesdeTurno: desdeTurno } : x)
    const mismoTurno = fecha === hoy && turno === desdeTurno
    const res = calcularAsignacion({ vehiculos: conTaller, choferes: fijos, puntuales: mismoTurno ? puntuales : [], ausencias: asign.ausencias, fecha: hoy, turno: desdeTurno, manual: mismoTurno ? manual : {} })
    const afectado = res.find(f => f.detalle.includes(`la ${v.numero} `))
    if (!afectado) setMensaje(`La camioneta ${v.numero} quedó en el taller desde la ${desdeTurno} de hoy.`)
    else if (afectado.vehiculoId) setMensaje(`La camioneta ${v.numero} quedó en el taller. ${nombreChofer(afectado.choferId)} pasa a usar el backup desde la ${desdeTurno}.`)
    else setMensaje(`⚠️ La camioneta ${v.numero} quedó en el taller y NO hay camioneta libre para ${nombreChofer(afectado.choferId)}. Asignale una a mano en la pestaña "Hoy".`)
    try {
      await updateDoc(doc(db, 'vehiculos', v.id), { enTaller: true, tallerDesde: hoy, tallerDesdeTurno: desdeTurno, tallerVisto: false })
    } catch {
      setMensaje('')
      window.alert('No se pudo guardar. Revisá la conexión y probá de nuevo.')
    }
  }

  async function volvioDelTaller(v) {
    if (!window.confirm(`¿La camioneta ${v.numero} volvió del taller?`)) return
    setMensaje(`La camioneta ${v.numero} volvió a andar. Su chofer la vuelve a tener.`)
    try {
      await updateDoc(doc(db, 'vehiculos', v.id), { enTaller: false, tallerDesde: '', tallerDesdeTurno: '', tallerVisto: true })
    } catch {
      setMensaje('')
      window.alert('No se pudo guardar. Revisá la conexión y probá de nuevo.')
    }
  }

  // ── Cambios a mano en la asignación ──
  // valor: un id de camioneta, '' para "sin camioneta", PROPIO, o null para volver a lo automático
  async function cambiarAsignacion(choferId, valor) {
    if (valor && valor !== PROPIO) {
      const otroChofer = usadaPor[valor]
      if (otroChofer && otroChofer !== choferId &&
        !window.confirm(`${nombreVehiculo(vehiculoPorId(valor))} la tiene ${nombreChofer(otroChofer)}. ¿Dársela igual a ${nombreChofer(choferId)}?\n${nombreChofer(otroChofer)} va a pasar al backup o quedar sin camioneta.`)) return
    }
    setCambiando(null)
    try {
      await setDoc(doc(db, 'asignacionesVehiculos', `${fecha}_${turno}`),
        { manual: { [choferId]: valor === null ? deleteField() : valor }, fecha, turno },
        { merge: true })
    } catch {
      window.alert('No se pudo guardar. Revisá la conexión y probá de nuevo.')
    }
  }

  async function asignarOtro() {
    if (!otro.choferId || !otro.vehiculoId) { window.alert('Elegí el chofer y la camioneta.'); return }
    setAgregandoOtro(false)
    await cambiarAsignacion(otro.choferId, otro.vehiculoId)
    setOtro({ choferId: '', vehiculoId: '' })
  }

  // Camionetas que se pueden elegir en este turno (las que no están en el taller)
  const disponibles = lista.filter(v => !enTallerEnTurno(v, fecha, turno))
  const textoOpcion = v => `${nombreVehiculo(v)}${usadaPor[v.id] ? ` — la tiene ${nombreChofer(usadaPor[v.id])}` : ' — libre'}`
  const choferesSinFila = [...fijos, ...puntuales].filter(c => !filas.some(f => f.choferId === c.id))

  // ── Pantallas ──
  if (!asign.vehiculos.length && !cargado) return <div style={{ padding: '24px', fontSize: '17px' }}>Cargando camionetas...</div>

  // Formulario de alta / edición (pantalla propia, así no se pierde entre las tarjetas)
  if (editando !== null) {
    return (
      <div style={{ padding: '16px', maxWidth: '640px', margin: '0 auto' }}>
        <div style={CAJA}>
          <h3 style={{ margin: '0 0 16px', fontSize: '20px' }}>{editando === 'nuevo' ? 'Nueva camioneta' : 'Editar camioneta'}</h3>

          <label style={LABEL}>Número</label>
          <input style={{ ...IS, marginBottom: '14px' }} inputMode="numeric" placeholder="Ej: 4"
            value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} />

          <label style={LABEL}>Matrícula</label>
          <input style={{ ...IS, marginBottom: '14px', textTransform: 'uppercase' }} placeholder="Ej: SBX 1234"
            value={form.matricula} onChange={e => setForm({ ...form, matricula: e.target.value })} />

          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '17px', marginBottom: '14px', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: '24px', height: '24px' }}
              checked={form.esBackup} onChange={e => setForm({ ...form, esBackup: e.target.checked })} />
            Es la camioneta de backup
          </label>

          {!form.esBackup && (
            <>
              <label style={LABEL}>Chofer titular</label>
              <select style={{ ...IS, marginBottom: '14px' }}
                value={form.choferTitularId} onChange={e => setForm({ ...form, choferTitularId: e.target.value })}>
                <option value="">— Sin titular —</option>
                {fijos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </>
          )}

          {aviso && <div style={{ background: '#fffaf0', color: '#9c4221', padding: '12px', borderRadius: '10px', marginBottom: '14px', fontSize: '16px' }}>{aviso}</div>}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={guardar} disabled={guardando} style={{ ...BTN, flex: 1, background: '#38a169', color: 'white' }}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={cerrarForm} style={{ ...BTN, flex: 1, background: '#e2e8f0', color: '#333' }}>Cancelar</button>
          </div>
          {editando !== 'nuevo' && (
            <button onClick={borrar} style={{ ...BTN, width: '100%', marginTop: '10px', background: 'transparent', color: '#c53030', border: '1px solid #feb2b2' }}>
              Borrar camioneta
            </button>
          )}
        </div>
      </div>
    )
  }

  // Formulario del control quincenal
  const vehiculoControl = controlandoId ? vehiculoPorId(controlandoId) : null
  if (vehiculoControl) {
    const choferId = esTurnoDeAhora ? usadaPor[vehiculoControl.id] : null
    return (
      <ControlVehiculo
        vehiculo={vehiculoControl}
        usuario={usuario}
        choferEnUso={choferId ? nombreChofer(choferId) : ''}
        onListo={() => { setControlandoId(null); setMensaje(`Control de la ${nombreVehiculo(vehiculoControl)} guardado.`) }}
        onCancelar={() => setControlandoId(null)}
      />
    )
  }

  // Ficha de una camioneta
  const fichaVehiculo = fichaId ? vehiculoPorId(fichaId) : null
  if (fichaVehiculo) {
    const v = fichaVehiculo
    const choferId = esTurnoDeAhora ? usadaPor[v.id] : null
    const acciones = puedeEditar && (
      <div style={{ marginTop: '14px' }}>
        {eligiendoTurnoTaller ? (
          <div style={{ background: '#fffaf0', borderRadius: '10px', padding: '12px', border: '1px solid #fbd38d' }}>
            <div style={{ fontSize: '17px', fontWeight: '600', marginBottom: '10px' }}>¿Desde qué turno de hoy está en el taller?</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {['mañana', 'tarde'].map(t => (
                <button key={t} onClick={() => mandarATaller(v, t)} style={{ ...BTN, flex: 1, background: '#dd6b20', color: 'white' }}>
                  Desde la {t}
                </button>
              ))}
            </div>
            <button onClick={() => setEligiendoTurnoTaller(false)} style={{ ...BTN, width: '100%', marginTop: '8px', background: '#e2e8f0', color: '#333' }}>Cancelar</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            {v.enTaller
              ? <button onClick={() => volvioDelTaller(v)} style={{ ...BTN, flex: 1, background: '#38a169', color: 'white' }}>Volvió del taller</button>
              : <button onClick={() => setEligiendoTurnoTaller(true)} style={{ ...BTN, flex: 1, background: '#dd6b20', color: 'white' }}>Mandar a taller</button>}
            <button onClick={() => abrirEditar(v)} style={{ ...BTN, background: '#e2e8f0', color: '#333' }}>Editar</button>
          </div>
        )}
      </div>
    )
    return (
      <>
        {mensaje && (
          <div style={{ padding: '16px 16px 0', maxWidth: '640px', margin: '0 auto' }}>
            <div style={{ ...CAJA, marginBottom: 0, background: mensaje.startsWith('⚠️') ? '#fff5f5' : '#f0fff4', fontSize: '17px' }}>
              {mensaje}
              <button onClick={() => setMensaje('')} style={{ ...BTN, display: 'block', marginTop: '10px', background: '#e2e8f0', color: '#333', padding: '10px 16px' }}>Entendido</button>
            </div>
          </div>
        )}
        <FichaVehiculo
          vehiculo={v}
          reportes={reportes}
          usuario={usuario}
          choferEnUso={choferId ? nombreChofer(choferId) : ''}
          onVolver={() => { setFichaId(null); setEligiendoTurnoTaller(false) }}
          acciones={acciones}
          controles={controlesDe(v.id)}
          onHacerControl={puedeControlar ? () => setControlandoId(v.id) : null}
        />
      </>
    )
  }

  const enTallerHoy = lista.filter(v => v.enTaller).length
  const pestanias = [['hoy', 'Quién maneja hoy'], ['camionetas', `Camionetas (${lista.length})`]]

  return (
    <div style={{ padding: '16px', maxWidth: '640px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '24px', margin: '4px 0 12px' }}>🚐 Camionetas</h2>

      {mensaje && (
        <div style={{ ...CAJA, background: mensaje.startsWith('⚠️') ? '#fff5f5' : '#f0fff4', fontSize: '17px' }}>
          {mensaje}
          <button onClick={() => setMensaje('')} style={{ ...BTN, display: 'block', marginTop: '10px', background: '#e2e8f0', color: '#333', padding: '10px 16px' }}>Entendido</button>
        </div>
      )}

      {/* Ventana de alerta: fallas y daños nuevos que este usuario todavía no vio */}
      {puedeControlar && <AlertaReportes usuario={usuario} onVer={id => { setPestania('camionetas'); setFichaId(id) }} />}

      {/* ── AVISOS ── */}
      {(avisosTaller.length > 0 || avisosControles.length > 0) && (
        <div style={{ ...CAJA, background: '#fffaf0', border: '2px solid #f6ad55' }}>
          <div style={{ fontSize: '19px', fontWeight: '700', marginBottom: '10px' }}>🔔 Avisos nuevos</div>
          {avisosTaller.map(v => (
            <div key={v.id} style={{ borderTop: '1px solid #fbd38d', padding: '12px 0' }}>
              <div style={{ fontSize: '17px' }}>🔧 <b>{nombreVehiculo(v)}</b> se mandó al taller desde la {v.tallerDesdeTurno || 'mañana'} del {fechaCorta(v.tallerDesde)}.</div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button onClick={() => setFichaId(v.id)} style={{ ...BTN, flex: 1, background: '#dd6b20', color: 'white' }}>Ver / cargar fallas</button>
                <button onClick={() => marcarVistoTaller(v)} style={{ ...BTN, flex: 1, background: '#e2e8f0', color: '#333' }}>Visto</button>
              </div>
            </div>
          ))}
          {avisosControles.map(c => (
            <div key={c.id} style={{ borderTop: '1px solid #fbd38d', padding: '12px 0' }}>
              <div style={{ fontSize: '17px' }}>
                📋 Control de <b>{nombreVehiculo(vehiculoPorId(c.vehiculoId))}</b>: en Mal {detalleItems(c, 'mal')}
              </div>
              <div style={{ fontSize: '14px', color: '#777', marginTop: '4px' }}>{c.hechoPor} · {fechaCorta(c.fecha)}</div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button onClick={() => setFichaId(c.vehiculoId)} style={{ ...BTN, flex: 1, background: '#dd6b20', color: 'white' }}>Ver</button>
                <button onClick={() => marcarVistoControl(c)} style={{ ...BTN, flex: 1, background: '#e2e8f0', color: '#333' }}>Visto</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PESTAÑAS ── */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', background: '#e2e8f0', borderRadius: '12px', padding: '4px' }}>
        {pestanias.map(([clave, texto]) => (
          <button key={clave} onClick={() => setPestania(clave)}
            style={{ ...BTN, flex: 1, padding: '12px 6px', fontSize: '15px', background: pestania === clave ? 'white' : 'transparent', color: pestania === clave ? '#1a1a2e' : '#555', boxShadow: pestania === clave ? '0 1px 3px rgba(0,0,0,0.15)' : 'none' }}>
            {texto}
            {clave === 'hoy' && sinCamioneta.length > 0 && <span style={{ color: '#c53030' }}> ⚠️</span>}
          </button>
        ))}
      </div>

      {/* ── PESTAÑA HOY ── */}
      {pestania === 'hoy' && (
        <div style={CAJA}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)}
              style={{ ...IS, width: 'auto', flex: '1 1 160px', padding: '10px' }} />
            {['mañana', 'tarde'].map(t => (
              <button key={t} onClick={() => setTurno(t)}
                style={{ ...BTN, flex: '1 1 90px', padding: '10px', background: turno === t ? '#1a1a2e' : '#e2e8f0', color: turno === t ? 'white' : '#444' }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {!cargado && <div style={{ fontSize: '16px', color: '#666' }}>Cargando...</div>}
          {cargado && asign.estimado && filas.length > 0 && (
            <div style={{ fontSize: '15px', color: '#975a16', background: '#fffff0', borderRadius: '8px', padding: '10px', marginBottom: '6px' }}>
              De este turno no quedó nada guardado. Esto es lo que corresponde según cómo están las camionetas ahora.
            </div>
          )}
          {cargado && sinCamioneta.length > 0 && (
            <div style={{ fontSize: '16px', color: '#c53030', fontWeight: '600', background: '#fff5f5', borderRadius: '8px', padding: '10px', marginBottom: '6px' }}>
              ⚠️ {sinCamioneta.length === 1 ? 'Hay 1 chofer' : `Hay ${sinCamioneta.length} choferes`} sin camioneta. No se le pueden cargar retiros hasta asignarle una.
            </div>
          )}
          {cargado && filas.length === 0 && (
            <div style={{ fontSize: '16px', color: '#666' }}>Todavía no hay camionetas con chofer titular.</div>
          )}

          {cargado && filas.map(f => {
            const sin = filaSinCamioneta(f)
            return (
              <div key={f.choferId} style={{ borderTop: '1px solid #edf2f7', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '17px', fontWeight: '600' }}>{nombreChofer(f.choferId)}</div>
                    <div style={{ fontSize: '17px', color: sin ? '#c53030' : f.motivo === 'titular' ? '#333' : '#975a16', fontWeight: sin ? '700' : '400' }}>
                      {sin ? '⚠️ Sin camioneta' : `→ ${textoFila(f, vehiculoPorId)}`}
                    </div>
                    {f.detalle && <div style={{ fontSize: '14px', color: '#777' }}>{f.detalle}</div>}
                    {f.vehiculoId && (() => {
                      const r = recepciones.find(x => x.choferId === f.choferId && x.vehiculoId === f.vehiculoId)
                      const hora = r?.creadoAt ? new Date(r.creadoAt).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : ''
                      if (r) return (
                        <div style={{ fontSize: '14px', fontWeight: '600', color: r.estado === 'ok' ? '#276749' : '#c05621' }}>
                          {r.estado === 'ok' ? `✅ La recibió: todo OK (${hora})` : `⚠️ La recibió y reportó algo (${hora})`}
                        </div>
                      )
                      const esPuntual = asign.todosChoferes.find(c => c.id === f.choferId)?.puntual
                      return esPuntual ? null : <div style={{ fontSize: '14px', color: '#a0aec0' }}>⏳ Todavía no contestó si está todo bien</div>
                    })()}
                  </div>
                  {puedeEditar && !congelado && cambiando !== f.choferId && (
                    <button onClick={() => setCambiando(f.choferId)}
                      style={{ ...BTN, background: sin ? '#c53030' : '#e2e8f0', color: sin ? 'white' : '#333', padding: '10px 14px', flexShrink: 0 }}>
                      {sin ? 'Asignar' : 'Cambiar'}
                    </button>
                  )}
                </div>
                {cambiando === f.choferId && (
                  <div style={{ marginTop: '10px' }}>
                    <select style={IS} defaultValue="" onChange={e => {
                      const val = e.target.value
                      if (val === '') return
                      cambiarAsignacion(f.choferId, val === '__auto' ? null : val === '__sin' ? '' : val)
                    }}>
                      <option value="">Elegí una opción...</option>
                      {f.choferId in manual && <option value="__auto">↩ Volver a lo automático</option>}
                      {disponibles.map(x => <option key={x.id} value={x.id}>{textoOpcion(x)}</option>)}
                      <option value={PROPIO}>Vehículo propio / tercero</option>
                      <option value="__sin">Sin camioneta</option>
                    </select>
                    <button onClick={() => setCambiando(null)} style={{ ...BTN, width: '100%', marginTop: '8px', background: 'transparent', color: '#555', border: '1px solid #ddd' }}>Cancelar</button>
                  </div>
                )}
              </div>
            )
          })}

          {cargado && puedeEditar && !congelado && (
            agregandoOtro ? (
              <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '12px' }}>
                <label style={LABEL}>Chofer</label>
                <select style={{ ...IS, marginBottom: '10px' }} value={otro.choferId} onChange={e => setOtro({ ...otro, choferId: e.target.value })}>
                  <option value="">Elegí el chofer...</option>
                  {choferesSinFila.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.puntual ? ' (puntual)' : ''}</option>)}
                </select>
                <label style={LABEL}>Camioneta</label>
                <select style={{ ...IS, marginBottom: '10px' }} value={otro.vehiculoId} onChange={e => setOtro({ ...otro, vehiculoId: e.target.value })}>
                  <option value="">Elegí la camioneta...</option>
                  {disponibles.map(x => <option key={x.id} value={x.id}>{textoOpcion(x)}</option>)}
                  <option value={PROPIO}>Vehículo propio / tercero</option>
                </select>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={asignarOtro} style={{ ...BTN, flex: 1, background: '#38a169', color: 'white' }}>Asignar</button>
                  <button onClick={() => setAgregandoOtro(false)} style={{ ...BTN, flex: 1, background: '#e2e8f0', color: '#333' }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAgregandoOtro(true)} style={{ ...BTN, width: '100%', marginTop: '8px', background: 'white', color: '#1a1a2e', border: '2px dashed #cbd5e0' }}>
                + Darle camioneta a otro chofer
              </button>
            )
          )}
        </div>
      )}

      {/* ── PESTAÑA CAMIONETAS ── */}
      {pestania === 'camionetas' && (
        <>
          <div style={{ fontSize: '15px', color: '#666', marginBottom: '12px' }}>
            {lista.length} camionetas{enTallerHoy > 0 ? ` · ${enTallerHoy} en taller` : ''} · tocá una para ver sus fallas y daños
          </div>

          {lista.length === 0 && (
            <div style={{ ...CAJA, textAlign: 'center', color: '#666', fontSize: '16px' }}>Todavía no hay camionetas cargadas.</div>
          )}

          {/* Resumen del control quincenal: qué camionetas falta controlar */}
          {puedeControlar && lista.length > 0 && (
            faltanControl.length > 0 ? (
              <div style={{ ...CAJA, border: '2px solid #feb2b2', background: '#fff5f5' }}>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#c53030' }}>
                  📋 Falta el control quincenal de {faltanControl.length === 1 ? '1 camioneta' : `${faltanControl.length} camionetas`}
                </div>
                <div style={{ fontSize: '15px', color: '#555', marginTop: '4px' }}>Tocá una para hacerle el control:</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {faltanControl.map(v => (
                    <button key={v.id} onClick={() => setControlandoId(v.id)}
                      style={{ ...BTN, padding: '10px 14px', background: 'white', color: '#c53030', border: '2px solid #feb2b2' }}>
                      {v.esBackup ? `Backup (${v.numero})` : `Camioneta ${v.numero}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ ...CAJA, background: '#f0fff4', fontSize: '17px', fontWeight: '600', color: '#276749' }}>
                ✅ Todas las camionetas tienen el control quincenal al día
              </div>
            )
          )}

          {lista.map(v => {
            const estado = v.enTaller
              ? { texto: `🔧 En taller desde el ${fechaCorta(v.tallerDesde)}${v.tallerDesdeTurno === 'tarde' ? ' (tarde)' : ''}`, fondo: '#fff5f5', borde: '#feb2b2', color: '#c53030' }
              : v.esBackup
                ? { texto: esTurnoDeAhora && usadaPor[v.id] ? '⭐ Backup en uso' : '⭐ Backup', fondo: '#fffff0', borde: '#f6e05e', color: '#975a16' }
                : { texto: '🟢 Funcionando', fondo: 'white', borde: '#e2e8f0', color: '#276749' }
            const fallas = reportes.filter(r => r.vehiculoId === v.id && r.estado === 'pendiente' && r.tipo === 'falla').length
            const danios = reportes.filter(r => r.vehiculoId === v.id && r.estado === 'pendiente' && r.tipo === 'daño').length
            const pend = [fallas && `${fallas} ${fallas === 1 ? 'falla' : 'fallas'}`, danios && `${danios} ${danios === 1 ? 'daño' : 'daños'}`].filter(Boolean)
            const quien = esTurnoDeAhora ? usadaPor[v.id] : null
            const control = estadoControl(controlesDe(v.id)[0], v)
            return (
              <div key={v.id} onClick={() => setFichaId(v.id)}
                style={{ background: estado.fondo, border: `2px solid ${estado.borde}`, borderRadius: '14px', padding: '14px 16px', marginBottom: '10px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '700' }}>{v.esBackup ? `Backup (${v.numero})` : `Camioneta ${v.numero}`}</div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#555', whiteSpace: 'nowrap' }}>{v.matricula}</div>
                </div>
                <div style={{ fontSize: '16px', marginTop: '4px', color: '#333' }}>
                  {v.esBackup ? (quien ? `Ahora la usa: ${nombreChofer(quien)}` : 'Sin chofer fijo') : `Titular: ${v.choferTitularId ? nombreChofer(v.choferTitularId) : 'sin titular'}`}
                  {!v.esBackup && quien && quien !== v.choferTitularId && <span style={{ color: '#975a16' }}> · hoy la usa {nombreChofer(quien)}</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '16px', fontWeight: '600', color: estado.color }}>{estado.texto}</span>
                  {pend.length > 0 && <span style={{ fontSize: '16px', fontWeight: '600', color: '#c05621' }}>⚠️ {pend.join(' · ')}</span>}
                </div>
                <div style={{ fontSize: '15px', marginTop: '4px', color: control.falta ? '#c53030' : '#718096', fontWeight: control.falta ? '600' : '400' }}>
                  📋 {control.texto}
                </div>
              </div>
            )
          })}

          {puedeEditar && (
            <button onClick={abrirNuevo} style={{ ...BTN, width: '100%', background: 'white', color: '#1a1a2e', border: '2px dashed #cbd5e0', marginTop: '6px' }}>
              + Agregar camioneta
            </button>
          )}
        </>
      )}
    </div>
  )
}
