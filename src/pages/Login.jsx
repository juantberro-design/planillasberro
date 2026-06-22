import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      const q = query(collection(db, 'usuarios'), where('nombre', '==', nombre.trim()))
      const snap = await getDocs(q)
      if (snap.empty) {
        setError('Usuario no encontrado')
        setCargando(false)
        return
      }
      const userData = snap.docs[0].data()
      const email = userData.email
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/')
    } catch (err) {
      setError('Usuario o contraseña incorrectos')
      setCargando(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f2f5',
      padding: '16px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        background: 'white',
        padding: 'clamp(24px, 6vw, 40px)',
        borderRadius: '14px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '380px',
        boxSizing: 'border-box'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '8px', color: '#1a1a2e', fontSize: 'clamp(22px, 5vw, 28px)' }}>
          Transportes Berro
        </h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '28px', fontSize: '14px' }}>
          Sistema de Planillas
        </p>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Usuario
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              autoCapitalize="none"
              style={{
                width: '100%',
                padding: '14px 12px',
                border: '1px solid #ddd',
                borderRadius: '10px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              placeholder="Tu nombre de usuario"
              required
            />
          </div>
          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '14px 12px',
                border: '1px solid #ddd',
                borderRadius: '10px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              placeholder="Tu contraseña"
              required
            />
          </div>
          {error && (
            <p style={{ color: '#e53e3e', fontSize: '14px', marginBottom: '16px', textAlign: 'center' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={cargando}
            style={{
              width: '100%',
              padding: '15px',
              background: cargando ? '#aaa' : '#1a1a2e',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: cargando ? 'not-allowed' : 'pointer'
            }}
          >
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
