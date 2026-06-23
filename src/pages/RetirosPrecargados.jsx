import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import SelectorCliente from '../components/SelectorCliente.jsx'

const IS = { width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }

export default function RetirosPrecargados() {
  const navigate = useNavigate()
  const [choferes, setChoferes] = useState([])
  const [todosClientes, setTodosClientes] = useState([])
  const [choferId, setChoferId] = useState('')
  const [turno, setTurno] = useState('mañana')
  const [clientes, setClientes] = useState(Array(10).fill(''))
  const [cargando, setCargando] = useState(true)
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    cargarBase()
  }, [])

  useEffect(() => {
    if (choferId) cargarPlantilla()
  }, [choferId, turno])

  async function cargarBase() {
    const [snapChoferes, snapClientes] = await Promise.all([
      getDocs(collection(db, 'choferes')),
      getDocs(collection(db, 'clientes'))
    ])
    const listaChoferes = snapChoferes.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0))
    setChoferes(listaChoferes)
    setTodosClientes(snapClientes.docs.map(d => d.data().nombre).sort())
    if (listaChoferes.length > 0) setChoferId(listaChoferes[0].id)
    setCargando(false)
  }

  async function cargarPlantilla() {
    setCargandoPlantilla(true)
    const ref = doc(db, 'retirosPrecargados', `${choferId}_${turno}`)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const lista = snap.data().clientes || []
      // Asegurar al menos 10 filas, agregando vacías si faltan
      const conMinimo = [...lista]
      while (conMinimo.length < 10) conMinimo.push('')
      setClientes(conMinimo)
    } else {
      setClientes(Array(10).fill(''))
    }
    setCargandoPlantilla(false)
  }

  function actualizarCliente(i, valor) {
    const nuevos = [...clientes]
    nuevos[i] = valor
    setClientes(nuevos)
  }

  function agregarFila() {
    setClientes([...clientes, ''])
  }

  function quitarFila(i) {
    const nuevos = clientes.filter((_, idx) => idx !== i)
    setClientes(nuevos)
  }

  async function guardar() {
    setGuardando(true)
    const limpios = clientes.filter(c => c.trim())
    await setDoc(doc(db, 'retirosPrecargados', `${choferId}_${turno}`), {
      choferId,
      turno,
      clientes: limpios
    })
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  const choferNombre = choferes.find(c => c.id === choferId)?.nombre || ''

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Cargando...</div>

  return (
    <div style={{ padding: 'clamp(12px,4vw,24px)', maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '4px' }}>←</button>
        <h2 style={{ margin: 0, color: '#1a1a2e' }}>Retiros precargados</h2>
      </div>

      <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
        Armá la lista de clientes habituales para cada chofer y turno. Después, desde la planilla del día,
        van a poder cargarla con un solo click en vez de escribir cliente por cliente.
      </p>

      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Chofer</label>
            <select value={choferId} onChange={e => setChoferId(e.target.value)} style={IS}>
              {choferes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>Turno</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['mañana', 'tarde'].map(t => (
                <button key={t} onClick={() => setTurno(t)}
                  style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', background: turno === t ? '#1a1a2e' : '#e2e8f0', color: turno === t ? 'white' : '#444' }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: '600', color: '#1a1a2e', marginBottom: '14px' }}>
          Clientes habituales — {choferNombre} ({turno})
        </div>

        {cargandoPlantilla ? (
          <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>Cargando plantilla...</div>
        ) : (
          <>
            {clientes.map((cliente, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <span style={{ width: '22px', color: '#aaa', fontSize: '13px', textAlign: 'right' }}>{i + 1}.</span>
                <div style={{ flex: 1 }}>
                  <SelectorCliente
                    value={cliente}
                    clientes={todosClientes}
                    placeholder="Nombre del cliente..."
                    style={IS}
                    onSelect={(nombre) => actualizarCliente(i, nombre)}
                  />
                </div>
                <button onClick={() => quitarFila(i)} title="Quitar fila"
                  style={{ background: 'none', border: 'none', color: '#bbb', fontSize: '18px', cursor: 'pointer', padding: '4px 8px' }}>
                  ✕
                </button>
              </div>
            ))}
            <button onClick={agregarFila}
              style={{ marginTop: '8px', padding: '8px 16px', background: '#f0f4ff', color: '#3182ce', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
              + Agregar fila
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
        {guardado && <span style={{ color: 'green', fontSize: '14px' }}>✓ Guardado</span>}
        <button onClick={guardar} disabled={guardando}
          style={{ padding: '12px 32px', background: guardando ? '#aaa' : '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: guardando ? 'not-allowed' : 'pointer' }}>
          {guardando ? 'Guardando...' : 'Guardar plantilla'}
        </button>
      </div>
    </div>
  )
}
