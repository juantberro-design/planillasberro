import { useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { PROPIO, filaSinCamioneta, textoFila, enTallerEnTurno, nombreVehiculo } from '../utils/vehiculos'

// Cartel arriba de la planilla (solo oficina): qué camioneta maneja el chofer en este turno.
// Si no tiene ninguna, avisa en rojo; admin y coordinador la pueden asignar ahí mismo.
// La planilla bloquea los retiros mientras el chofer no tenga camioneta (ver Planilla.jsx).
export default function CamionetaDelTurno({ asign, fecha, turno, choferId, usuario }) {
  const puedeAsignar = ['admin', 'coordinador'].includes(usuario.rol)
  const [eleccion, setEleccion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  if (!asign.cargado) return null
  const fila = asign.filaDe(choferId)
  const sin = filaSinCamioneta(fila)

  if (!sin || asign.congelado) {
    return (
      <div style={{ fontSize: '15px', color: '#4a5568', marginBottom: '16px' }}>
        🚐 Este turno maneja: <b>{textoFila(fila, asign.vehiculoPorId)}</b>
      </div>
    )
  }

  // Quién usa cada camioneta en este turno, para avisar si se la sacan a otro
  const usadaPor = {}
  asign.filas.forEach(f => { if (f.vehiculoId) usadaPor[f.vehiculoId] = f.choferId })
  const disponibles = [...asign.vehiculos]
    .filter(v => !enTallerEnTurno(v, fecha, turno))
    .sort((a, b) => String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }))

  async function asignar() {
    if (!eleccion) { setError('Elegí una camioneta.'); return }
    const otro = usadaPor[eleccion]
    if (otro && otro !== choferId &&
      !window.confirm(`${nombreVehiculo(asign.vehiculoPorId(eleccion))} la tiene ${asign.nombreChofer(otro)}. ¿Dársela igual?\n${asign.nombreChofer(otro)} va a pasar al backup o quedar sin camioneta.`)) return
    setGuardando(true)
    setError('')
    try {
      await setDoc(doc(db, 'asignacionesVehiculos', `${fecha}_${turno}`),
        { manual: { [choferId]: eleccion }, fecha, turno }, { merge: true })
    } catch {
      setError('No se pudo guardar. Revisá la conexión y probá de nuevo.')
    }
    setGuardando(false)
  }

  return (
    <div style={{ background: '#fff5f5', border: '2px solid #feb2b2', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
      <div style={{ fontSize: '17px', fontWeight: '700', color: '#c53030' }}>
        ⚠️ {asign.nombreChofer(choferId)} no tiene camioneta para el turno {turno}
      </div>
      {fila?.detalle && <div style={{ fontSize: '14px', color: '#9b2c2c', marginTop: '4px' }}>{fila.detalle}</div>}
      <div style={{ fontSize: '15px', color: '#333', marginTop: '8px' }}>
        No se pueden cargar retiros hasta que tenga una asignada.
      </div>

      {puedeAsignar ? (
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
          <select value={eleccion} onChange={e => setEleccion(e.target.value)}
            style={{ flex: '1 1 220px', padding: '12px', border: '1px solid #ccc', borderRadius: '8px', fontSize: '16px', background: 'white' }}>
            <option value="">Elegí la camioneta...</option>
            {disponibles.map(v => (
              <option key={v.id} value={v.id}>
                {nombreVehiculo(v)}{usadaPor[v.id] ? ` — la tiene ${asign.nombreChofer(usadaPor[v.id])}` : ' — libre'}
              </option>
            ))}
            <option value={PROPIO}>Vehículo propio / tercero</option>
          </select>
          <button onClick={asignar} disabled={guardando}
            style={{ padding: '12px 20px', background: '#38a169', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}>
            {guardando ? 'Guardando...' : 'Asignar'}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: '15px', color: '#333', marginTop: '8px', fontWeight: '600' }}>
          Pedile a Alvaro o a Juan que le asignen una camioneta.
        </div>
      )}
      {error && <div style={{ color: '#c53030', fontSize: '14px', marginTop: '8px' }}>{error}</div>}
    </div>
  )
}
