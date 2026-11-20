import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// Aviso en la pantalla de inicio del admin: controles quincenales con algo en "Mal" que todavía no vio.
// (Las fallas y daños nuevos se avisan con la ventana de AlertaReportes.jsx.)
export default function AvisoCamionetas() {
  const navigate = useNavigate()
  const [controlesMal, setControlesMal] = useState(0)

  useEffect(() => {
    const q = query(collection(db, 'controlesVehiculos'), where('hayMal', '==', true), where('vistoAdmin', '==', false))
    return onSnapshot(q, s => setControlesMal(s.size), () => setControlesMal(0))
  }, [])

  if (controlesMal === 0) return null
  return (
    <div onClick={() => navigate('/vehiculos')}
      style={{ background: '#fff5f5', border: '2px solid #feb2b2', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px', cursor: 'pointer', fontSize: '16px', fontWeight: '600', color: '#c53030' }}>
      🔔 Camionetas: {controlesMal === 1 ? '1 control con algo en Mal' : `${controlesMal} controles con algo en Mal`} — tocá para ver
    </div>
  )
}
