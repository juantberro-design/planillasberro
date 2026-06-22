import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

function hoy() {
  return new Date().toISOString().split('T')[0]
}

const thS = { padding: '10px 14px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666', borderBottom: '2px solid #e2e8f0' }
const tdS = { padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: '14px' }

export default function RetirosTurno() {
  const navigate = useNavigate()
  const [fecha, setFecha] = useState(hoy())
  const [turno, setTurno] = useState('mañana')
  const [resultados, setResultados] = useState(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    buscar()
  }, [])

  async function buscar() {
    setCargando(true)
    const [snapChoferes, snapPlanillas] = await Promise.all([
      getDocs(collection(db, 'choferes')),
      getDocs(collection(db, 'planillas', fecha, 'choferes'))
    ])

    const choferesMap = {}
    snapChoferes.forEach(d => { choferesMap[d.id] = d.data().nombre })

    const filas = []
    snapPlanillas.forEach(docSnap => {
      const parts = docSnap.id.split('_')
      const choferId = parts[0]
      const turnoDoc = parts[1]
      if (turnoDoc !== turno) return

      const data = docSnap.data()
      const choferNombre = choferesMap[choferId] || choferId

      ;(data.levantes || []).forEach(l => {
        if (l.cliente) filas.push({ choferNombre, cliente: l.cliente, tipo: 'Levante', horaLlegada: l.horaLlegada, horaSalida: l.horaSalida, bultos: l.bultos, palletDesarmar: l.palletDesarmar, controlOk: l.controlOk })
      })
      ;(data.clientesPuntuales || []).forEach(l => {
        if (l.cliente) filas.push({ choferNombre, cliente: l.cliente, tipo: 'Puntual', horaLlegada: l.horaLlegada, horaSalida: l.horaSalida, bultos: l.bultos, palletDesarmar: l.palletDesarmar, controlOk: l.controlOk })
      })
    })

    filas.sort((a, b) => a.choferNombre.localeCompare(b.choferNombre) || a.cliente.localeCompare(b.cliente))
    setResultados(filas)
    setCargando(false)
  }

  const totalControlados = resultados ? resultados.filter(r => r.controlOk).length : 0

  return (
    <div style={{ padding: 'clamp(12px,4vw,24px)', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '4px' }}>←</button>
        <h2 style={{ margin: 0, color: '#1a1a2e' }}>Retiros ingresados</h2>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Turno</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['mañana', 'tarde'].map(t => (
                <button key={t} onClick={() => setTurno(t)}
                  style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', background: turno === t ? '#1a1a2e' : '#e2e8f0', color: turno === t ? 'white' : '#444' }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <button onClick={buscar} disabled={cargando}
            style={{ padding: '9px 24px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            {cargando ? 'Buscando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {resultados !== null && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <strong style={{ color: '#1a1a2e' }}>
              {resultados.length} retiro{resultados.length !== 1 ? 's' : ''} — {fecha} ({turno})
            </strong>
            {resultados.length > 0 && (
              <span style={{ fontSize: '13px', color: '#666' }}>
                {totalControlados} de {resultados.length} controlados
              </span>
            )}
          </div>
          {resultados.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
              No hay retiros cargados para este turno.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['Chofer', 'Cliente', 'Tipo', 'Llegada', 'Salida', 'Bultos', 'Pallets', '✓'].map(h => (
                      <th key={h} style={thS}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r, i) => (
                    <tr key={i}>
                      <td style={{ ...tdS, fontWeight: '600' }}>{r.choferNombre}</td>
                      <td style={{ ...tdS, fontWeight: '600', color: '#3182ce' }}>{r.cliente}</td>
                      <td style={{ ...tdS, fontSize: '12px', color: '#888' }}>{r.tipo}</td>
                      <td style={tdS}>{r.horaLlegada || '-'}</td>
                      <td style={tdS}>{r.horaSalida || '-'}</td>
                      <td style={tdS}>{r.bultos || '-'}</td>
                      <td style={tdS}>{r.palletDesarmar || '-'}</td>
                      <td style={tdS}>{r.controlOk ? '✅' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
