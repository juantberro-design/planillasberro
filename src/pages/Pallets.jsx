import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

const CLIENTES_PALLETS = ['KONIG', 'MORSELOY', 'RUTILAN', 'SAMAN']

const CHOFERES = {
  'javier-astrada': 'Javier Astrada',
  'eduardo-rodriguez': 'Eduardo Rodriguez',
  'michael-castano': 'Michael Castaño',
  'sergio-capitani': 'Sergio Capitani',
  'daniel-soria': 'Daniel Soria',
  'anthony-stabile': 'Anthony Stabile',
  'martin-pastor': 'Martin Pastor',
  'carlos-figueira': 'Carlos Figueira',
  'diego-cardozo': 'Diego Cardozo',
  'carlos-bermejo': 'Carlos Bermejo',
}

function fechaHoy() {
  return new Date().toISOString().split('T')[0]
}

function fechaHaceUnMes() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().split('T')[0]
}

export default function Pallets() {
  const [desde, setDesde] = useState(fechaHaceUnMes())
  const [hasta, setHasta] = useState(fechaHoy())
  const [datos, setDatos] = useState([])
  const [cargando, setCargando] = useState(false)

  async function buscar() {
    setCargando(true)
    const resumen = {}
    CLIENTES_PALLETS.forEach(c => { resumen[c] = { rec: 0, dev: 0 } })

    let fechaActual = new Date(desde)
    const fechaFin = new Date(hasta)

    while (fechaActual <= fechaFin) {
      const fechaStr = fechaActual.toISOString().split('T')[0]
      try {
        const snap = await getDocs(collection(db, 'planillas', fechaStr, 'choferes'))
        snap.forEach(docSnap => {
          const data = docSnap.data()
          // Levantes (REC)
          if (data.levantes) {
            data.levantes.forEach(l => {
              if (CLIENTES_PALLETS.includes(l.cliente) && l.palletDesarmar) {
                resumen[l.cliente].rec += Number(l.palletDesarmar) || 0
              }
            })
          }
          // Devoluciones (DEV)
          if (data.devoluciones) {
            data.devoluciones.forEach(d => {
              if (CLIENTES_PALLETS.includes(d.cliente) && d.cantidad) {
                resumen[d.cliente].dev += Number(d.cantidad) || 0
              }
            })
          }
        })
      } catch {}
      fechaActual.setDate(fechaActual.getDate() + 1)
    }

    setDatos(Object.entries(resumen).map(([cliente, vals]) => ({
      cliente,
      rec: vals.rec,
      dev: vals.dev,
      saldo: vals.rec - vals.dev
    })))
    setCargando(false)
  }

  useEffect(() => { buscar() }, [])

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

  return (
    <div style={{ padding: '24px', maxWidth: '700px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 24px', color: '#1a1a2e' }}>Resumen de Pallets</h2>

      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
        <button onClick={buscar} disabled={cargando}
          style={{ padding: '9px 24px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          {cargando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {datos.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={thStyle}>Cliente</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Recibidos ▼</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Devueltos ▲</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {datos.map(row => (
                <tr key={row.cliente}>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{row.cliente}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{row.rec}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{row.dev}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      fontWeight: '700',
                      color: row.saldo > 0 ? '#e53e3e' : row.saldo < 0 ? '#38a169' : '#666'
                    }}>
                      {row.saldo > 0 ? `+${row.saldo}` : row.saldo}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
