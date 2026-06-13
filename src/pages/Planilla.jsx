import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../hooks/useAuth'

const CLIENTES = [
  'ATTACK','BERLISUR','BONOMI','CIBELES','CRISOLES','DORALBEN',
  'FIVISA PROPIOS','FIVISA URUGUAY','HILOS PLASTICOS','KONIG','LIEPSI',
  'LIVIO CENTRO','LIVIO RUTA','MACCIO','MATRIX','MICROSULES','MONTANS',
  'MORSELOY','MOURA','NADIFER','PEDRO MERLA','PIRELLI','PRONTOMETAL',
  'RADESCA','RASA','RAYDORAT','REDMAY','ROMANCE','RUTILAN','SAGRIN',
  'SAMAN','SEBAMAR','SINTEPLAST','SOLTIS','STADIUM','SUDEL','SUPRANOR',
  'TAFIREL','TECLUM','TIMATA','TORBUL','TRIMANT','VICAS','WEB','WURTH'
]

const CHOFERES = {
  'javier-astrada': 'Javier Astrada',
  'eduardo-rodriguez': 'Eduardo Rodriguez',
  'michael-castano': 'Michael Castaño',
  'sergio-capitani': 'Sergio Capitani',
  'daniel-soria': 'Daniel Soria',
  'anthony-stabile': 'Anthony Stabile',
  'martin-pastor': 'Martin Pastor',
  'carlos-figueira': 'Carlos Figueira',
  'diego-cardozo': 'Diego Cardozo',
  'carlos-bermejo': 'Carlos Bermejo',
}

function entregaVacia() {
  return { remitente: '', destinatario: '', aCobrar: '', bultos: '', comentarios: '' }
}

function levanteVacio() {
  return { cliente: '', horaLlegada: '', horaSalida: '', bultos: '', palletDesarmar: '' }
}

function devolucionVacia() {
  return { cliente: '', cantidad: '' }
}

const inputStyle = {
  width: '100%',
  padding: '7px 10px',
  border: '1px solid #ddd',
  borderRadius: '6px',
  fontSize: '14px',
  boxSizing: 'border-box'
}

const labelStyle = {
  fontSize: '12px',
  color: '#666',
  marginBottom: '4px',
  display: 'block'
}

export default function Planilla() {
  const { fecha, choferId } = useParams()
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [turno, setTurno] = useState('mañana')
  const [entregas, setEntregas] = useState(Array(8).fill(null).map(entregaVacia))
  const [levantes, setLevantes] = useState(Array(9).fill(null).map(levanteVacio))
  const [devoluciones, setDevoluciones] = useState(Array(3).fill(null).map(devolucionVacia))
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [cargando, setCargando] = useState(true)

  const esChofer = usuario.rol === 'chofer'

  useEffect(() => {
    async function cargarDatos() {
      setCargando(true)
      const ref = doc(db, 'planillas', fecha, 'choferes', `${choferId}_${turno}`)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const data = snap.data()
        setEntregas(data.entregas || Array(8).fill(null).map(entregaVacia))
        setLevantes(data.levantes || Array(9).fill(null).map(levanteVacio))
        setDevoluciones(data.devoluciones || Array(3).fill(null).map(devolucionVacia))
      } else {
        setEntregas(Array(8).fill(null).map(entregaVacia))
        setLevantes(Array(9).fill(null).map(levanteVacio))
        setDevoluciones(Array(3).fill(null).map(devolucionVacia))
      }
      setCargando(false)
    }
    cargarDatos()
  }, [fecha, choferId, turno])

  async function guardar() {
    setGuardando(true)
    const ref = doc(db, 'planillas', fecha, 'choferes', `${choferId}_${turno}`)
    await setDoc(ref, {
      entregas,
      levantes,
      devoluciones,
      modificadoPor: usuario.uid,
      modificadoNombre: usuario.nombre,
      modificadoAt: serverTimestamp()
    }, { merge: true })
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 3000)
  }

  function marcarLlegada(i) {
    const hora = new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
    const nuevos = [...levantes]
    nuevos[i] = { ...nuevos[i], horaLlegada: hora }
    setLevantes(nuevos)
  }

  function marcarSalida(i) {
    const hora = new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
    const nuevos = [...levantes]
    nuevos[i] = { ...nuevos[i], horaSalida: hora }
    setLevantes(nuevos)
  }

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando...</div>

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>←</button>
        <div>
          <h2 style={{ margin: 0, color: '#1a1a2e' }}>{CHOFERES[choferId]}</h2>
          <div style={{ fontSize: '14px', color: '#888' }}>{fecha}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {['mañana', 'tarde'].map(t => (
            <button
              key={t}
              onClick={() => setTurno(t)}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '600',
                background: turno === t ? '#1a1a2e' : '#e2e8f0',
                color: turno === t ? 'white' : '#444'
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ENTREGAS */}
      {!esChofer && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', color: '#1a1a2e' }}>Entregas</h3>
          {entregas.map((e, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 80px 1fr', gap: '8px', marginBottom: '10px', alignItems: 'end' }}>
              <div>
                {i === 0 && <label style={labelStyle}>Remitente</label>}
                <input style={inputStyle} value={e.remitente} onChange={ev => { const n=[...entregas]; n[i].remitente=ev.target.value; setEntregas(n) }} />
              </div>
              <div>
                {i === 0 && <label style={labelStyle}>Destinatario</label>}
                <input style={inputStyle} value={e.destinatario} onChange={ev => { const n=[...entregas]; n[i].destinatario=ev.target.value; setEntregas(n) }} />
              </div>
              <div>
                {i === 0 && <label style={labelStyle}>A cobrar</label>}
                <input style={inputStyle} value={e.aCobrar} onChange={ev => { const n=[...entregas]; n[i].aCobrar=ev.target.value; setEntregas(n) }} />
              </div>
              <div>
                {i === 0 && <label style={labelStyle}>Bultos</label>}
                <input style={inputStyle} type="number" value={e.bultos} onChange={ev => { const n=[...entregas]; n[i].bultos=ev.target.value; setEntregas(n) }} />
              </div>
              <div>
                {i === 0 && <label style={labelStyle}>Comentarios</label>}
                <input style={inputStyle} value={e.comentarios} onChange={ev => { const n=[...entregas]; n[i].comentarios=ev.target.value; setEntregas(n) }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LEVANTES */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 16px', color: '#1a1a2e' }}>Levantes</h3>
        {levantes.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 80px 80px', gap: '8px', marginBottom: '10px', alignItems: 'end' }}>
            <div>
              {i === 0 && <label style={labelStyle}>Cliente</label>}
              <select style={inputStyle} value={l.cliente} onChange={ev => { const n=[...levantes]; n[i].cliente=ev.target.value; setLevantes(n) }}>
                <option value="">— Seleccionar —</option>
                {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              {i === 0 && <label style={labelStyle}>Hora llegada</label>}
              {esChofer ? (
                <button onClick={() => marcarLlegada(i)} style={{ ...inputStyle, background: l.horaLlegada ? '#e6ffed' : '#f7f7f7', cursor: 'pointer', textAlign: 'center' }}>
                  {l.horaLlegada || '⏱ Llegada'}
                </button>
              ) : (
                <input style={inputStyle} value={l.horaLlegada} onChange={ev => { const n=[...levantes]; n[i].horaLlegada=ev.target.value; setLevantes(n) }} placeholder="HH:MM" />
              )}
            </div>
            <div>
              {i === 0 && <label style={labelStyle}>Hora salida</label>}
              {esChofer ? (
                <button onClick={() => marcarSalida(i)} style={{ ...inputStyle, background: l.horaSalida ? '#e6ffed' : '#f7f7f7', cursor: 'pointer', textAlign: 'center' }}>
                  {l.horaSalida || '⏱ Salida'}
                </button>
              ) : (
                <input style={inputStyle} value={l.horaSalida} onChange={ev => { const n=[...levantes]; n[i].horaSalida=ev.target.value; setLevantes(n) }} placeholder="HH:MM" />
              )}
            </div>
            <div>
              {i === 0 && <label style={labelStyle}>Bultos</label>}
              <input style={inputStyle} type="number" value={l.bultos} onChange={ev => { const n=[...levantes]; n[i].bultos=ev.target.value; setLevantes(n) }} />
            </div>
            <div>
              {i === 0 && <label style={labelStyle}>Pallets</label>}
              <input style={inputStyle} type="number" value={l.palletDesarmar} onChange={ev => { const n=[...levantes]; n[i].palletDesarmar=ev.target.value; setLevantes(n) }} />
            </div>
          </div>
        ))}
      </div>

      {/* DEVOLUCIÓN PALLETS */}
      {!esChofer && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', color: '#1a1a2e' }}>Devolución de Pallets</h3>
          {devoluciones.map((d, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '8px', marginBottom: '10px', alignItems: 'end' }}>
              <div>
                {i === 0 && <label style={labelStyle}>Cliente</label>}
                <select style={inputStyle} value={d.cliente} onChange={ev => { const n=[...devoluciones]; n[i].cliente=ev.target.value; setDevoluciones(n) }}>
                  <option value="">— Seleccionar —</option>
                  {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                {i === 0 && <label style={labelStyle}>Cantidad</label>}
                <input style={inputStyle} type="number" value={d.cantidad} onChange={ev => { const n=[...devoluciones]; n[i].cantidad=ev.target.value; setDevoluciones(n) }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        {guardado && <span style={{ color: 'green', alignSelf: 'center', fontSize: '14px' }}>✓ Guardado</span>}
        <button
          onClick={guardar}
          disabled={guardando}
          style={{
            padding: '12px 32px',
            background: guardando ? '#aaa' : '#1a1a2e',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: guardando ? 'not-allowed' : 'pointer'
          }}
        >
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}