import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Planilla from './pages/Planilla'
import Pallets from './pages/Pallets'
import Admin from './pages/Admin'
import Informes from './pages/Informes'
import ImprimirPlanillas from './pages/ImprimirPlanillas'
import RetirosTurno from './pages/RetirosTurno'
import RetirosPrecargados from './pages/RetirosPrecargados'
import Configuracion from './pages/Configuracion'
import Seguimiento from './pages/Seguimiento'
import Layout from './components/Layout'

function PrivateRoute({ children, roles }) {
  const { usuario, cargando } = useAuth()
  if (cargando) return null
  if (!usuario) return <Navigate to="/login" />
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/" />
  return children
}

// La pantalla de inicio depende del rol: el supervisor va directo a Seguimiento
function Inicio() {
  const { usuario } = useAuth()
  if (usuario?.rol === 'supervisor') return <Navigate to="/seguimiento" replace />
  return <Dashboard />
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
          <Route index element={<Inicio />} />
          <Route path="planilla/:fecha/:choferId" element={
            <PrivateRoute roles={['admin','operador','chofer']}>
              <Planilla />
            </PrivateRoute>
          } />
          <Route path="seguimiento" element={
            <PrivateRoute roles={['supervisor','admin','operador']}>
              <Seguimiento />
            </PrivateRoute>
          } />
          <Route path="pallets" element={
            <PrivateRoute roles={['admin','operador']}>
              <Pallets />
            </PrivateRoute>
          } />
          <Route path="informes" element={
            <PrivateRoute roles={['admin','operador']}>
              <Informes />
            </PrivateRoute>
          } />
          <Route path="imprimir/:fecha" element={
            <PrivateRoute roles={['admin','operador']}>
              <ImprimirPlanillas />
            </PrivateRoute>
          } />
          <Route path="retiros" element={
            <PrivateRoute roles={['admin','operador']}>
              <RetirosTurno />
            </PrivateRoute>
          } />
          <Route path="retiros-precargados" element={
            <PrivateRoute roles={['admin','operador']}>
              <RetirosPrecargados />
            </PrivateRoute>
          } />
          <Route path="admin" element={
            <PrivateRoute roles={['admin']}>
              <Admin />
            </PrivateRoute>
          } />
          <Route path="configuracion" element={<Configuracion />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
