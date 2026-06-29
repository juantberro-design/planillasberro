import { useState } from 'react'
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useNavigate } from 'react-router-dom'

const IS = { width: '100%', padding: '11px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box' }

export default function Configuracion() {
  const { usuario } = useAuth()
  const navigate = useNavigate()

  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  async function cambiarPassword(e) {
    e.preventDefault()
    setError('')
    setExito('')

    if (nueva.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (nueva !== repetir) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setGuardando(true)
    try {
      // Para cambiar la propia contraseña, Firebase exige reautenticación reciente
      const cred = EmailAuthProvider.credential(usuario.email, actual)
      await reauthenticateWithCredential(auth.currentUser, cred)
      await updatePassword(auth.currentUser, nueva)
      setExito('Contraseña actualizada correctamente.')
      setActual('')
      setNueva('')
      setRepetir('')
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('La contraseña actual no es correcta.')
      } else {
        setError('No se pudo cambiar la contraseña. Probá de nuevo.')
      }
    }
    setGuardando(false)
  }

  return (
    <div style={{ padding: 'clamp(12px,4vw,24px)', maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '4px' }}>←</button>
        <h2 style={{ margin: 0, color: '#1a1a2e' }}>Configuración</h2>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 6px', color: '#1a1a2e', fontSize: '16px' }}>Cambiar mi contraseña</h3>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#888' }}>
          Usuario: <strong>{usuario.nombre}</strong>
        </p>

        <form onSubmit={cambiarPassword}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Contraseña actual</label>
            <input type="password" value={actual} onChange={e => setActual(e.target.value)} style={IS} required />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Nueva contraseña</label>
            <input type="password" value={nueva} onChange={e => setNueva(e.target.value)} style={IS} placeholder="Mínimo 6 caracteres" required />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Repetir nueva contraseña</label>
            <input type="password" value={repetir} onChange={e => setRepetir(e.target.value)} style={IS} required />
          </div>

          {error && <p style={{ color: '#e53e3e', fontSize: '14px', marginBottom: '14px' }}>{error}</p>}
          {exito && <p style={{ color: '#276749', fontSize: '14px', marginBottom: '14px' }}>{exito}</p>}

          <button type="submit" disabled={guardando}
            style={{ width: '100%', padding: '13px', background: guardando ? '#aaa' : '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: guardando ? 'not-allowed' : 'pointer' }}>
            {guardando ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
