import { useState } from 'react'
import { collection, doc, writeBatch, addDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Pantallas del chofer para su camioneta (pensadas para el celular: letra y botones grandes).
//  - RecepcionCamioneta: la pregunta obligatoria al empezar ("¿Está todo bien?"). Hasta que contesta, no ve la planilla.
//  - CamionetaDelChofer: el recuadro del inicio con su camioneta y el botón para reportar algo durante el día.

const BTN = { padding: '18px 16px', borderRadius: '12px', border: 'none', fontSize: '19px', fontWeight: '700', cursor: 'pointer', width: '100%' }
const CAJA = { background: 'white', borderRadius: '16px', padding: '18px', marginBottom: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }

const TIPOS = [
  ['daño', '💥 Un daño', 'Golpe, rayón, vidrio roto', 'Ej: abollado el paragolpes trasero, lado derecho', '#c53030'],
  ['falla', '🔧 Una falla', 'Algo que no funciona', 'Ej: no prende la luz de freno izquierda', '#dd6b20']
]

// El chofer ve la camioneta por su matrícula ("Camioneta HTP1283"), nunca por el nombre interno de la oficina
function nombreParaChofer(v) {
  return `Camioneta ${v.matricula}`
}

// Aclaración para el chofer cuando no maneja su camioneta de siempre.
// Siempre con matrículas, nunca con los nombres internos de la oficina.
function aclaracionParaChofer(rec) {
  const { fila, vehiculo, titular } = rec
  if (!fila || !vehiculo) return ''
  if (fila.motivo === 'backup') {
    if (!titular) return ''
    return fila.detalle.includes('taller')
      ? `Tu camioneta ${titular.matricula} está en el taller. Hoy usás la ${vehiculo.matricula}.`
      : `Tu camioneta ${titular.matricula} hoy la usa otro chofer. Hoy usás la ${vehiculo.matricula}.`
  }
  if (fila.motivo === 'reemplazo') {
    const cubierto = fila.detalle.replace('Cubre a ', '')
    return `Hoy cubrís a ${cubierto} y usás su camioneta ${vehiculo.matricula}.`
  }
  if (fila.motivo === 'manual' && titular && titular.id !== vehiculo.id) {
    return `Hoy usás la ${vehiculo.matricula} en lugar de tu camioneta ${titular.matricula}.`
  }
  return ''
}

function datosReporte(rec, usuario, tipo, texto) {
  return {
    vehiculoId: rec.vehiculo.id,
    tipo,
    descripcion: texto,
    estado: 'pendiente',
    fecha: rec.fecha,
    turno: rec.turno,
    creadoAt: Date.now(),
    creadoPor: usuario.nombre || '',
    creadoPorUid: usuario.uid,
    choferEnUso: usuario.nombre || '',
    resueltoAt: null,
    resueltoPor: '',
    vistoAdmin: false,
    vistoMant: false
  }
}

// Formulario para reportar: elegir daño o falla y escribir qué pasa
function FormReporte({ onEnviar, onCancelar, textoCancelar }) {
  const [tipo, setTipo] = useState(null)
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState('')
  const elegido = TIPOS.find(t => t[0] === tipo)

  function enviar() {
    if (!tipo) { setAviso('Elegí si es un daño o una falla.'); return }
    if (!texto.trim()) { setAviso('Escribí qué pasa.'); return }
    onEnviar(tipo, texto.trim())
  }

  return (
    <div style={CAJA}>
      <div style={{ fontSize: '20px', fontWeight: '700', marginBottom: '12px' }}>¿Qué encontraste?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {TIPOS.map(([clave, titulo, ayuda, , color]) => (
          <button key={clave} onClick={() => { setTipo(clave); setAviso('') }}
            style={{ ...BTN, textAlign: 'left', border: `3px solid ${color}`, background: tipo === clave ? color : 'white', color: tipo === clave ? 'white' : '#222' }}>
            {titulo}
            <div style={{ fontSize: '15px', fontWeight: '400', marginTop: '2px' }}>{ayuda}</div>
          </button>
        ))}
      </div>
      {tipo && (
        <>
          <div style={{ fontSize: '18px', fontWeight: '700', marginTop: '16px' }}>Escribí qué pasa</div>
          <textarea autoFocus rows={3} value={texto} onChange={e => { setTexto(e.target.value); setAviso('') }}
            placeholder={elegido[3]}
            style={{ width: '100%', padding: '14px', border: '1px solid #ccc', borderRadius: '12px', fontSize: '18px', boxSizing: 'border-box', fontFamily: 'inherit', marginTop: '8px' }} />
        </>
      )}
      {aviso && <div style={{ background: '#fff5f5', color: '#c53030', padding: '12px', borderRadius: '10px', marginTop: '12px', fontSize: '17px', fontWeight: '600' }}>{aviso}</div>}
      <button onClick={enviar} style={{ ...BTN, background: '#38a169', color: 'white', marginTop: '16px' }}>Enviar</button>
      <button onClick={onCancelar} style={{ ...BTN, background: '#e2e8f0', color: '#333', marginTop: '10px', fontSize: '17px' }}>{textoCancelar}</button>
    </div>
  )
}

function Conocidos({ conocidos }) {
  if (conocidos.length === 0) return null
  return (
    <div style={{ background: '#fffaf0', borderRadius: '12px', padding: '12px 14px', marginTop: '14px', border: '1px solid #fbd38d' }}>
      <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}>Ya está reportado (no hace falta avisar de nuevo):</div>
      {conocidos.map(r => (
        <div key={r.id} style={{ fontSize: '16px', marginTop: '4px' }}>• {r.tipo === 'daño' ? 'Daño' : 'Falla'}: {r.descripcion}</div>
      ))}
    </div>
  )
}

// ── La pregunta obligatoria al empezar ──
export default function RecepcionCamioneta({ rec, usuario }) {
  const [reportando, setReportando] = useState(false)
  const v = rec.vehiculo

  function guardar(estado, tipo, texto) {
    const lote = writeBatch(db)
    lote.set(doc(db, 'recepcionesVehiculos', rec.idRecepcion), {
      fecha: rec.fecha,
      turno: rec.turno,
      choferId: rec.choferId,
      choferNombre: usuario.nombre || '',
      vehiculoId: v.id,
      estado,
      creadoAt: Date.now(),
      uid: usuario.uid
    })
    if (tipo) lote.set(doc(collection(db, 'reportesVehiculos')), datosReporte(rec, usuario, tipo, texto))
    // No se espera al servidor: en pantalla ya queda contestado, y con mala señal se sube solo después
    lote.commit().catch(() => window.alert('No se pudo guardar. Revisá la conexión y contestá de nuevo.'))
  }

  return (
    <div style={{ padding: '16px', maxWidth: '520px', margin: '0 auto' }}>
      <div style={{ ...CAJA, textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#555' }}>🚐 Hoy manejás</div>
        <div style={{ fontSize: '30px', fontWeight: '800', marginTop: '4px' }}>{nombreParaChofer(v)}</div>
        {aclaracionParaChofer(rec) && (
          <div style={{ fontSize: '17px', color: '#975a16', marginTop: '6px', fontWeight: '600' }}>{aclaracionParaChofer(rec)}</div>
        )}
        <Conocidos conocidos={rec.conocidos} />
      </div>

      {reportando ? (
        <FormReporte
          onEnviar={(tipo, texto) => guardar('reporto', tipo, texto)}
          onCancelar={() => setReportando(false)}
          textoCancelar="Volver"
        />
      ) : (
        <div style={CAJA}>
          <div style={{ fontSize: '21px', fontWeight: '700', textAlign: 'center' }}>¿Está todo bien?</div>
          <div style={{ fontSize: '16px', color: '#555', textAlign: 'center', marginTop: '4px' }}>
            Mirala por fuera y por dentro antes de salir.
          </div>
          <button onClick={() => guardar('ok')} style={{ ...BTN, background: '#38a169', color: 'white', marginTop: '16px', fontSize: '22px', padding: '22px' }}>
            ✅ Todo OK
          </button>
          <button onClick={() => setReportando(true)} style={{ ...BTN, background: '#dd6b20', color: 'white', marginTop: '12px' }}>
            ⚠️ Hay algo para reportar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Recuadro del inicio: su camioneta y el botón para reportar durante el día ──
export function CamionetaDelChofer({ rec, usuario }) {
  const [reportando, setReportando] = useState(false)
  const [enviado, setEnviado] = useState('')

  if (!rec.cargado) return null
  if (!rec.vehiculo) {
    if (rec.fila?.motivo === 'propio' || !rec.fila) return null
    return (
      <div style={{ ...CAJA, background: '#fff5f5', border: '2px solid #feb2b2', fontSize: '17px', fontWeight: '600', color: '#c53030' }}>
        ⚠️ Hoy no tenés camioneta asignada. Avisale a Alvaro.
      </div>
    )
  }

  function enviar(tipo, texto) {
    addDoc(collection(db, 'reportesVehiculos'), datosReporte(rec, usuario, tipo, texto))
      .catch(() => window.alert('No se pudo enviar. Revisá la conexión y probá de nuevo.'))
    setReportando(false)
    setEnviado(tipo === 'daño' ? 'Listo, se avisó del daño.' : 'Listo, se avisó de la falla.')
  }

  if (reportando) {
    return <FormReporte onEnviar={enviar} onCancelar={() => setReportando(false)} textoCancelar="Cancelar" />
  }
  return (
    <div style={CAJA}>
      <div style={{ fontSize: '17px', color: '#555' }}>🚐 Hoy manejás</div>
      <div style={{ fontSize: '22px', fontWeight: '800' }}>{nombreParaChofer(rec.vehiculo)}</div>
      {aclaracionParaChofer(rec) && <div style={{ fontSize: '16px', color: '#975a16', marginTop: '2px' }}>{aclaracionParaChofer(rec)}</div>}
      {enviado && <div style={{ background: '#f0fff4', color: '#276749', padding: '10px', borderRadius: '10px', marginTop: '10px', fontSize: '17px', fontWeight: '600' }}>✅ {enviado}</div>}
      <button onClick={() => { setReportando(true); setEnviado('') }}
        style={{ ...BTN, background: 'white', color: '#c05621', border: '2px solid #dd6b20', marginTop: '12px', fontSize: '17px', padding: '14px' }}>
        ⚠️ Reportar un problema de la camioneta
      </button>
    </div>
  )
}
