import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { useState } from 'react'
import { auth } from '../firebase'
import { useAuth } from '../hooks/useAuth.jsx'

export default function Layout() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(false)

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

  function ir(path) {
    navigate(path)
    setMenuAbierto(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <div className="berro-header-no-print" style={{
        background: '#1a1a2e', color: 'white', padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '56px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', position: 'relative', zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          {/* Botón hamburguesa — solo visible en mobile vía CSS */}
          <button
            className="berro-menu-toggle"
            onClick={() => setMenuAbierto(!menuAbierto)}
            style={{
              display: 'none', background: 'none', border: 'none', color: 'white',
              fontSize: '22px', cursor: 'pointer', padding: '4px 8px', lineHeight: 1
            }}
          >
            {menuAbierto ? '✕' : '☰'}
          </button>
          <span style={{ fontWeight: '700', fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Transportes Berro
          </span>
          {/* Nav horizontal — se oculta en mobile vía CSS, reemplazado por el menú desplegable */}
          <nav className="berro-nav-desktop" style={{ display: 'flex', gap: '4px', marginLeft: '20px' }}>
            {navItems.map(item => (
              <button key={item.path} onClick={() => ir(item.path)}
                style={{
                  background: location.pathname === item.path ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px',
                  cursor: 'pointer', fontSize: '14px', whiteSpace: 'nowrap',
                  fontWeight: location.pathname === item.path ? '600' : '400'
                }}>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <span className="berro-user-name" style={{ fontSize: '13px', opacity: 0.85, whiteSpace: 'nowrap' }}>
            {usuario?.nombre}
            <span style={{ marginLeft: '6px', background: 'rgba(255,255,255,0.2)', padding: '2px 7px', borderRadius: '10px', fontSize: '11px' }}>
              {usuario?.rol}
            </span>
          </span>
          <button onClick={cerrarSesion}
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
            Salir
          </button>
        </div>
      </div>

      {/* Menú desplegable mobile */}
      {menuAbierto && (
        <div className="berro-nav-mobile berro-header-no-print" style={{
          background: '#1a1a2e', position: 'sticky', top: '56px', zIndex: 99,
          boxShadow: '0 4px 8px rgba(0,0,0,0.15)', display: 'none'
        }}>
          {navItems.map(item => (
            <button key={item.path} onClick={() => ir(item.path)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: location.pathname === item.path ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: 'white', border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)',
                padding: '14px 20px', cursor: 'pointer', fontSize: '15px',
                fontWeight: location.pathname === item.path ? '600' : '400'
              }}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      <main><Outlet /></main>

      <style>{`
        @media (max-width: 720px) {
          .berro-menu-toggle { display: block !important; }
          .berro-nav-desktop { display: none !important; }
          .berro-nav-mobile { display: block !important; }
          .berro-user-name { display: none !important; }
        }
        @media print {
          .berro-header-no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}
