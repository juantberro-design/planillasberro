import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const CHOFERES = [
  { id: 'javier-astrada', nombre: 'Javier Astrada' },
  { id: 'eduardo-rodriguez', nombre: 'Eduardo Rodriguez' },
  { id: 'michael-castano', nombre: 'Michael Castaño' },
  { id: 'sergio-capitani', nombre: 'Sergio Capitani' },
  { id: 'daniel-soria', nombre: 'Daniel Soria' },
  { id: 'anthony-stabile', nombre: 'Anthony Stabile' },
  { id: 'martin-pastor', nombre: 'Martin Pastor' },
  { id: 'carlos-figueira', nombre: 'Carlos Figueira' },
  { id: 'diego-cardozo', nombre: 'Diego Cardozo' },
  { id: 'carlos-bermejo', nombre: 'Carlos Bermejo' },
]

function hoy() {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

export default function Dashboard() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [fecha, setFecha] = useState(hoy())

  const choferesFiltrados = usuario.rol === 'chofer'
    ? CHOFERES.filter(c => c.id === usuario.choferId)
    : CHOFERES

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0, color: '#1a1a2e' }}>Planillas del día</h2>
        <input
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            fontSize: '15px'
          }}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '16px'
      }}>
        {choferesFiltrados.map(chofer => (
          <div
            key={chofer.id}
            onClick={() => navigate(`/planilla/${fecha}/${chofer.id}`)}
            style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
            }}
            onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'}
            onMouseOut={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'}
          >
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🚚</div>
            <div style={{ fontWeight: '600', color: '#1a1a2e' }}>{chofer.nombre}</div>
            <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>{fecha}</div>
          </div>
        ))}
      </div>
    </div>
  )
}