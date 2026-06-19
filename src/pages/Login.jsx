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
      console.log('Error:', err.code, err.message)
      setError('Error: ' + err.code)
      setCargando(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <div style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 2px 16px rgba(0,0,0,0.1)', width: '100%', maxWidth: '380px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '8px', color: '#1a1a2e' }}>Transportes Berro</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '32px', fontSize: '14px' }}>Sistema de Planillas</p>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>Usuario</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }}
              placeholder="Tu nombre de usuario" required />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box' }}
              placeholder="Tu contraseña" required />
          </div>
          {error && <p style={{ color: '#e53e3e', fontSize: '14px', marginBottom: '16px', textAlign: 'center' }}>{error}</p>}
          <button type="submit" disabled={cargando}
            style={{ width: '100%', padding: '12px', background: cargando ? '#aaa' : '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: cargando ? 'not-allowed' : 'pointer' }}>
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}