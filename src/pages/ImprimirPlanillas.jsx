import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

function tieneAlgo(data) {
  if (!data) return false
  const hayEnLista = (lista, campos) => (lista || []).some(item => campos.some(c => item[c]))
  return (
    hayEnLista(data.entregas, ['remitente', 'destinatario', 'bultos', 'comentarios']) ||
    hayEnLista(data.levantes, ['cliente']) ||
    hayEnLista(data.clientesPuntuales, ['cliente']) ||
    hayEnLista(data.devoluciones, ['cliente', 'cantidad'])
  )
}

function fechaLegible(fechaStr) {
  const [y, m, d] = fechaStr.split('-').map(Number)
  return `${d}/${m}/${y}`
}

const thS = { border: '1px solid #999', padding: '4px 6px', fontSize: '11px', background: '#eee', textAlign: 'left' }
const tdS = { border: '1px solid #999', padding: '4px 6px', fontSize: '11px' }

export default function ImprimirPlanillas() {
  const { fecha } = useParams()
  const navigate = useNavigate()

  const [hojasDisponibles, setHojasDisponibles] = useState([])
  const [cargando, setCargando] = useState(true)

  // Selección previa a imprimir
  const [vista, setVista] = useState('seleccion') // 'seleccion' | 'preview'
  const [turnoFiltro, setTurnoFiltro] = useState('ambos') // 'mañana' | 'tarde' | 'ambos'
  const [seleccionados, setSeleccionados] = useState({}) // { 'choferId_turno': true/false }

  useEffect(() => {
    cargarTodo()
  }, [fecha])

  async function cargarTodo() {
    setCargando(true)
    const [snapChoferes, snapPlanillas] = await Promise.all([
      getDocs(collection(db, 'choferes')),
      getDocs(collection(db, 'planillas', fecha, 'choferes'))
    ])

    const choferesMap = {}
    snapChoferes.forEach(d => { choferesMap[d.id] = d.data().nombre })

    const resultado = []
    snapPlanillas.forEach(docSnap => {
      const data = docSnap.data()
      if (!tieneAlgo(data)) return
      const parts = docSnap.id.split('_')
      const choferId = parts[0]
      const turno = parts[1]
      resultado.push({
        id: docSnap.id,
        choferId,
        turno,
        choferNombre: choferesMap[choferId] || choferId,
        data
      })
    })

    resultado.sort((a, b) => {
      if (a.choferNombre !== b.choferNombre) return a.choferNombre.localeCompare(b.choferNombre)
      return a.turno === 'mañana' ? -1 : 1
    })

    setHojasDisponibles(resultado)
    // Por defecto todas seleccionadas
    const sel = {}
    resultado.forEach(h => { sel[h.id] = true })
    setSeleccionados(sel)
    setCargando(false)
  }

  function toggleSeleccionado(id) {
    setSeleccionados(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function seleccionarTodos(valor) {
    const sel = {}
    hojasFiltradasPorTurno.forEach(h => { sel[h.id] = valor })
    setSeleccionados(sel)
  }

  const hojasFiltradasPorTurno = hojasDisponibles.filter(h => turnoFiltro === 'ambos' || h.turno === turnoFiltro)
  const hojasAImprimir = hojasFiltradasPorTurno.filter(h => seleccionados[h.id])

  function imprimir() {
    window.print()
  }

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando planillas...</div>

  // ---------- PANTALLA DE SELECCIÓN ----------
  if (vista === 'seleccion') {
    return (
      <div style={{ padding: 'clamp(12px,4vw,24px)', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '4px' }}>←</button>
          <h2 style={{ margin: 0, color: '#1a1a2e' }}>Imprimir planillas — {fechaLegible(fecha)}</h2>
        </div>

        {hojasDisponibles.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#888', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            No hay planillas con datos cargados para el {fechaLegible(fecha)}.
          </div>
        ) : (
          <>
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '8px' }}>Turno</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[['ambos', 'Todos'], ['mañana', 'Mañana'], ['tarde', 'Tarde']].map(([v, l]) => (
                  <button key={v} onClick={() => setTurnoFiltro(v)}
                    style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', background: turnoFiltro === v ? '#1a1a2e' : '#e2e8f0', color: turnoFiltro === v ? 'white' : '#444' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '20px' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <strong style={{ color: '#1a1a2e', fontSize: '14px' }}>Elegí las planillas a imprimir</strong>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => seleccionarTodos(true)} style={{ fontSize: '12px', padding: '5px 10px', background: '#ebf8ff', color: '#3182ce', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Marcar todas</button>
                  <button onClick={() => seleccionarTodos(false)} style={{ fontSize: '12px', padding: '5px 10px', background: '#f0f0f0', color: '#666', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Desmarcar todas</button>
                </div>
              </div>
              {hojasFiltradasPorTurno.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '14px' }}>
                  No hay planillas para ese turno.
                </div>
              ) : (
                hojasFiltradasPorTurno.map(h => (
                  <label key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!seleccionados[h.id]}
                      onChange={() => toggleSeleccionado(h.id)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: '600', color: '#1a1a2e' }}>{h.choferNombre}</span>
                    <span style={{ fontSize: '12px', textTransform: 'capitalize', background: '#e2e8f0', padding: '2px 10px', borderRadius: '10px' }}>{h.turno}</span>
                  </label>
                ))
              )}
            </div>

            <button
              onClick={() => setVista('preview')}
              disabled={hojasAImprimir.length === 0}
              style={{ width: '100%', padding: '14px', background: hojasAImprimir.length > 0 ? '#1a1a2e' : '#aaa', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: hojasAImprimir.length > 0 ? 'pointer' : 'not-allowed' }}>
              Continuar con {hojasAImprimir.length} planilla{hojasAImprimir.length !== 1 ? 's' : ''}
            </button>
          </>
        )}
      </div>
    )
  }

  // ---------- VISTA PREVIA / IMPRESIÓN ----------
  return (
    <div style={{ background: '#f0f2f5', minHeight: '100vh' }}>
      <div className="no-imprimir" style={{
        position: 'sticky', top: 0, background: 'white', padding: '14px 20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', zIndex: 10, flexWrap: 'wrap', gap: '10px'
      }}>
        <div>
          <button onClick={() => setVista('seleccion')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', marginRight: '12px' }}>← Volver a elegir</button>
          <strong>Planillas para imprimir — {fechaLegible(fecha)}</strong>
          <span style={{ marginLeft: '10px', color: '#666', fontSize: '13px' }}>({hojasAImprimir.length} hoja{hojasAImprimir.length !== 1 ? 's' : ''})</span>
        </div>
        <button onClick={imprimir}
          style={{ padding: '10px 24px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          🖨 Imprimir
        </button>
      </div>

      {hojasAImprimir.map((hoja, idx) => (
        <div key={idx} className="hoja-imprimir" style={{
          background: 'white', maxWidth: '780px', margin: '20px auto', padding: '24px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)', pageBreakAfter: 'always'
        }}>
          {/* ENCABEZADO */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px', borderBottom: '2px solid #1a1a2e', paddingBottom: '10px' }}>
            <img src="/logo-berro.png" alt="Transportes Berro" style={{ height: '48px', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none' }} />
            <div>
              <div style={{ fontWeight: '700', fontSize: '16px', color: '#1a1a2e' }}>
                Planilla de retiros — {hoja.choferNombre} — {fechaLegible(fecha)} — Turno {hoja.turno.charAt(0).toUpperCase() + hoja.turno.slice(1)}
              </div>
            </div>
          </div>

          {/* ENTREGAS */}
          {(hoja.data.entregas || []).some(e => e.remitente || e.destinatario) && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '12px', marginBottom: '4px', textTransform: 'uppercase', color: '#444' }}>Entregas</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Remitente','Destinatario','A cobrar','Bultos','N° remito','Comentarios'].map(h => <th key={h} style={thS}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {hoja.data.entregas.filter(e => e.remitente || e.destinatario).map((e, i) => (
                    <tr key={i}>
                      <td style={tdS}>{e.remitente}</td>
                      <td style={tdS}>{e.destinatario}</td>
                      <td style={tdS}>{e.aCobrar}</td>
                      <td style={tdS}>{e.bultos}</td>
                      <td style={tdS}>{e.remito}</td>
                      <td style={tdS}>{e.comentarios}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* LEVANTES */}
          {(hoja.data.levantes || []).some(l => l.cliente) && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '12px', marginBottom: '4px', textTransform: 'uppercase', color: '#444' }}>Levantes</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Cliente','Llegada','Salida','Bultos','Pallets','Com. chofer','Com. oficina'].map(h => <th key={h} style={thS}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {hoja.data.levantes.filter(l => l.cliente).map((l, i) => (
                    <tr key={i}>
                      <td style={tdS}>{l.cliente}</td>
                      <td style={tdS}>{l.horaLlegada}</td>
                      <td style={tdS}>{l.horaSalida}</td>
                      <td style={tdS}>{l.bultos}</td>
                      <td style={tdS}>{l.palletDesarmar}</td>
                      <td style={tdS}>{l.comChofer}</td>
                      <td style={tdS}>{l.comOficina}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CLIENTES PUNTUALES */}
          {(hoja.data.clientesPuntuales || []).some(l => l.cliente) && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '12px', marginBottom: '4px', textTransform: 'uppercase', color: '#444' }}>Clientes puntuales</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Cliente','Llegada','Salida','Bultos','Pallets','Com. chofer','Com. oficina'].map(h => <th key={h} style={thS}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {hoja.data.clientesPuntuales.filter(l => l.cliente).map((l, i) => (
                    <tr key={i}>
                      <td style={tdS}>{l.cliente}</td>
                      <td style={tdS}>{l.horaLlegada}</td>
                      <td style={tdS}>{l.horaSalida}</td>
                      <td style={tdS}>{l.bultos}</td>
                      <td style={tdS}>{l.palletDesarmar}</td>
                      <td style={tdS}>{l.comChofer}</td>
                      <td style={tdS}>{l.comOficina}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* DEVOLUCIÓN PALLETS */}
          {(hoja.data.devoluciones || []).some(d => d.cliente) && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '12px', marginBottom: '4px', textTransform: 'uppercase', color: '#444' }}>Devolución de pallets</div>
              <table style={{ width: '50%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Cliente','Cantidad'].map(h => <th key={h} style={thS}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {hoja.data.devoluciones.filter(d => d.cliente).map((d, i) => (
                    <tr key={i}>
                      <td style={tdS}>{d.cliente}</td>
                      <td style={tdS}>{d.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <style>{`
        @media print {
          .no-imprimir { display: none !important; }
          body { background: white !important; }
          .hoja-imprimir { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
        }
      `}</style>
    </div>
  )
}
