import { useState, useEffect } from 'react'
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { createUserWithEmailAndPassword, updatePassword } from 'firebase/auth'
import { auth, db } from '../firebase'

const ROLES = ['admin', 'operador', 'chofer']

const CHOFERES = [
  { id: 'javier-astrada', nombre: 'Javier Astrada' },
  { id: 'eduardo-rodriguez', nombre: 'Eduardo Rodriguez' },
  { id: 'michael-castano', nombre: 'Michael Castaño' },
  { id: 'sergio-capitani', nombre: 'Sergio Capitani' },
  { id: 'daniel-soria', nombre: 'Daniel Soria' },
  { id: 'anthony-stabile', nombre: 'Anthony Stabile' },
  { id: 'martin-pastor', nombre: 'Martin Pastor' },
  { id: 'carlos-figueira', nombre: 'Carlos Figueira' },
  { id: 'diego-cardozo', nombre: 'Diego Cardozo' },
  { id: 'carlos-bermejo', nombre: 'Carlos Bermejo' },
]

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #ddd',
  borderRadius: '8px',
  fontSize: '14px',
  boxSizing: 'border-box'
}

export default function Admin() {
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', password: '', rol: 'operador', choferId: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  async function cargarUsuarios() {
    setCargando(true)
    const snap = await getDocs(collection(db, 'usuarios'))
    setUsuarios(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
    setCargando(false)
  }

  useEffect(() => { cargarUsuarios() }, [])

  async function crearUsuario() {
    setError('')
    setGuardando(true)
    try {
      const email = `${form.nombre.toLowerCase().replace(/\s+/g, '.')}@berro.internal`
      const cred = await createUserWithEmailAndPassword(auth, email, form.password)
      await setDoc(doc(db, 'usuarios', cred.user.uid), {
        nombre: form.nombre,
        email,
        rol: form.rol,
        choferId: form.rol === 'chofer' ? form.choferId : '',
        activo: true,
        creadoAt: new Date()
      })
      setExito(`Usuario "${form.nombre}" creado exitosamente`)
      setForm({ nombre: '', password: '', rol: 'operador', choferId: '' })
      setMostrarForm(false)
      cargarUsuarios()
      setTimeout(() => setExito(''), 4000)
    } catch (e) {
      setError(e.message)
    }
    setGuardando(false)
  }

  async function toggleActivo(uid, activo) {
    await updateDoc(doc(db, 'usuarios', uid), { activo: !activo })
    cargarUsuarios()
  }

  const rolColor = { admin: '#e53e3e', operador: '#3182ce', chofer: '#38a169' }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: '#1a1a2e' }}>Administración de usuarios</h2>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          style={{ padding: '10px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          {mostrarForm ? 'Cancelar' : '+ Nuevo usuario'}
        </button>
      </div>

      {exito && <div style={{ background: '#e6ffed', border: '1px solid #38a169', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#276749' }}>{exito}</div>}
      {error && <div style={{ background: '#fff5f5', border: '1px solid #e53e3e', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#c53030' }}>{error}</div>}

      {mostrarForm && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 20px', color: '#1a1a2e' }}>Nuevo usuario</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Nombre de usuario</label>
              <input style={inputStyle} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Juan Garcia" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Contraseña</label>
              <input style={inputStyle} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Rol</label>
              <select style={inputStyle} value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>
                {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            {form.rol === 'chofer' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Chofer asociado</label>
                <select style={inputStyle} value={form.choferId} onChange={e => setForm({ ...form, choferId: e.target.value })}>
                  <option value="">— Seleccionar —</option>
                  {CHOFERES.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}
          </div>
          <button
            onClick={crearUsuario}
            disabled={guardando || !form.nombre || !form.password}
            style={{ padding: '10px 24px', background: guardando ? '#aaa' : '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            {guardando ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      )}

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando usuarios...</div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {usuarios.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No hay usuarios creados aún</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', borderBottom: '2px solid #e2e8f0' }}>Nombre</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', borderBottom: '2px solid #e2e8f0' }}>Rol</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', borderBottom: '2px solid #e2e8f0' }}>Estado</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', color: '#666', borderBottom: '2px solid #e2e8f0' }}>Acciones</th>
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
                      <span style={{ background: rolColor[u.rol] + '20', color: rolColor[u.rol], padding: '3px 10px', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>
                        {u.rol}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ color: u.activo ? '#38a169' : '#e53e3e', fontWeight: '600', fontSize: '13px' }}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                      <button
                        onClick={() => toggleActivo(u.uid, u.activo)}
                        style={{ padding: '6px 14px', background: u.activo ? '#fff5f5' : '#e6ffed', color: u.activo ? '#e53e3e' : '#38a169', border: `1px solid ${u.activo ? '#e53e3e' : '#38a169'}`, borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}