import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../hooks/useAuth.jsx'

function hoy() {
  return new Date().toISOString().split('T')[0]
}

// Antes de las 12:00 -> mañana, después -> tarde
function turnoActual() {
  return new Date().getHours() < 12 ? 'mañana' : 'tarde'
}

// Un levante/cliente puntual cuenta como "completo" si tiene cliente + ambos horarios + bultos
function levanteCompleto(l) {
  return !!(l.cliente && l.horaLlegada && l.horaSalida && l.bultos)
}

// Una entrega cuenta como "completa" si tiene remitente o destinatario Y la oficina confirmó el remito firmado
function entregaCompleta(e) {
  return !!((e.remitente || e.destinatario) && e.remitoOk)
}

function calcularProgreso(data) {
  const levantesConCliente = (data?.levantes || []).filter(l => l.cliente)
  const puntualesConCliente = (data?.clientesPuntuales || []).filter(l => l.cliente)
  const entregasConDatos = (data?.entregas || []).filter(e => e.remitente || e.destinatario)

  return {
    levantes: { hechos: levantesConCliente.filter(levanteCompleto).length, total: levantesConCliente.length },
    puntuales: { hechos: puntualesConCliente.filter(levanteCompleto).length, total: puntualesConCliente.length },
    entregas: { hechos: entregasConDatos.filter(entregaCompleta).length, total: entregasConDatos.length }
  }
}

function ProgresoLinea({ label, valor }) {
  if (valor.total === 0) return null
  const completo = valor.hechos === valor.total
  return (
    <div style={{ fontSize: '11px', fontWeight: '700', color: completo ? '#38a169' : '#444', whiteSpace: 'nowrap' }}>
      {label} {valor.hechos}/{valor.total}
    </div>
  )
}

export default function Dashboard() {
  const { usuario } = useAuth()
  const navigate = useNavigate()

  const [fecha, setFecha] = useState(() => {
    return sessionStorage.getItem('dashboard_fecha') || hoy()
  })
  const [turno, setTurno] = useState(() => {
    return sessionStorage.getItem('dashboard_turno') || turnoActual()
  })

  function cambiarFecha(nuevaFecha) {
    sessionStorage.setItem('dashboard_fecha', nuevaFecha)
    setFecha(nuevaFecha)
  }

  function cambiarTurno(nuevoTurno) {
    sessionStorage.setItem('dashboard_turno', nuevoTurno)
    setTurno(nuevoTurno)
  }

  function irAHoy() {
    const fechaHoy = hoy()
    sessionStorage.setItem('dashboard_fecha', fechaHoy)
    setFecha(fechaHoy)
  }
  const [choferes, setChoferes] = useState([])
  const [progresoPorChofer, setProgresoPorChofer] = useState({}) // { choferId: { levantes, puntuales, entregas } }
  const [cargando, setCargando] = useState(true)
  const [cargandoProgreso, setCargandoProgreso] = useState(false)

  // Buscador
  const [busqueda, setBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultadosBusqueda, setResultadosBusqueda] = useState(null)

  const esChofer = usuario.rol === 'chofer'
  const esOficina = usuario.rol === 'admin' || usuario.rol === 'operador'

  useEffect(() => {
    async function cargarChoferes() {
      const snap = await getDocs(collection(db, 'choferes'))
      const lista = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.activo)
        .sort((a, b) => (a.orden || 0) - (b.orden || 0))
      setChoferes(lista)
      setCargando(false)
    }
    cargarChoferes()
  }, [])

  useEffect(() => {
    if (esOficina && choferes.length > 0) cargarProgreso()
  }, [fecha, turno, choferes, esOficina])

  async function cargarProgreso() {
    setCargandoProgreso(true)
    try {
      const snap = await getDocs(collection(db, 'planillas', fecha, 'choferes'))
      const mapa = {}
      snap.forEach(docSnap => {
        const parts = docSnap.id.split('_')
        const choferId = parts[0]
        const turnoDoc = parts[1]
        if (turnoDoc !== turno) return
        mapa[choferId] = calcularProgreso(docSnap.data())
      })
      setProgresoPorChofer(mapa)
    } catch {
      setProgresoPorChofer({})
    }
    setCargandoProgreso(false)
  }

  const choferesFiltrados = esChofer
    ? choferes.filter(c => c.id === usuario.choferId)
    : choferes

  // Totales generales sumando todos los choferes del turno seleccionado
  const totales = Object.values(progresoPorChofer).reduce((acc, p) => {
    acc.levantes.hechos += p.levantes.hechos; acc.levantes.total += p.levantes.total
    acc.puntuales.hechos += p.puntuales.hechos; acc.puntuales.total += p.puntuales.total
    acc.entregas.hechos += p.entregas.hechos; acc.entregas.total += p.entregas.total
    return acc
  }, { levantes: { hechos: 0, total: 0 }, puntuales: { hechos: 0, total: 0 }, entregas: { hechos: 0, total: 0 } })

  async function buscarCliente() {
    if (!busqueda.trim()) return
    setBuscando(true)
    setResultadosBusqueda(null)
    const termino = busqueda.trim().toUpperCase()
    const resultados = []

    try {
      const snap = await getDocs(collection(db, 'planillas', hoy(), 'choferes'))
      snap.forEach(docSnap => {
        const data = docSnap.data()
        const parts = docSnap.id.split('_')
        const choferId = parts[0]
        const turnoDoc = parts[1]
        const choferReal = choferes.find(c => c.id === choferId)
        const choferNombre = choferReal ? choferReal.nombre : choferId

        const allLevantes = [
          ...(data.levantes || []).map(l => ({ ...l, seccion: 'Levante' })),
          ...(data.clientesPuntuales || []).map(l => ({ ...l, seccion: 'Cliente puntual' }))
        ]

        allLevantes.forEach((l, idx) => {
          if (l.cliente && l.cliente.toUpperCase().includes(termino)) {
            resultados.push({
              choferId,
              choferNombre,
              turno: turnoDoc,
              cliente: l.cliente,
              seccion: l.seccion,
              horaLlegada: l.horaLlegada,
              horaSalida: l.horaSalida,
              bultos: l.bultos,
              palletDesarmar: l.palletDesarmar
            })
          }
        })
      })
    } catch {}

    setResultadosBusqueda(resultados)
    setBuscando(false)
  }

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Cargando...</div>

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 24px)', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0, color: '#1a1a2e' }}>Planillas del día</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="date"
            value={fecha}
            onChange={e => cambiarFecha(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px' }}
          />
          {fecha !== hoy() && (
            <button
              onClick={irAHoy}
              style={{ padding: '8px 14px', background: '#1976d2', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}
            >
              📅 Ir a hoy
            </button>
          )}
        </div>
      </div>

      {/* SELECTOR DE TURNO + TOTALES — solo oficina */}
      {esOficina && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['mañana', 'tarde'].map(t => (
              <button key={t} onClick={() => cambiarTurno(t)}
                style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', background: turno === t ? '#1a1a2e' : '#e2e8f0', color: turno === t ? 'white' : '#444' }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {cargandoProgreso ? (
              <span style={{ fontSize: '13px', color: '#888' }}>Calculando totales...</span>
            ) : (
              <>
                <ProgresoLinea label="Total Levantes" valor={totales.levantes} />
                <ProgresoLinea label="Total Entregas" valor={totales.entregas} />
                <ProgresoLinea label="Total Puntuales" valor={totales.puntuales} />
              </>
            )}
          </div>
        </div>
      )}

      {/* BUSCADOR — solo para admin/operador */}
      {esOficina && (
        <div style={{ background: 'white', borderRadius: '12px', padding: 'clamp(12px,3vw,20px)', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: '600', color: '#1a1a2e', marginBottom: '10px', fontSize: '14px' }}>
            🔍 Buscar cliente en planillas de hoy
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscarCliente()}
              placeholder="Nombre del cliente..."
              style={{ flex: '1 1 160px', padding: '11px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px', minWidth: 0 }}
            />
            <button
              onClick={buscarCliente}
              disabled={buscando || !busqueda.trim()}
              style={{ padding: '11px 18px', background: busqueda.trim() ? '#1a1a2e' : '#aaa', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: busqueda.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
              {buscando ? '...' : 'Buscar'}
            </button>
            {resultadosBusqueda !== null && (
              <button onClick={() => { setBusqueda(''); setResultadosBusqueda(null) }}
                style={{ padding: '11px 14px', background: '#f0f0f0', color: '#444', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                ✕
              </button>
            )}
          </div>

          {resultadosBusqueda !== null && (
            <div style={{ marginTop: '14px' }}>
              {resultadosBusqueda.length === 0 ? (
                <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>No se encontró "{busqueda}" en las planillas de hoy.</p>
              ) : (
                <>
                  <p style={{ color: '#666', fontSize: '13px', marginBottom: '10px' }}>
                    {resultadosBusqueda.length} resultado{resultadosBusqueda.length !== 1 ? 's' : ''} para "{busqueda}":
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {resultadosBusqueda.map((r, i) => (
                      <div key={i}
                        onClick={() => navigate(`/planilla/${hoy()}/${r.choferId}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#f8f9fa', borderRadius: '8px', cursor: 'pointer', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}
                        onMouseOver={e => e.currentTarget.style.background = '#e8f0fe'}
                        onMouseOut={e => e.currentTarget.style.background = '#f8f9fa'}>
                        <span style={{ fontWeight: '700', color: '#1a1a2e' }}>{r.choferNombre}</span>
                        <span style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', color: '#444' }}>{r.turno}</span>
                        <span style={{ fontWeight: '600', color: '#3182ce' }}>{r.cliente}</span>
                        <span style={{ fontSize: '12px', color: '#888' }}>{r.seccion}</span>
                        {r.horaLlegada && <span style={{ fontSize: '12px', color: '#666' }}>🕐 {r.horaLlegada}{r.horaSalida ? ` → ${r.horaSalida}` : ''}</span>}
                        {r.bultos && <span style={{ fontSize: '12px', color: '#666' }}>📦 {r.bultos} bultos</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ACCIONES RÁPIDAS — solo para admin/operador */}
      {esOficina && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate(`/imprimir/${fecha}`)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'white', color: '#1a1a2e', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            🖨 Imprimir planillas del día
          </button>
          <button
            onClick={() => navigate('/retiros')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'white', color: '#1a1a2e', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            📋 Consultar retiros del turno
          </button>
        </div>
      )}

      {/* GRILLA DE CHOFERES */}
      {choferesFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          No hay choferes activos. Agregá choferes desde el panel de Admin.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px' }}>
          {choferesFiltrados.map(chofer => {
            const progreso = progresoPorChofer[chofer.id]
            return (
              <div
                key={chofer.id}
                onClick={() => navigate(`/planilla/${fecha}/${chofer.id}${esOficina ? `?turno=${turno}` : ''}`)}
                style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', position: 'relative' }}
                onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'}
                onMouseOut={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'}
              >
                {esOficina && progreso && (
                  <div style={{ position: 'absolute', top: '10px', right: '10px', textAlign: 'right' }}>
                    <ProgresoLinea label="Levantes" valor={progreso.levantes} />
                    <ProgresoLinea label="Entregas" valor={progreso.entregas} />
                    <ProgresoLinea label="Puntuales" valor={progreso.puntuales} />
                  </div>
                )}
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🚚</div>
                <div style={{ fontWeight: '600', color: '#1a1a2e' }}>{chofer.nombre}</div>
                <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>{fecha}{esOficina ? ` · ${turno}` : ''}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
