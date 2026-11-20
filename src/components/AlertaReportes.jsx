import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, where, doc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { hoyLocal } from '../utils/fechas'
import { reporteSinVer, datosVisto, nombreVehiculo, fechaCorta, textoOrigen } from '../utils/vehiculos'

// Ventana de alerta de fallas y daños nuevos en las camionetas.
// Les aparece a Juan, Alvaro y Gustavo al entrar (y en el momento, si tienen la app abierta),
// hasta que cada uno toca "Entendido". Cada persona marca por su cuenta lo que ya vio.
// onVer(vehiculoId): qué hacer al tocar "Ver" (ir a la ficha de esa camioneta).
export default function AlertaReportes({ usuario, onVer }) {
  const [reportes, setReportes] = useState([])
  const [vehiculos, setVehiculos] = useState([])

  useEffect(() => {
    const unsubs = [
      onSnapshot(
        query(collection(db, 'reportesVehiculos'), where('estado', '==', 'pendiente')),
        s => setReportes(s.docs.map(d => ({ id: d.id, ...d.data() }))),
        () => setReportes([])
      ),
      onSnapshot(collection(db, 'vehiculos'), s => setVehiculos(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setVehiculos([]))
    ]
    return () => unsubs.forEach(u => u())
  }, [])

  const nuevos = reportes
    .filter(r => reporteSinVer(r, usuario))
    .sort((a, b) => (b.creadoAt || 0) - (a.creadoAt || 0))
  if (nuevos.length === 0) return null

  const hoy = hoyLocal()
  const cuando = r => {
    const hora = r.creadoAt ? new Date(r.creadoAt).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : ''
    return `${r.fecha === hoy ? 'hoy' : fechaCorta(r.fecha)} ${hora}`.trim()
  }

  // No se espera al servidor: la ventana se cierra en el momento
  function entendido() {
    const lote = writeBatch(db)
    nuevos.forEach(r => lote.update(doc(db, 'reportesVehiculos', r.id), datosVisto(usuario)))
    lote.commit().catch(() => window.alert('No se pudo guardar. Revisá la conexión y probá de nuevo.'))
  }
  function ver(r) {
    updateDoc(doc(db, 'reportesVehiculos', r.id), datosVisto(usuario)).catch(() => {})
    onVer(r.vehiculoId)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 12px' }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '520px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
        <div style={{ background: '#c53030', color: 'white', padding: '16px 20px' }}>
          <div style={{ fontSize: '21px', fontWeight: '800' }}>🚨 Novedades en las camionetas</div>
          <div style={{ fontSize: '15px', marginTop: '2px' }}>
            {nuevos.length === 1 ? 'Se reportó 1 problema nuevo' : `Se reportaron ${nuevos.length} problemas nuevos`}
          </div>
        </div>

        <div style={{ padding: '8px 20px' }}>
          {nuevos.map(r => {
            const v = vehiculos.find(x => x.id === r.vehiculoId)
            const origen = textoOrigen(r)
            return (
              <div key={r.id} style={{ borderBottom: '1px solid #edf2f7', padding: '14px 0', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '17px', fontWeight: '700', color: r.tipo === 'daño' ? '#c53030' : '#c05621' }}>
                    {r.tipo === 'daño' ? '💥 Daño' : '🔧 Falla'} en {v ? `${nombreVehiculo(v)} (${v.matricula})` : 'una camioneta'}
                  </div>
                  <div style={{ fontSize: '16px', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{r.descripcion}</div>
                  <div style={{ fontSize: '14px', color: '#718096', marginTop: '4px' }}>
                    Reportó {r.creadoPor || 'alguien'} · {cuando(r)}{origen ? ` · ${origen}` : ''}
                  </div>
                </div>
                <button onClick={() => ver(r)}
                  style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e0', background: 'white', fontSize: '15px', fontWeight: '600', cursor: 'pointer', flexShrink: 0 }}>
                  Ver
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '12px 20px 20px' }}>
          <button onClick={entendido}
            style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', background: '#1a1a2e', color: 'white', fontSize: '18px', fontWeight: '700', cursor: 'pointer' }}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
