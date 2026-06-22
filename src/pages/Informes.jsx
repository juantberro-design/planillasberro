import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

function hoy() { return new Date().toISOString().split('T')[0] }
function haceUnMes() {
  const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().split('T')[0]
}

function minutosEntre(llegada, salida) {
  if (!llegada || !salida) return null
  const [lh, lm] = llegada.split(':').map(Number)
  const [sh, sm] = salida.split(':').map(Number)
  const diff = (sh * 60 + sm) - (lh * 60 + lm)
  return diff > 0 ? diff : null
}

function formatMinutos(min) {
  if (min === null || min === undefined) return '-'
  return `${Math.floor(min)}m`
}

async function fetchDatos(desde, hasta) {
  const registros = []
  let fechaActual = new Date(desde)
  const fechaFin = new Date(hasta)
  while (fechaActual <= fechaFin) {
    const fechaStr = fechaActual.toISOString().split('T')[0]
    try {
      const snap = await getDocs(collection(db, 'planillas', fechaStr, 'choferes'))
      snap.forEach(docSnap => {
        const data = docSnap.data()
        const parts = docSnap.id.split('_')
        const choferId = parts[0]
        const turno = parts[1]
        registros.push({ fecha: fechaStr, choferId, turno, choferNombre: data.modificadoNombre || choferId, ...data })
      })
    } catch {}
    fechaActual.setDate(fechaActual.getDate() + 1)
  }
  return registros
}

const card = { background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }
const thS = { padding: '10px 14px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666', borderBottom: '2px solid #e2e8f0' }
const tdS = { padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: '14px' }
const LS = { fontSize: '13px', color: '#666', marginBottom: '5px', display: 'block' }

export default function Informes() {
  const [vista, setVista] = useState('chofer')
  const [modo, setModo] = useState('rango') // 'dia' | 'rango'
  const [fecha, setFecha] = useState(hoy())
  const [desde, setDesde] = useState(haceUnMes())
  const [hasta, setHasta] = useState(hoy())
  const [choferes, setChoferes] = useState([])
  const [clientes, setClientes] = useState([])
  const [choferFiltro, setChoferFiltro] = useState('')
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [resultados, setResultados] = useState(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    async function cargar() {
      const [sc, sk] = await Promise.all([
        getDocs(collection(db, 'choferes')),
        getDocs(collection(db, 'clientes'))
      ])
      setChoferes(sc.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.orden||0)-(b.orden||0)))
      setClientes(sk.docs.map(d => d.data().nombre).sort())
    }
    cargar()
  }, [])

  async function generar() {
    setCargando(true)
    setResultados(null)
    const desdeFinal = modo === 'dia' ? fecha : desde
    const hastaFinal = modo === 'dia' ? fecha : hasta
    const registros = await fetchDatos(desdeFinal, hastaFinal)

    if (vista === 'chofer') {
      generarInformeChofer(registros, desdeFinal, hastaFinal)
    } else {
      generarInformeCliente(registros)
    }
    setCargando(false)
  }

  function generarInformeChofer(registros, desdeFinal, hastaFinal) {
    const filtrados = choferFiltro ? registros.filter(r => r.choferId === choferFiltro) : registros

    // Agrupar por chofer
    const porChofer = {}
    filtrados.forEach(r => {
      const nombre = r.choferNombre || r.choferId
      if (!porChofer[r.choferId]) {
        porChofer[r.choferId] = { nombre, dias: new Set(), visitas: 0, bultosTotales: 0, palletsTotales: 0, tiempos: [], clientesVisitados: {} }
      }
      const c = porChofer[r.choferId]
      c.dias.add(r.fecha)

      const allLevantes = [...(r.levantes||[]), ...(r.clientesPuntuales||[])]
      allLevantes.forEach(l => {
        if (!l.cliente) return
        c.visitas++
        c.bultosTotales += Number(l.bultos)||0
        c.palletsTotales += Number(l.palletDesarmar)||0
        const mins = minutosEntre(l.horaLlegada, l.horaSalida)
        if (mins !== null) c.tiempos.push(mins)
        if (!c.clientesVisitados[l.cliente]) c.clientesVisitados[l.cliente] = 0
        c.clientesVisitados[l.cliente]++
      })
    })

    const filas = Object.values(porChofer).map(c => ({
      nombre: c.nombre,
      diasTrabajados: c.dias.size,
      visitas: c.visitas,
      bultosTotales: c.bultosTotales,
      bultosPromedio: c.visitas > 0 ? (c.bultosTotales / c.visitas).toFixed(1) : '-',
      palletsTotales: c.palletsTotales,
      tiempoPromedio: c.tiempos.length > 0 ? formatMinutos(c.tiempos.reduce((a,b)=>a+b,0)/c.tiempos.length) : '-',
      clienteTop: Object.entries(c.clientesVisitados).sort((a,b)=>b[1]-a[1])[0]?.[0] || '-'
    })).sort((a,b) => b.bultosTotales - a.bultosTotales)

    setResultados({ tipo: 'chofer', filas, desdeFinal, hastaFinal, choferDetalle: choferFiltro ? porChofer[choferFiltro] : null, registros: filtrados })
  }

  function generarInformeCliente(registros) {
    const porCliente = {}

    registros.forEach(r => {
      const allLevantes = [...(r.levantes||[]), ...(r.clientesPuntuales||[])]
      allLevantes.forEach(l => {
        if (!l.cliente) return
        if (clienteFiltro && l.cliente !== clienteFiltro) return
        if (!porCliente[l.cliente]) {
          porCliente[l.cliente] = { visitas: 0, bultosTotales: 0, tiempos: [], choferes: {}, fechas: [] }
        }
        const c = porCliente[l.cliente]
        c.visitas++
        c.bultosTotales += Number(l.bultos)||0
        const mins = minutosEntre(l.horaLlegada, l.horaSalida)
        if (mins !== null) c.tiempos.push(mins)
        const choferNombre = r.choferNombre || r.choferId
        if (!c.choferes[choferNombre]) c.choferes[choferNombre] = 0
        c.choferes[choferNombre]++
        c.fechas.push({ fecha: r.fecha, chofer: choferNombre, bultos: l.bultos, horaLlegada: l.horaLlegada, horaSalida: l.horaSalida, mins })
      })
    })

    const filas = Object.entries(porCliente).map(([nombre, c]) => ({
      nombre,
      visitas: c.visitas,
      bultosTotales: c.bultosTotales,
      bultosPromedio: c.visitas > 0 ? (c.bultosTotales / c.visitas).toFixed(1) : '-',
      tiempoPromedio: c.tiempos.length > 0 ? formatMinutos(c.tiempos.reduce((a,b)=>a+b,0)/c.tiempos.length) : '-',
      tiempoTotal: c.tiempos.length > 0 ? formatMinutos(c.tiempos.reduce((a,b)=>a+b,0)) : '-',
      choferes: Object.entries(c.choferes).sort((a,b)=>b[1]-a[1]).map(([n,v])=>`${n} (${v})`).join(', '),
      detalle: c.fechas.sort((a,b)=>a.fecha.localeCompare(b.fecha))
    })).sort((a,b) => b.visitas - a.visitas)

    setResultados({ tipo: 'cliente', filas, clienteFiltro })
  }

  const tabStyle = (active) => ({
    padding: '10px 20px', background: active ? '#1a1a2e' : '#e2e8f0',
    color: active ? 'white' : '#444', border: 'none', borderRadius: '8px',
    cursor: 'pointer', fontWeight: '600', fontSize: '14px'
  })

  return (
    <div style={{ padding: 'clamp(12px,4vw,24px)', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 24px', color: '#1a1a2e' }}>Informes</h2>

      {/* Tipo de informe */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button style={tabStyle(vista==='chofer')} onClick={() => { setVista('chofer'); setResultados(null) }}>🚚 Por chofer</button>
        <button style={tabStyle(vista==='cliente')} onClick={() => { setVista('cliente'); setResultados(null) }}>🏢 Por cliente</button>
      </div>

      {/* Filtros */}
      <div style={{ ...card, marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* Modo dia vs rango */}
          <div>
            <label style={LS}>Período</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[['dia','Día puntual'],['rango','Rango de fechas']].map(([v,l]) => (
                <button key={v} onClick={() => setModo(v)}
                  style={{ padding: '7px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', background: modo===v?'#1a1a2e':'#e2e8f0', color: modo===v?'white':'#444' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {modo === 'dia' ? (
            <div>
              <label style={LS}>Fecha</label>
              <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}
                style={{ padding:'8px 12px', border:'1px solid #ddd', borderRadius:'8px', fontSize:'14px' }} />
            </div>
          ) : (
            <>
              <div>
                <label style={LS}>Desde</label>
                <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
                  style={{ padding:'8px 12px', border:'1px solid #ddd', borderRadius:'8px', fontSize:'14px' }} />
              </div>
              <div>
                <label style={LS}>Hasta</label>
                <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
                  style={{ padding:'8px 12px', border:'1px solid #ddd', borderRadius:'8px', fontSize:'14px' }} />
              </div>
            </>
          )}

          {vista === 'chofer' && (
            <div>
              <label style={LS}>Chofer (opcional)</label>
              <select value={choferFiltro} onChange={e=>setChoferFiltro(e.target.value)}
                style={{ padding:'8px 12px', border:'1px solid #ddd', borderRadius:'8px', fontSize:'14px', minWidth:'160px' }}>
                <option value="">Todos</option>
                {choferes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}

          {vista === 'cliente' && (
            <div>
              <label style={LS}>Cliente (opcional)</label>
              <select value={clienteFiltro} onChange={e=>setClienteFiltro(e.target.value)}
                style={{ padding:'8px 12px', border:'1px solid #ddd', borderRadius:'8px', fontSize:'14px', minWidth:'160px' }}>
                <option value="">Todos</option>
                {clientes.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          <button onClick={generar} disabled={cargando}
            style={{ padding:'9px 24px', background: cargando?'#aaa':'#1a1a2e', color:'white', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'600', cursor: cargando?'not-allowed':'pointer' }}>
            {cargando ? 'Generando...' : 'Generar informe'}
          </button>
        </div>
      </div>

      {/* RESULTADOS - Por Chofer */}
      {resultados?.tipo === 'chofer' && (
        <div>
          <div style={{ ...card, marginBottom: '20px', overflow: 'hidden', padding: 0 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: '600', color: '#1a1a2e' }}>
              Resumen por chofer
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#f8f9fa' }}>
                    {['Chofer','Días trabajados','Visitas','Bultos totales','Promedio bultos/visita','Pallets a desarmar','Tiempo prom. por cliente','Cliente más frecuente'].map(h => (
                      <th key={h} style={thS}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultados.filas.length === 0 ? (
                    <tr><td colSpan={8} style={{ ...tdS, textAlign:'center', color:'#888' }}>Sin datos para el período seleccionado</td></tr>
                  ) : resultados.filas.map((f,i) => (
                    <tr key={i}>
                      <td style={{ ...tdS, fontWeight:'600' }}>{f.nombre}</td>
                      <td style={tdS}>{f.diasTrabajados}</td>
                      <td style={tdS}>{f.visitas}</td>
                      <td style={{ ...tdS, fontWeight:'600', color:'#3182ce' }}>{f.bultosTotales}</td>
                      <td style={tdS}>{f.bultosPromedio}</td>
                      <td style={tdS}>{f.palletsTotales}</td>
                      <td style={tdS}>{f.tiempoPromedio}</td>
                      <td style={{ ...tdS, fontSize:'13px' }}>{f.clienteTop}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle si hay un chofer filtrado */}
          {resultados.choferDetalle && choferFiltro && (
            <div style={{ ...card, marginBottom: '20px', overflow: 'hidden', padding: 0 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: '600', color: '#1a1a2e' }}>
                Detalle de visitas — {resultados.filas[0]?.nombre}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#f8f9fa' }}>
                      {['Fecha','Cliente más visitado','Visitas','Bultos','Tiempo promedio'].map(h => <th key={h} style={thS}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(resultados.choferDetalle.clientesVisitados).sort((a,b)=>b[1]-a[1]).map(([cliente, visitas], i) => (
                      <tr key={i}>
                        <td style={tdS}>{'-'}</td>
                        <td style={{ ...tdS, fontWeight:'600' }}>{cliente}</td>
                        <td style={tdS}>{visitas}</td>
                        <td style={tdS}>{'-'}</td>
                        <td style={tdS}>{'-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RESULTADOS - Por Cliente */}
      {resultados?.tipo === 'cliente' && (
        <div>
          <div style={{ ...card, marginBottom: '20px', overflow: 'hidden', padding: 0 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: '600', color: '#1a1a2e' }}>
              Resumen por cliente
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#f8f9fa' }}>
                    {['Cliente','Visitas','Bultos totales','Promedio bultos/visita','Tiempo promedio','Tiempo total','Choferes que visitaron'].map(h => (
                      <th key={h} style={thS}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultados.filas.length === 0 ? (
                    <tr><td colSpan={7} style={{ ...tdS, textAlign:'center', color:'#888' }}>Sin datos para el período seleccionado</td></tr>
                  ) : resultados.filas.map((f,i) => (
                    <tr key={i}>
                      <td style={{ ...tdS, fontWeight:'600' }}>{f.nombre}</td>
                      <td style={tdS}>{f.visitas}</td>
                      <td style={{ ...tdS, fontWeight:'600', color:'#3182ce' }}>{f.bultosTotales}</td>
                      <td style={tdS}>{f.bultosPromedio}</td>
                      <td style={tdS}>{f.tiempoPromedio}</td>
                      <td style={tdS}>{f.tiempoTotal}</td>
                      <td style={{ ...tdS, fontSize:'12px', color:'#666' }}>{f.choferes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle de visitas si hay un cliente filtrado */}
          {clienteFiltro && resultados.filas.length > 0 && (
            <div style={{ ...card, overflow: 'hidden', padding: 0 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: '600', color: '#1a1a2e' }}>
                Historial de visitas — {clienteFiltro}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#f8f9fa' }}>
                      {['Fecha','Chofer','Llegada','Salida','Tiempo','Bultos'].map(h => <th key={h} style={thS}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.filas[0]?.detalle.map((d,i) => (
                      <tr key={i}>
                        <td style={tdS}>{d.fecha}</td>
                        <td style={{ ...tdS, fontWeight:'600' }}>{d.chofer}</td>
                        <td style={tdS}>{d.horaLlegada||'-'}</td>
                        <td style={tdS}>{d.horaSalida||'-'}</td>
                        <td style={tdS}>{d.mins!==null ? formatMinutos(d.mins) : '-'}</td>
                        <td style={tdS}>{d.bultos||'-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
