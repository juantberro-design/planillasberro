import { useState, useEffect } from 'react'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import SelectorCliente from '../components/SelectorCliente.jsx'

function fechaHoy() {
  return new Date().toISOString().split('T')[0]
}

function fechaHaceUnMes() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().split('T')[0]
}

// Fecha desde la que arranca a usarse el sistema (saldo total acumulado desde acá)
function parsearFecha(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fechaInicioCalculo() {
  const inicioOficial = parsearFecha('2026-07-01')
  const hoy = parsearFecha(fechaHoy())
  // Si todavía no llegó la fecha oficial de arranque, usamos hace 60 días como rango de prueba
  if (hoy < inicioOficial) {
    const d = new Date(hoy)
    d.setDate(d.getDate() - 60)
    return d
  }
  return inicioOficial
}

export default function Pallets() {
  const [todosClientes, setTodosClientes] = useState([])
  const [clientesDefault, setClientesDefault] = useState([])
  const [resumen, setResumen] = useState([])
  const [cargandoResumen, setCargandoResumen] = useState(false)

  const [clienteSeleccionado, setClienteSeleccionado] = useState('')
  const [vistaDetalle, setVistaDetalle] = useState(false)
  const [desde, setDesde] = useState(fechaHaceUnMes())
  const [hasta, setHasta] = useState(fechaHoy())
  const [detalle, setDetalle] = useState([])
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  useEffect(() => {
    inicializar()
  }, [])

  async function inicializar() {
    const [snapClientes, snapConfig] = await Promise.all([
      getDocs(collection(db, 'clientes')),
      getDoc(doc(db, 'config', 'pallets'))
    ])
    const listaClientes = snapClientes.docs.map(d => d.data().nombre).sort()
    setTodosClientes(listaClientes)
    const defaultClientes = snapConfig.exists() ? (snapConfig.data().clientes || []) : []
    setClientesDefault(defaultClientes)
    buscarResumenTotal(defaultClientes)
  }

  async function buscarResumenTotal(clientes) {
    if (clientes.length === 0) {
      setResumen([])
      return
    }
    setCargandoResumen(true)
    try {
      const lecturas = await Promise.all(
        clientes.map(cliente => {
          const idCliente = cliente.toLowerCase().replace(/\s+/g, '-')
          return getDoc(doc(db, 'saldosPallets', idCliente))
        })
      )
      const filas = clientes.map((cliente, i) => {
        const snap = lecturas[i]
        const data = snap.exists() ? snap.data() : { rec: 0, dev: 0 }
        const rec = data.rec || 0
        const dev = data.dev || 0
        return { cliente, rec, dev, saldo: rec - dev }
      })
      setResumen(filas)
    } catch {
      setResumen(clientes.map(cliente => ({ cliente, rec: 0, dev: 0, saldo: 0 })))
    }
    setCargandoResumen(false)
  }

  async function buscarDetalle(clienteNombre) {
    const cliente = clienteNombre || clienteSeleccionado
    if (!cliente) return
    setClienteSeleccionado(cliente)
    setCargandoDetalle(true)
    const movimientos = []

    let fechaActual = parsearFecha(desde)
    const fechaFin = parsearFecha(hasta)

    while (fechaActual <= fechaFin) {
      const fechaStr = fechaActual.toISOString().split('T')[0]
      try {
        const snap = await getDocs(collection(db, 'planillas', fechaStr, 'choferes'))
        snap.forEach(docSnap => {
          const data = docSnap.data()
          const choferId = docSnap.id.split('_')[0]
          const turno = docSnap.id.split('_')[1]

          if (data.levantes) {
            data.levantes.forEach(l => {
              if (l.cliente === cliente && l.palletDesarmar && Number(l.palletDesarmar) > 0) {
                movimientos.push({
                  fecha: fechaStr,
                  chofer: data.modificadoNombre || choferId,
                  turno,
                  tipo: 'REC ▼',
                  cantidad: Number(l.palletDesarmar),
                  color: '#e53e3e'
                })
              }
            })
          }
          if (data.devoluciones) {
            data.devoluciones.forEach(d => {
              if (d.cliente === cliente && d.cantidad && Number(d.cantidad) > 0) {
                movimientos.push({
                  fecha: fechaStr,
                  chofer: data.modificadoNombre || choferId,
                  turno,
                  tipo: 'DEV ▲',
                  cantidad: Number(d.cantidad),
                  color: '#38a169'
                })
              }
            })
          }
        })
      } catch {}
      fechaActual.setDate(fechaActual.getDate() + 1)
    }

    movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha))
    setDetalle(movimientos)
    setVistaDetalle(true)
    setCargandoDetalle(false)
  }

  const thStyle = {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: '600',
    color: '#666',
    borderBottom: '2px solid #e2e8f0'
  }
  const tdStyle = {
    padding: '14px 16px',
    borderBottom: '1px solid #f0f0f0',
    fontSize: '15px'
  }

  const saldoDetalle = detalle.reduce((acc, m) => {
    return m.tipo === 'REC ▼' ? acc + m.cantidad : acc - m.cantidad
  }, 0)

  return (
    <div style={{ padding: 'clamp(12px,4vw,24px)', maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 24px', color: '#1a1a2e' }}>Pallets a desarmar</h2>

      {!vistaDetalle && (
        <>
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '24px' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: '600', color: '#1a1a2e' }}>
              Saldo actual por cliente
            </div>
            {cargandoResumen ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Calculando...</div>
            ) : resumen.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                No hay clientes configurados. Elegilos desde Admin → Pallets a desarmar.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={thStyle}>Cliente</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Recibidos ▼</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Devueltos ▲</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Saldo</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.map(row => (
                    <tr key={row.cliente}>
                      <td style={{ ...tdStyle, fontWeight: '600' }}>{row.cliente}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{row.rec}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{row.dev}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontWeight: '700', color: row.saldo > 0 ? '#e53e3e' : row.saldo < 0 ? '#38a169' : '#666' }}>
                          {row.saldo > 0 ? `Debemos ${row.saldo}` : row.saldo < 0 ? `A favor ${Math.abs(row.saldo)}` : '0'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button onClick={() => buscarDetalle(row.cliente)}
                          style={{ padding: '6px 14px', background: '#ebf8ff', color: '#3182ce', border: '1px solid #3182ce', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight: '600', marginBottom: '12px', color: '#1a1a2e' }}>Consultar otro cliente</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '220px' }}>
                <SelectorCliente
                  value={clienteSeleccionado}
                  clientes={todosClientes}
                  placeholder="Escribí el nombre del cliente..."
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                  onSelect={(nombre) => setClienteSeleccionado(nombre)}
                />
              </div>
              <button onClick={() => buscarDetalle()} disabled={!clienteSeleccionado || cargandoDetalle}
                style={{ padding: '9px 24px', background: clienteSeleccionado ? '#1a1a2e' : '#aaa', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: clienteSeleccionado ? 'pointer' : 'not-allowed' }}>
                Ver movimientos
              </button>
            </div>
          </div>
        </>
      )}

      {vistaDetalle && (
        <div>
          <button onClick={() => setVistaDetalle(false)}
            style={{ marginBottom: '16px', padding: '8px 16px', background: '#f0f0f0', color: '#444', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
            ← Volver al resumen
          </button>

          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Cliente</label>
                <div style={{ minWidth: '200px' }}>
                  <SelectorCliente
                    value={clienteSeleccionado}
                    clientes={todosClientes}
                    style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                    onSelect={(nombre) => setClienteSeleccionado(nombre)}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Desde</label>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Hasta</label>
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }} />
              </div>
              <button onClick={() => buscarDetalle()} disabled={cargandoDetalle}
                style={{ padding: '9px 24px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                {cargandoDetalle ? 'Buscando...' : 'Actualizar'}
              </button>
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: '600', color: '#1a1a2e' }}>Movimientos — {clienteSeleccionado}</div>
              <div style={{ fontWeight: '700', fontSize: '16px', color: saldoDetalle > 0 ? '#e53e3e' : saldoDetalle < 0 ? '#38a169' : '#666' }}>
                {saldoDetalle > 0 ? `Debemos ${saldoDetalle}` : saldoDetalle < 0 ? `A favor ${Math.abs(saldoDetalle)}` : 'Saldo 0'}
              </div>
            </div>
            {detalle.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No hay movimientos en este período</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['Fecha', 'Chofer', 'Turno', 'Tipo', 'Cantidad'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((m, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{m.fecha}</td>
                      <td style={tdStyle}>{m.chofer}</td>
                      <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{m.turno}</td>
                      <td style={tdStyle}><span style={{ color: m.color, fontWeight: '600' }}>{m.tipo}</span></td>
                      <td style={tdStyle}>{m.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
