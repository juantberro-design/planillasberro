import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../hooks/useAuth.jsx'

// ─────────────────────────────────────────────────────────────
// Pantalla de SEGUIMIENTO (rol "supervisor").
// Es SOLO LECTURA: acá no hay ningún setDoc / updateDoc / addDoc.
// Solo escucha los datos en tiempo real y los muestra.
// ─────────────────────────────────────────────────────────────

// Fecha de hoy según la hora de Uruguay (no la de Londres), en formato AAAA-MM-DD
function fechaLocal(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

// Suma (o resta) días a una fecha AAAA-MM-DD
function sumarDias(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number)
  return fechaLocal(new Date(y, m - 1, d + dias))
}

// "2026-11-03" -> "Martes 03/11"
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
function fechaLinda(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  const nombre = DIAS[new Date(y, m - 1, d).getDay()]
  return `${nombre} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

function turnoActual() {
  return new Date().getHours() < 12 ? 'mañana' : 'tarde'
}

const tieneValor = v => v !== undefined && v !== null && String(v).trim() !== ''

// Entrega: cuenta si tiene remitente o destinatario.
// Está HECHA cuando el chofer marcó el tilde amarillo (o la oficina ya confirmó el remito).
const entregaCargada = e => tieneValor(e.remitente) || tieneValor(e.destinatario)
const entregaHecha = e => !!(e.ok || e.remitoOk)

// Retiro (levante o puntual): cuenta si tiene cliente.
// Está HECHO cuando el chofer cargó los bultos.
const retiroCargado = r => tieneValor(r.cliente)
const retiroHecho = r => tieneValor(r.bultos)

// Arma las listas limpias de una planilla
function resumir(data) {
  const entregas = (data?.entregas || []).filter(entregaCargada)
  const retiros = [
    ...(data?.levantes || []).filter(retiroCargado).map(r => ({ ...r, puntual: false })),
    ...(data?.clientesPuntuales || []).filter(retiroCargado).map(r => ({ ...r, puntual: true }))
  ]
  const devoluciones = (data?.devoluciones || []).filter(d => tieneValor(d.cliente) || tieneValor(d.cantidad))
  return {
    entregas,
    retiros,
    devoluciones,
    entregasHechas: entregas.filter(entregaHecha).length,
    retirosHechos: retiros.filter(retiroHecho).length
  }
}

// Color de la tarjeta según el avance
function estado(r) {
  const total = r.entregas.length + r.retiros.length
  const hechos = r.entregasHechas + r.retirosHechos
  if (total === 0) return 'vacio'
  if (hechos === total) return 'terminado'
  if (hechos > 0) return 'enCurso'
  return 'sinEmpezar'
}

const COLORES = {
  terminado:  { fondo: '#e6f6ec', borde: '#38a169', texto: '#1c6b3a', etiqueta: '✅ Terminó' },
  enCurso:    { fondo: '#fff8e1', borde: '#f0b429', texto: '#7a5a00', etiqueta: '🚚 En recorrido' },
  sinEmpezar: { fondo: 'white',   borde: '#e2e8f0', texto: '#1a1a2e', etiqueta: '⏳ Sin empezar' },
  vacio:      { fondo: '#f5f5f5', borde: '#e2e8f0', texto: '#999',    etiqueta: 'Sin tareas cargadas' }
}

const RESUMEN_VACIO = { entregas: [], retiros: [], devoluciones: [], entregasHechas: 0, retirosHechos: 0 }

export default function Seguimiento() {
  const { usuario } = useAuth()
  // Los operadores NO ven la carga estimada (los confunde). La ven admin, supervisor y coordinador.
  const verEstimado = usuario?.rol !== 'operador'
  const [searchParams, setSearchParams] = useSearchParams()
  const fecha = searchParams.get('fecha') || fechaLocal()
  const turno = searchParams.get('turno') === 'tarde' ? 'tarde'
    : searchParams.get('turno') === 'mañana' ? 'mañana'
    : turnoActual()
  const choferSeleccionado = searchParams.get('chofer')

  const [todosChoferes, setTodosChoferes] = useState([])
  const [planillas, setPlanillas] = useState({}) // { choferId: datos de la planilla }
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  // Cambiar fecha o turno reemplaza la dirección (no suma pasos al botón "atrás" del celular)
  function cambiarFiltro(nuevaFecha, nuevoTurno) {
    setSearchParams({ fecha: nuevaFecha, turno: nuevoTurno }, { replace: true })
  }
  // Abrir un chofer SÍ suma un paso, así el botón "atrás" del celular vuelve a la lista
  function abrirChofer(id) {
    setSearchParams({ fecha, turno, chofer: id })
  }
  function volver() {
    window.history.back()
  }

  // Lista de choferes en tiempo real
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'choferes'),
      snap => setTodosChoferes(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setError('No se pudieron cargar los choferes. Revisá la conexión a internet.')
    )
    return () => unsub()
  }, [])

  // Planillas del día y turno elegidos, en tiempo real
  useEffect(() => {
    setCargando(true)
    setError('')
    const unsub = onSnapshot(
      collection(db, 'planillas', fecha, 'choferes'),
      snap => {
        const mapa = {}
        snap.forEach(d => {
          const [choferId, turnoDoc] = d.id.split('_')
          if (turnoDoc === turno) mapa[choferId] = d.data()
        })
        setPlanillas(mapa)
        setCargando(false)
      },
      () => {
        setError('No se pudieron cargar las planillas. Revisá la conexión a internet.')
        setCargando(false)
      }
    )
    return () => unsub()
  }, [fecha, turno])

  // Mismos choferes que ve la oficina: fijos activos + puntuales de este día/turno.
  // Además, cualquier otro chofer que tenga planilla ese día (por ejemplo, uno que después se desactivó).
  const fijos = todosChoferes
    .filter(c => !c.puntual && c.activo)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0))
  const puntuales = todosChoferes
    .filter(c => c.puntual && c.fecha === fecha && c.turno === turno)
    .sort((a, b) => (a.creadoAt || 0) - (b.creadoAt || 0))
  const listados = new Set([...fijos, ...puntuales].map(c => c.id))
  const otrosConPlanilla = todosChoferes.filter(c => !listados.has(c.id) && planillas[c.id])
  const choferes = [...fijos, ...puntuales, ...otrosConPlanilla]

  const contenedor = { padding: '12px', maxWidth: '640px', margin: '0 auto', boxSizing: 'border-box' }

  // ───────────── DETALLE DE UN CHOFER ─────────────
  if (choferSeleccionado) {
    const chofer = todosChoferes.find(c => c.id === choferSeleccionado)
    const r = planillas[choferSeleccionado] ? resumir(planillas[choferSeleccionado]) : RESUMEN_VACIO
    return (
      <div style={contenedor}>
        <BotonGrande onClick={volver}>← Volver a la lista</BotonGrande>

        <div style={{ margin: '14px 0 4px', fontSize: '22px', fontWeight: '700', color: '#1a1a2e' }}>
          {chofer?.nombre || 'Chofer'}
        </div>
        <div style={{ color: '#666', fontSize: '15px', marginBottom: '14px' }}>
          {fechaLinda(fecha)} · Turno {turno}
        </div>

        {error && <Aviso>{error}</Aviso>}

        {!cargando && r.entregas.length === 0 && r.retiros.length === 0 && r.devoluciones.length === 0 && (
          <Aviso>Este chofer no tiene tareas cargadas para este día y turno.</Aviso>
        )}

        {r.retiros.length > 0 && (
          <Seccion titulo="📥 Retiros" hechos={r.retirosHechos} total={r.retiros.length}>
            {r.retiros.map((ret, i) => {
              const hecho = retiroHecho(ret)
              return (
                <Tarjeta key={i} hecho={hecho}>
                  <FilaTitulo
                    titulo={ret.cliente}
                    estado={hecho ? '✅ Retirado' : '⏳ Pendiente'}
                    colorEstado={hecho ? '#38a169' : '#888'}
                  />
                  {ret.puntual && <Dato>Cliente puntual</Dato>}
                  {verEstimado && (tieneValor(ret.estPallets) || tieneValor(ret.estBultos)) && (
                    <Dato color="#2c5282"><b>Carga estimada:</b> {[
                      tieneValor(ret.estPallets) && `${ret.estPallets} pallets`,
                      tieneValor(ret.estBultos) && `${ret.estBultos} bultos`
                    ].filter(Boolean).join(' · ')}</Dato>
                  )}
                  {hecho && <Dato><b>Bultos:</b> {ret.bultos}</Dato>}
                  {tieneValor(ret.palletDesarmar) && <Dato><b>Pallets a desarmar:</b> {ret.palletDesarmar}</Dato>}
                  {tieneValor(ret.comChofer) && <Dato><b>Comentario chofer:</b> {ret.comChofer}</Dato>}
                  {tieneValor(ret.comOficina) && <Dato><b>Comentario oficina:</b> {ret.comOficina}</Dato>}
                  {ret.controlOk && <Dato color="#3182ce">✔ Controlado por la oficina</Dato>}
                </Tarjeta>
              )
            })}
          </Seccion>
        )}

        {r.entregas.length > 0 && (
          <Seccion titulo="📦 Entregas" hechos={r.entregasHechas} total={r.entregas.length}>
            {r.entregas.map((e, i) => {
              const hecha = entregaHecha(e)
              const textoEstado = e.remitoOk ? '✅ Remito OK' : e.ok ? '🟡 Entregada' : '⏳ Pendiente'
              const colorEstado = e.remitoOk ? '#38a169' : e.ok ? '#b7791f' : '#888'
              return (
                <Tarjeta key={e.id || i} hecho={hecha}>
                  <FilaTitulo titulo={e.destinatario || e.remitente} estado={textoEstado} colorEstado={colorEstado} />
                  {tieneValor(e.remitente) && tieneValor(e.destinatario) && <Dato><b>Remitente:</b> {e.remitente}</Dato>}
                  {tieneValor(e.bultos) && <Dato><b>Bultos:</b> {e.bultos}</Dato>}
                  {tieneValor(e.aCobrar) && <Dato><b>A cobrar:</b> {e.aCobrar}</Dato>}
                  {tieneValor(e.remito) && <Dato><b>Remito:</b> {e.remito}</Dato>}
                  {tieneValor(e.comentarios) && <Dato><b>Comentario:</b> {e.comentarios}</Dato>}
                </Tarjeta>
              )
            })}
          </Seccion>
        )}

        {r.devoluciones.length > 0 && (
          <Seccion titulo="🔄 Devolución de pallets">
            {r.devoluciones.map((d, i) => (
              <Tarjeta key={i}>
                <FilaTitulo titulo={d.cliente || 'Sin cliente'} />
                {tieneValor(d.cantidad) && <Dato><b>Cantidad:</b> {d.cantidad}</Dato>}
              </Tarjeta>
            ))}
          </Seccion>
        )}
      </div>
    )
  }

  // ───────────── LISTA DE CHOFERES ─────────────
  const esHoy = fecha === fechaLocal()

  return (
    <div style={contenedor}>
      {/* Fecha: flechas grandes para moverse de a un día */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <BotonFlecha onClick={() => cambiarFiltro(sumarDias(fecha, -1), turno)}>◀</BotonFlecha>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e' }}>{fechaLinda(fecha)}</div>
          {esHoy && <div style={{ fontSize: '13px', color: '#38a169', fontWeight: '600' }}>Hoy</div>}
        </div>
        <BotonFlecha onClick={() => cambiarFiltro(sumarDias(fecha, 1), turno)}>▶</BotonFlecha>
      </div>

      {!esHoy && (
        <BotonGrande onClick={() => cambiarFiltro(fechaLocal(), turno)}>Volver a hoy</BotonGrande>
      )}

      {/* Turno */}
      <div style={{ display: 'flex', gap: '8px', margin: '10px 0 16px' }}>
        {['mañana', 'tarde'].map(t => (
          <button key={t} onClick={() => cambiarFiltro(fecha, t)}
            style={{
              flex: 1, padding: '14px', fontSize: '17px', fontWeight: '600', borderRadius: '10px', cursor: 'pointer',
              border: turno === t ? '2px solid #1a1a2e' : '1px solid #ddd',
              background: turno === t ? '#1a1a2e' : 'white',
              color: turno === t ? 'white' : '#1a1a2e'
            }}>
            {t === 'mañana' ? '☀️ Mañana' : '🌙 Tarde'}
          </button>
        ))}
      </div>

      {error && <Aviso>{error}</Aviso>}
      {cargando && !error && <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>Cargando...</div>}

      {!cargando && choferes.map(chofer => {
        const r = planillas[chofer.id] ? resumir(planillas[chofer.id]) : RESUMEN_VACIO
        const est = estado(r)
        const c = COLORES[est]
        return (
          <button key={chofer.id} onClick={() => abrirChofer(chofer.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
              background: c.fondo, border: `2px solid ${c.borde}`, borderRadius: '12px',
              padding: '14px 16px', marginBottom: '10px', boxSizing: 'border-box'
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '19px', fontWeight: '700', color: c.texto }}>
                {chofer.nombre}{chofer.puntual ? ' (puntual)' : ''}
              </span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: c.texto, whiteSpace: 'nowrap' }}>{c.etiqueta}</span>
            </div>
            {est !== 'vacio' && (
              <div style={{ display: 'flex', gap: '18px', marginTop: '8px', fontSize: '16px', color: c.texto }}>
                {r.retiros.length > 0 && <span>📥 Retiros <b>{r.retirosHechos}/{r.retiros.length}</b></span>}
                {r.entregas.length > 0 && <span>📦 Entregas <b>{r.entregasHechas}/{r.entregas.length}</b></span>}
              </div>
            )}
          </button>
        )
      })}

      {!cargando && choferes.length === 0 && !error && (
        <Aviso>No hay choferes para mostrar.</Aviso>
      )}
    </div>
  )
}

// ───────────── Piezas visuales ─────────────

function BotonGrande({ onClick, children }) {
  return (
    <button onClick={onClick}
      style={{ width: '100%', padding: '14px', fontSize: '17px', fontWeight: '600', background: 'white', color: '#1a1a2e', border: '1px solid #ccc', borderRadius: '10px', cursor: 'pointer' }}>
      {children}
    </button>
  )
}

function BotonFlecha({ onClick, children }) {
  return (
    <button onClick={onClick}
      style={{ width: '56px', height: '56px', fontSize: '22px', background: 'white', border: '1px solid #ccc', borderRadius: '10px', cursor: 'pointer', flexShrink: 0 }}>
      {children}
    </button>
  )
}

function Aviso({ children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', color: '#666', fontSize: '15px', textAlign: 'center', marginBottom: '12px' }}>
      {children}
    </div>
  )
}

function Seccion({ titulo, hechos, total, children }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a2e', marginBottom: '8px' }}>
        {titulo}
        {total !== undefined && (
          <span style={{ fontWeight: '600', color: hechos === total ? '#38a169' : '#666', marginLeft: '8px' }}>
            {hechos}/{total}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function Tarjeta({ hecho, children }) {
  return (
    <div style={{
      background: hecho ? '#f3faf5' : 'white',
      border: `1px solid ${hecho ? '#bfe5cb' : '#e2e8f0'}`,
      borderRadius: '10px', padding: '12px 14px', marginBottom: '8px'
    }}>
      {children}
    </div>
  )
}

function FilaTitulo({ titulo, estado, colorEstado }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e' }}>{titulo}</span>
      {estado && <span style={{ fontSize: '14px', fontWeight: '600', color: colorEstado, whiteSpace: 'nowrap' }}>{estado}</span>}
    </div>
  )
}

function Dato({ children, color = '#444' }) {
  return <div style={{ fontSize: '15px', color, marginTop: '4px' }}>{children}</div>
}
