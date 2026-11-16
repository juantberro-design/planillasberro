import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// Aviso en la pantalla de inicio del admin: daños nuevos en camionetas y controles quincenales
// con algo en "Mal" que todavía no vio.
export default function AvisoCamionetas() {
  const navigate = useNavigate()
  const [danios, setDanios] = useState(0)
  const [controlesMal, setControlesMal] = useState(0)

  useEffect(() => {
    const qDanios = query(collection(db, 'reportesVehiculos'), where('tipo', '==', 'daño'), where('vistoAdmin', '==', false))
    const qControles = query(collection(db, 'controlesVehiculos'), where('hayMal', '==', true), where('vistoAdmin', '==', false))
    const unsubs = [
      onSnapshot(qDanios, s => setDanios(s.docs.filter(d => d.data().estado === 'pendiente').length), () => setDanios(0)),
      onSnapshot(qControles, s => setControlesMal(s.size), () => setControlesMal(0))
    ]
    return () => unsubs.forEach(u => u())
  }, [])

  if (danios === 0 && controlesMal === 0) return null
  const partes = []
  if (danios > 0) partes.push(danios === 1 ? '1 daño nuevo' : `${danios} daños nuevos`)
  if (controlesMal > 0) partes.push(controlesMal === 1 ? '1 control con algo en Mal' : `${controlesMal} controles con algo en Mal`)
  return (
    <div onClick={() => navigate('/vehiculos')}
      style={{ background: '#fff5f5', border: '2px solid #feb2b2', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px', cursor: 'pointer', fontSize: '16px', fontWeight: '600', color: '#c53030' }}>
      🔔 Camionetas: {partes.join(' y ')} — tocá para ver
    </div>
  )
}
