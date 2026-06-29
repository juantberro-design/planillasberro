import { useState, useEffect } from 'react'
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, query, orderBy, increment } from 'firebase/firestore'
import { db } from '../firebase'

const ROLES = ['admin', 'operador', 'chofer']

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #ddd',
  borderRadius: '8px',
  fontSize: '14px',
  boxSizing: 'border-box'
}

const tabStyle = (active) => ({
  padding: '10px 20px',
  background: active ? '#1a1a2e' : '#e2e8f0',
  color: active ? 'white' : '#444',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '14px'
})

export default function Admin() {
  const [tab, setTab] = useState('usuarios')
  const [usuarios, setUsuarios] = useState([])
  const [choferes, setChoferes] = useState([])
  const [clientes, setClientes] = useState([])
  const [clientesPallets, setClientesPallets] = useState([])
  const [saldosPallets, setSaldosPallets] = useState({}) // { clienteNombre: { rec, dev } }
  const [ajustesInput, setAjustesInput] = useState({}) // { clienteNombre: 'texto del input' }
  const [ajustando, setAjustando] = useState(null)
  const [avisoAjuste, setAvisoAjuste] = useState('')
  const [cargando, setCargando] = useState(true)
  const [mostrarFormUsuario, setMostrarFormUsuario] = useState(false)
  const [mostrarFormChofer, setMostrarFormChofer] = useState(false)
  const [mostrarFormCliente, setMostrarFormCliente] = useState(false)
  const [formUsuario, setFormUsuario] = useState({ nombre: '', password: '', rol: 'operador', choferId: '' })
  const [formChofer, setFormChofer] = useState({ nombre: '', activo: true })
  const [formCliente, setFormCliente] = useState({ nombre: '' })
  const [editandoChofer, setEditandoChofer] = useState(null)
  const [editandoCliente, setEditandoCliente] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  // Historial
  const [histFecha, setHistFecha] = useState(new Date().toISOString().split('T')[0])
  const [histChoferId, setHistChoferId] = useState('')
  const [histTurno, setHistTurno] = useState('mañana')
  const [histRegistros, setHistRegistros] = useState([])
  const [histCargando, setHistCargando] = useState(false)
  const [histEntradaSeleccionada, setHistEntradaSeleccionada] = useState(null)

  useEffect(() => { cargarDatos() }, [])
  useEffect(() => { if (tab === 'pallets' && clientesPallets.length > 0) cargarSaldosPallets() }, [tab, clientesPallets])

  async function cargarSaldosPallets() {
    const lecturas = await Promise.all(
      clientesPallets.map(cliente => {
        const idCliente = cliente.toLowerCase().replace(/\s+/g, '-')
        return getDoc(doc(db, 'saldosPallets', idCliente))
      })
    )
    const mapa = {}
    clientesPallets.forEach((cliente, i) => {
      const snap = lecturas[i]
      mapa[cliente] = snap.exists() ? { rec: snap.data().rec || 0, dev: snap.data().dev || 0 } : { rec: 0, dev: 0 }
    })
    setSaldosPallets(mapa)
  }

  async function ajustarSaldo(cliente, tipo) {
    const valorTexto = ajustesInput[cliente]
    const valor = Number(valorTexto)
    if (!valorTexto || isNaN(valor) || valor === 0) {
      setAvisoAjuste('Ingresá un número distinto de cero (puede ser negativo).')
      setTimeout(() => setAvisoAjuste(''), 3000)
      return
    }
    setAjustando(cliente)
    const idCliente = cliente.toLowerCase().replace(/\s+/g, '-')
    await setDoc(doc(db, 'saldosPallets', idCliente), {
      cliente,
      [tipo]: increment(valor)
    }, { merge: true })
    setAjustesInput(prev => ({ ...prev, [cliente]: '' }))
    await cargarSaldosPallets()
    setAjustando(null)
  }

  async function cargarDatos() {
    setCargando(true)
    const [snapUsuarios, snapChoferes, snapClientes, snapConfig] = await Promise.all([
      getDocs(collection(db, 'usuarios')),
      getDocs(collection(db, 'choferes')),
      getDocs(collection(db, 'clientes')),
      getDoc(doc(db, 'config', 'pallets'))
    ])
    setUsuarios(snapUsuarios.docs.map(d => ({ uid: d.id, ...d.data() })))
    setChoferes(snapChoferes.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0)))
    setClientes(snapClientes.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nombre.localeCompare(b.nombre)))
    if (snapConfig.exists()) {
      setClientesPallets(snapConfig.data().clientes || [])
    } else {
      setClientesPallets([])
    }
    setCargando(false)
  }

  async function crearUsuario() {
    setError('')
    setGuardando(true)
    try {
      const email = `${formUsuario.nombre.toLowerCase().replace(/\s+/g, '.')}@berro.internal`

      const { initializeApp, deleteApp } = await import('firebase/app')
      const { getAuth, createUserWithEmailAndPassword: createUserSecondary } = await import('firebase/auth')

      const secondaryApp = initializeApp({
        apiKey: "AIzaSyA3klqJwguVNMc2cYCVf1sMXIS9_Mxw78M",
        authDomain: "planillasberro.firebaseapp.com",
        projectId: "planillasberro",
        storageBucket: "planillasberro.firebasestorage.app",
        messagingSenderId: "219500673907",
        appId: "1:219500673907:web:f3fa35fd9f78a615826306"
      }, 'secondary-' + Date.now())

      const secondaryAuth = getAuth(secondaryApp)
      const cred = await createUserSecondary(secondaryAuth, email, formUsuario.password)
      await deleteApp(secondaryApp)

      await setDoc(doc(db, 'usuarios', cred.user.uid), {
        nombre: formUsuario.nombre,
        email,
        rol: formUsuario.rol,
        choferId: formUsuario.rol === 'chofer' ? formUsuario.choferId : '',
        activo: true,
        creadoAt: new Date()
      })
      setExito(`Usuario "${formUsuario.nombre}" creado`)
      setFormUsuario({ nombre: '', password: '', rol: 'operador', choferId: '' })
      setMostrarFormUsuario(false)
      cargarDatos()
      setTimeout(() => setExito(''), 4000)
    } catch (e) { setError(e.message) }
    setGuardando(false)
  }

  async function toggleActivoUsuario(uid, activo) {
    await updateDoc(doc(db, 'usuarios', uid), { activo: !activo })
    cargarDatos()
  }

  async function guardarChofer() {
    setGuardando(true)
    if (editandoChofer) {
      await updateDoc(doc(db, 'choferes', editandoChofer.id), { nombre: formChofer.nombre, activo: formChofer.activo })
      setExito('Chofer actualizado')
    } else {
      const nuevoId = formChofer.nombre.toLowerCase().replace(/\s+/g, '-')
      await setDoc(doc(db, 'choferes', nuevoId), {
        nombre: formChofer.nombre,
        activo: true,
        orden: choferes.length
      })
      setExito('Chofer agregado')
    }
    setFormChofer({ nombre: '', activo: true })
    setEditandoChofer(null)
    setMostrarFormChofer(false)
    cargarDatos()
    setTimeout(() => setExito(''), 4000)
    setGuardando(false)
  }

  async function eliminarChofer(id) {
    if (!window.confirm('¿Eliminar este chofer?')) return
    await deleteDoc(doc(db, 'choferes', id))
    cargarDatos()
  }

  async function moverChofer(id, direccion) {
    const idx = choferes.findIndex(c => c.id === id)
    const nuevoIdx = idx + direccion
    if (nuevoIdx < 0 || nuevoIdx >= choferes.length) return
    const nuevos = [...choferes]
    const temp = nuevos[idx]
    nuevos[idx] = nuevos[nuevoIdx]
    nuevos[nuevoIdx] = temp
    await Promise.all(nuevos.map((c, i) => updateDoc(doc(db, 'choferes', c.id), { orden: i })))
    cargarDatos()
  }

  async function guardarCliente() {
    setGuardando(true)
    const nombreUpper = formCliente.nombre.trim().toUpperCase()
    if (editandoCliente) {
      await updateDoc(doc(db, 'clientes', editandoCliente.id), { nombre: nombreUpper })
      setExito('Cliente actualizado')
    } else {
      const nuevoId = nombreUpper.toLowerCase().replace(/\s+/g, '-')
      await setDoc(doc(db, 'clientes', nuevoId), { nombre: nombreUpper, activo: true })
      setExito('Cliente agregado')
    }
    setFormCliente({ nombre: '' })
    setEditandoCliente(null)
    setMostrarFormCliente(false)
    cargarDatos()
    setTimeout(() => setExito(''), 4000)
    setGuardando(false)
  }

  async function eliminarCliente(id) {
    if (!window.confirm('¿Eliminar este cliente del catálogo?')) return
    await deleteDoc(doc(db, 'clientes', id))
    cargarDatos()
  }

  async function toggleClientePallets(clienteNombre) {
    const nuevos = clientesPallets.includes(clienteNombre)
      ? clientesPallets.filter(c => c !== clienteNombre)
      : [...clientesPallets, clienteNombre]
    setClientesPallets(nuevos)
    await setDoc(doc(db, 'config', 'pallets'), { clientes: nuevos })
  }

  const rolColor = { admin: '#e53e3e', operador: '#3182ce', chofer: '#38a169' }

  async function buscarHistorial() {
    if (!histChoferId) return
    setHistCargando(true)
    setHistEntradaSeleccionada(null)
    try {
      const histRef = collection(db, 'planillas', histFecha, 'choferes', `${histChoferId}_${histTurno}`, 'historial')
      const snap = await getDocs(query(histRef, orderBy('modificadoAt', 'desc')))
      setHistRegistros(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      setHistRegistros([])
    }
    setHistCargando(false)
  }

  return (
    <div style={{ padding: 'clamp(12px,4vw,24px)', maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 24px', color: '#1a1a2e' }}>Administración</h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[['usuarios', '👤 Usuarios'], ['choferes', '🚚 Choferes'], ['clientes', '🏢 Clientes'], ['pallets', '📦 Pallets a desarmar'], ['historial', '📋 Historial']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={tabStyle(tab === key)}>{label}</button>
        ))}
      </div>

      {exito && <div style={{ background: '#e6ffed', border: '1px solid #38a169', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#276749' }}>{exito}</div>}
      {error && <div style={{ background: '#fff5f5', border: '1px solid #e53e3e', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#c53030' }}>{error}</div>}

      {tab === 'usuarios' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button onClick={() => setMostrarFormUsuario(!mostrarFormUsuario)}
              style={{ padding: '10px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              {mostrarFormUsuario ? 'Cancelar' : '+ Nuevo usuario'}
            </button>
          </div>
          {mostrarFormUsuario && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 20px' }}>Nuevo usuario</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Nombre</label>
                  <input style={inputStyle} value={formUsuario.nombre} onChange={e => setFormUsuario({ ...formUsuario, nombre: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Contraseña</label>
                  <input style={inputStyle} type="password" value={formUsuario.password} onChange={e => setFormUsuario({ ...formUsuario, password: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Rol</label>
                  <select style={inputStyle} value={formUsuario.rol} onChange={e => setFormUsuario({ ...formUsuario, rol: e.target.value })}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                {formUsuario.rol === 'chofer' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Chofer asociado</label>
                    <select style={inputStyle} value={formUsuario.choferId} onChange={e => setFormUsuario({ ...formUsuario, choferId: e.target.value })}>
                      <option value="">— Seleccionar —</option>
                      {choferes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <button onClick={crearUsuario} disabled={guardando || !formUsuario.nombre || !formUsuario.password}
                style={{ padding: '10px 24px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                {guardando ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          )}
          {cargando ? <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando...</div> : (
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['Nombre', 'Rol', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.uid}>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ fontWeight: '600' }}>{u.nombre}</div>
                        <div style={{ fontSize: '12px', color: '#aaa' }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{ background: rolColor[u.rol] + '20', color: rolColor[u.rol], padding: '3px 10px', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>{u.rol}</span>
                      </td>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{ color: u.activo ? '#38a169' : '#e53e3e', fontWeight: '600', fontSize: '13px' }}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                      </td>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                        <button onClick={() => toggleActivoUsuario(u.uid, u.activo)}
                          style={{ padding: '6px 14px', background: u.activo ? '#fff5f5' : '#e6ffed', color: u.activo ? '#e53e3e' : '#38a169', border: `1px solid ${u.activo ? '#e53e3e' : '#38a169'}`, borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'choferes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button onClick={() => { setMostrarFormChofer(!mostrarFormChofer); setEditandoChofer(null); setFormChofer({ nombre: '', activo: true }) }}
              style={{ padding: '10px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              {mostrarFormChofer ? 'Cancelar' : '+ Nuevo chofer'}
            </button>
          </div>
          {mostrarFormChofer && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 20px' }}>{editandoChofer ? 'Editar chofer' : 'Nuevo chofer'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Nombre</label>
                  <input style={inputStyle} value={formChofer.nombre} onChange={e => setFormChofer({ ...formChofer, nombre: e.target.value })} />
                </div>
              </div>
              <button onClick={guardarChofer} disabled={guardando || !formChofer.nombre}
                style={{ padding: '10px 24px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                {guardando ? 'Guardando...' : editandoChofer ? 'Actualizar' : 'Agregar'}
              </button>
            </div>
          )}
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  {['Orden', 'Nombre', 'Estado', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {choferes.map((c, idx) => (
                  <tr key={c.id}>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => moverChofer(c.id, -1)} disabled={idx === 0}
                          style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: 'white', fontSize: '12px' }}>↑</button>
                        <button onClick={() => moverChofer(c.id, 1)} disabled={idx === choferes.length - 1}
                          style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: 'white', fontSize: '12px' }}>↓</button>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: '600' }}>{c.nombre}</td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ color: c.activo ? '#38a169' : '#e53e3e', fontWeight: '600', fontSize: '13px' }}>{c.activo ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: '8px' }}>
                      <button onClick={() => { setEditandoChofer(c); setFormChofer({ nombre: c.nombre, activo: c.activo }); setMostrarFormChofer(true) }}
                        style={{ padding: '6px 14px', background: '#ebf8ff', color: '#3182ce', border: '1px solid #3182ce', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                        Editar
                      </button>
                      <button onClick={() => eliminarChofer(c.id)}
                        style={{ padding: '6px 14px', background: '#fff5f5', color: '#e53e3e', border: '1px solid #e53e3e', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {choferes.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No hay choferes. Agregá el primero.</td></tr>
                )}
              </tbody>
            </table>
              </div>
          </div>
        </div>
      )}

      {tab === 'clientes' && (
        <div>
          <p style={{ color: '#666', marginBottom: '16px', fontSize: '14px' }}>
            Catálogo general de clientes convenio. Esta lista alimenta los desplegables de la planilla.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button onClick={() => { setMostrarFormCliente(!mostrarFormCliente); setEditandoCliente(null); setFormCliente({ nombre: '' }) }}
              style={{ padding: '10px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              {mostrarFormCliente ? 'Cancelar' : '+ Nuevo cliente'}
            </button>
          </div>
          {mostrarFormCliente && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 20px' }}>{editandoCliente ? 'Editar cliente' : 'Nuevo cliente'}</h3>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Nombre del cliente</label>
                <input style={inputStyle} value={formCliente.nombre} onChange={e => setFormCliente({ nombre: e.target.value })} placeholder="Ej: ACME SA" />
              </div>
              <button onClick={guardarCliente} disabled={guardando || !formCliente.nombre}
                style={{ padding: '10px 24px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                {guardando ? 'Guardando...' : editandoCliente ? 'Actualizar' : 'Agregar'}
              </button>
            </div>
          )}
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  {['Nombre', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientes.map(c => (
                  <tr key={c.id}>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: '600' }}>{c.nombre}</td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: '8px' }}>
                      <button onClick={() => { setEditandoCliente(c); setFormCliente({ nombre: c.nombre }); setMostrarFormCliente(true) }}
                        style={{ padding: '6px 14px', background: '#ebf8ff', color: '#3182ce', border: '1px solid #3182ce', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                        Editar
                      </button>
                      <button onClick={() => eliminarCliente(c.id)}
                        style={{ padding: '6px 14px', background: '#fff5f5', color: '#e53e3e', border: '1px solid #e53e3e', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {clientes.length === 0 && (
                  <tr><td colSpan={2} style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No hay clientes cargados. Agregá el primero.</td></tr>
                )}
              </tbody>
            </table>
              </div>
          </div>
        </div>
      )}

      {tab === 'pallets' && (
        <div>
          <p style={{ color: '#666', marginBottom: '16px', fontSize: '14px' }}>Seleccioná los clientes que aparecen por defecto en el resumen de pallets a desarmar.</p>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {clientes.map(c => (
                <div key={c.id} onClick={() => toggleClientePallets(c.nombre)}
                  style={{ padding: '10px 14px', border: `2px solid ${clientesPallets.includes(c.nombre) ? '#1a1a2e' : '#e2e8f0'}`, borderRadius: '8px', cursor: 'pointer', background: clientesPallets.includes(c.nombre) ? '#1a1a2e' : 'white', color: clientesPallets.includes(c.nombre) ? 'white' : '#444', fontWeight: clientesPallets.includes(c.nombre) ? '600' : '400', fontSize: '14px' }}>
                  {clientesPallets.includes(c.nombre) ? '✓ ' : ''}{c.nombre}
                </div>
              ))}
            </div>
            {clientes.length === 0 && (
              <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Primero agregá clientes en la pestaña "Clientes".</p>
            )}
          </div>

          {clientesPallets.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 6px', color: '#1a1a2e', fontSize: '16px' }}>Ajustar saldos manualmente</h3>
              <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#888' }}>
                Sumá o restá una cantidad al recibido o al devuelto de cada cliente. Usá números negativos para restar (ej: -3).
              </p>

              {avisoAjuste && (
                <div style={{ background: '#fff3cd', color: '#856404', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
                  {avisoAjuste}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {clientesPallets.map(cliente => {
                  const saldo = saldosPallets[cliente]
                  const saldoNeto = saldo ? saldo.rec - saldo.dev : 0
                  return (
                    <div key={cliente} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: '140px', flex: '1 1 140px' }}>
                        <div style={{ fontWeight: '700', color: '#1a1a2e' }}>{cliente}</div>
                        {saldo && (
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            REC: {saldo.rec} · DEV: {saldo.dev} · Saldo: <strong style={{ color: saldoNeto > 0 ? '#e53e3e' : saldoNeto < 0 ? '#38a169' : '#666' }}>{saldoNeto > 0 ? `+${saldoNeto}` : saldoNeto}</strong>
                          </div>
                        )}
                      </div>
                      <input
                        type="number"
                        placeholder="+5 o -3"
                        value={ajustesInput[cliente] || ''}
                        onChange={e => setAjustesInput(prev => ({ ...prev, [cliente]: e.target.value }))}
                        style={{ width: '90px', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                      />
                      <button
                        disabled={ajustando === cliente}
                        onClick={() => ajustarSaldo(cliente, 'rec')}
                        style={{ padding: '8px 14px', background: '#fff5f5', color: '#e53e3e', border: '1px solid #e53e3e', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: ajustando === cliente ? 'not-allowed' : 'pointer' }}>
                        Ajustar Recibido
                      </button>
                      <button
                        disabled={ajustando === cliente}
                        onClick={() => ajustarSaldo(cliente, 'dev')}
                        style={{ padding: '8px 14px', background: '#e6ffed', color: '#38a169', border: '1px solid #38a169', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: ajustando === cliente ? 'not-allowed' : 'pointer' }}>
                        Ajustar Devuelto
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {tab === 'historial' && (
        <div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Fecha</label>
                <input type="date" value={histFecha} onChange={e => setHistFecha(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Chofer</label>
                <select value={histChoferId} onChange={e => setHistChoferId(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', minWidth: '180px' }}>
                  <option value="">— Seleccionar —</option>
                  {choferes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Turno</label>
                <select value={histTurno} onChange={e => setHistTurno(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}>
                  <option value="mañana">Mañana</option>
                  <option value="tarde">Tarde</option>
                </select>
              </div>
              <button onClick={buscarHistorial} disabled={!histChoferId || histCargando}
                style={{ padding: '9px 24px', background: histChoferId ? '#1a1a2e' : '#aaa', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: histChoferId ? 'pointer' : 'not-allowed' }}>
                {histCargando ? 'Buscando...' : 'Ver historial'}
              </button>
            </div>
          </div>

          {histRegistros.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: histEntradaSeleccionada ? '1fr 2fr' : '1fr', gap: '20px' }}>
              {/* Lista de versiones */}
              <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: '600', color: '#1a1a2e', fontSize: '14px' }}>
                  {histRegistros.length} versiones guardadas
                </div>
                {histRegistros.map((r, idx) => {
                  const fechaHora = new Date(r.modificadoAt).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                  const seleccionado = histEntradaSeleccionada?.id === r.id
                  return (
                    <div key={r.id}
                      onClick={() => setHistEntradaSeleccionada(seleccionado ? null : r)}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f0f0f0',
                        cursor: 'pointer',
                        background: seleccionado ? '#f0f4ff' : 'white',
                        borderLeft: seleccionado ? '3px solid #1a1a2e' : '3px solid transparent'
                      }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a1a2e' }}>{r.modificadoNombre}</div>
                      <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{fechaHora}</div>
                      <div style={{ fontSize: '12px', color: r.cambios?.length > 0 ? '#3182ce' : '#aaa', marginTop: '4px' }}>
                        {idx === histRegistros.length - 1 ? 'Versión inicial' : `${r.cambios?.length || 0} cambio${r.cambios?.length !== 1 ? 's' : ''}`}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Detalle del diff */}
              {histEntradaSeleccionada && (
                <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: '600', color: '#1a1a2e', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Cambios — {histEntradaSeleccionada.modificadoNombre}</span>
                    <button onClick={() => setHistEntradaSeleccionada(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#888' }}>✕</button>
                  </div>
                  {!histEntradaSeleccionada.cambios || histEntradaSeleccionada.cambios.length === 0 ? (
                    <div style={{ padding: '24px', color: '#888', fontSize: '14px', textAlign: 'center' }}>
                      Versión inicial — sin cambios previos para comparar
                    </div>
                  ) : (
                    <div style={{ padding: '16px' }}>
                      {['Entregas', 'Levantes', 'Clientes puntuales', 'Devolución pallets'].map(seccion => {
                        const cambiosSeccion = histEntradaSeleccionada.cambios.filter(c => c.seccion === seccion)
                        if (cambiosSeccion.length === 0) return null
                        return (
                          <div key={seccion} style={{ marginBottom: '20px' }}>
                            <div style={{ fontWeight: '600', fontSize: '13px', color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {seccion}
                            </div>
                            {cambiosSeccion.map((c, i) => (
                              <div key={i} style={{ background: '#f8f9fa', borderRadius: '8px', padding: '10px 14px', marginBottom: '6px', fontSize: '13px' }}>
                                <span style={{ fontWeight: '600', color: '#1a1a2e' }}>Fila {c.fila} — {c.campo}</span>
                                <div style={{ marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <span style={{ background: '#fff0f0', color: '#c53030', padding: '2px 8px', borderRadius: '4px', textDecoration: 'line-through' }}>{c.de}</span>
                                  <span style={{ color: '#888' }}>→</span>
                                  <span style={{ background: '#e6ffed', color: '#276749', padding: '2px 8px', borderRadius: '4px' }}>{c.a}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {histRegistros.length === 0 && !histCargando && histChoferId && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#888', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              No hay historial para esta planilla todavía.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
