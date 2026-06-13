import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Planilla from './pages/Planilla'
import Pallets from './pages/Pallets'
import Admin from './pages/Admin'
import Layout from './components/Layout'

function PrivateRoute({ children, roles }) {
  const { usuario, cargando } = useAuth()
  if (cargando) return <div className="loading">Cargando...</div>
  if (!usuario) return <Navigate to="/login" />
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/" />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="planilla/:fecha/:choferId" element={<Planilla />} />
          <Route path="pallets" element={<Pallets />} />
          <Route path="admin" element={
            <PrivateRoute roles={['admin']}>
              <Admin />
            </PrivateRoute>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}