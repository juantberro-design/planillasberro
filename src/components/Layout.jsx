import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../hooks/useAuth.jsx'

export default function Layout() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function cerrarSesion() {
    await signOut(auth)
    navigate('/login')
  }

  const navItems = [
    { path: '/', label: '🚚 Planillas' },
    { path: '/pallets', label: '📦 Pallets a desarmar', roles: ['admin', 'operador'] },
    { path: '/informes', label: '📊 Informes', roles: ['admin', 'operador'] },
    { path: '/admin', label: '⚙️ Admin', roles: ['admin'] },
  ].filter(item => !item.roles || item.roles.includes(usuario?.rol))

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <div style={{
        background: '#1a1a2e', color: 'white', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '56px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <span style={{ fontWeight: '700', fontSize: '16px' }}>Transportes Berro</span>
          <nav style={{ display: 'flex', gap: '4px' }}>
            {navItems.map(item => (
              <button key={item.path} onClick={() => navigate(item.path)}
                style={{
                  background: location.pathname === item.path ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px',
                  cursor: 'pointer', fontSize: '14px',
                  fontWeight: location.pathname === item.path ? '600' : '400'
                }}>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '14px', opacity: 0.8 }}>
            {usuario?.nombre}
            <span style={{ marginLeft: '8px', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>
              {usuario?.rol}
            </span>
          </span>
          <button onClick={cerrarSesion}
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
            Salir
          </button>
        </div>
      </div>
      <main><Outlet /></main>
    </div>
  )
}
