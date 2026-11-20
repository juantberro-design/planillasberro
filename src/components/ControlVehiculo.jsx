import { useState } from 'react'
import { collection, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { hoyLocal } from '../utils/fechas'
import { turnoActual, nombreVehiculo, ITEMS_CONTROL, EJEMPLO_ITEM } from '../utils/vehiculos'

// Formulario del control quincenal de una camioneta (lo hace Gustavo; también Alvaro y Juan).
// Se guarda en la colección "controlesVehiculos":
//   { vehiculoId, fecha, turno, creadoAt, hechoPor, hechoPorUid,
//     items: { aspecto: 'bien' | 'regular' | 'mal', ... }, notas: { aspecto: 'qué está mal', ... },
//     itemsMal: [nombres], hayMal,
//     danio, falla, observaciones, vistoAdmin }
// Si encuentra daños o fallas, también se cargan en "reportesVehiculos" (como si los reportara a mano),
// así aparecen en la ficha de la camioneta y en los avisos.
// vistoAdmin = false cuando algo quedó en "Mal": a Juan le aparece el aviso.

const OPCIONES = [
  ['bien', 'Bien', '#38a169'],
  ['regular', 'Regular', '#d69e2e'],
  ['mal', 'Mal', '#e53e3e']
]
const BTN = { padding: '14px 10px', borderRadius: '10px', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }
const TEXTAREA = { width: '100%', padding: '12px', border: '1px solid #ccc', borderRadius: '10px', fontSize: '17px', boxSizing: 'border-box', fontFamily: 'inherit', marginTop: '10px' }

function SiNo({ valor, onCambiar }) {
  return (
    <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
      {[[false, 'No'], [true, 'Sí']].map(([v, texto]) => {
        const elegido = valor === v
        return (
          <button key={texto} type="button" onClick={() => onCambiar(v)}
            style={{ ...BTN, flex: 1, border: `2px solid ${v ? '#e53e3e' : '#38a169'}`, background: elegido ? (v ? '#e53e3e' : '#38a169') : 'white', color: elegido ? 'white' : '#333' }}>
            {texto}
          </button>
        )
      })}
    </div>
  )
}

export default function ControlVehiculo({ vehiculo, usuario, choferEnUso, onListo, onCancelar }) {
  const [items, setItems] = useState({})
  const [notas, setNotas] = useState({}) // qué está mal, para los puntos en Regular o Mal
  const [hayDanio, setHayDanio] = useState(null)
  const [textoDanio, setTextoDanio] = useState('')
  const [hayFalla, setHayFalla] = useState(null)
  const [textoFalla, setTextoFalla] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [aviso, setAviso] = useState('')

  function guardar() {
    const faltan = ITEMS_CONTROL.filter(([clave]) => !items[clave]).map(([, nombre]) => nombre)
    if (faltan.length) { setAviso(`Te falta marcar: ${faltan.join(', ')}.`); return }
    const sinNota = ITEMS_CONTROL.filter(([clave]) => items[clave] !== 'bien' && !(notas[clave] || '').trim()).map(([, nombre]) => nombre)
    if (sinNota.length) { setAviso(`Escribí qué está mal en: ${sinNota.join(', ')}.`); return }
    if (hayDanio === null) { setAviso('Contestá si encontraste daños nuevos.'); return }
    if (hayDanio && !textoDanio.trim()) { setAviso('Escribí cuál es el daño.'); return }
    if (hayFalla === null) { setAviso('Contestá si encontraste fallas.'); return }
    if (hayFalla && !textoFalla.trim()) { setAviso('Escribí cuál es la falla.'); return }

    const fecha = hoyLocal()
    const turno = turnoActual()
    const ahora = Date.now()
    const itemsMal = ITEMS_CONTROL.filter(([clave]) => items[clave] === 'mal').map(([, nombre]) => nombre)
    const hayMal = itemsMal.length > 0
    // Solo se guardan las notas de los puntos que no quedaron en "Bien"
    const notasGuardar = {}
    ITEMS_CONTROL.forEach(([clave]) => { if (items[clave] !== 'bien') notasGuardar[clave] = notas[clave].trim() })

    // Todo junto: el control y, si hay, el daño y la falla. Se guarda todo o nada.
    const lote = writeBatch(db)
    lote.set(doc(collection(db, 'controlesVehiculos')), {
      vehiculoId: vehiculo.id,
      fecha, turno, creadoAt: ahora,
      hechoPor: usuario.nombre || '',
      hechoPorUid: usuario.uid,
      items, notas: notasGuardar, itemsMal, hayMal,
      danio: hayDanio ? textoDanio.trim() : '',
      falla: hayFalla ? textoFalla.trim() : '',
      observaciones: observaciones.trim(),
      vistoAdmin: !hayMal || usuario.rol === 'admin'
    })
    const reporte = (tipo, descripcion) => lote.set(doc(collection(db, 'reportesVehiculos')), {
      origen: 'control',
      vehiculoId: vehiculo.id,
      tipo,
      descripcion: `${descripcion} (encontrado en el control quincenal)`,
      estado: 'pendiente',
      fecha, turno, creadoAt: ahora,
      creadoPor: usuario.nombre || '',
      creadoPorUid: usuario.uid,
      choferEnUso: choferEnUso || '',
      resueltoAt: null,
      resueltoPor: '',
      vistoAdmin: usuario.rol === 'admin',
      vistoMant: usuario.rol === 'mantenimiento'
    })
    if (hayDanio) reporte('daño', textoDanio.trim())
    if (hayFalla) reporte('falla', textoFalla.trim())

    // No se espera la confirmación del servidor para volver: en pantalla ya queda guardado
    // y, si hay mala señal, se sube solo cuando vuelve la conexión.
    lote.commit().catch(() => window.alert('No se pudo guardar el control. Revisá la conexión y hacelo de nuevo.'))
    onListo()
  }

  return (
    <div style={{ padding: '16px', maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ background: 'white', borderRadius: '14px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '15px', color: '#666' }}>📋 Control quincenal</div>
        <div style={{ fontSize: '24px', fontWeight: '700' }}>{nombreVehiculo(vehiculo)}</div>
        <div style={{ fontSize: '17px', color: '#555' }}>{vehiculo.matricula}</div>
      </div>

      {/* Bien / Regular / Mal */}
      {ITEMS_CONTROL.map(([clave, nombre]) => (
        <div key={clave} style={{ background: 'white', borderRadius: '14px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>{nombre}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {OPCIONES.map(([valor, texto, color]) => {
              const elegido = items[clave] === valor
              return (
                <button key={valor} type="button" onClick={() => { setItems({ ...items, [clave]: valor }); setAviso('') }}
                  style={{ ...BTN, flex: 1, border: `2px solid ${color}`, background: elegido ? color : 'white', color: elegido ? 'white' : '#333' }}>
                  {texto}
                </button>
              )
            })}
          </div>
          {items[clave] && items[clave] !== 'bien' && (
            <>
              <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '12px', color: items[clave] === 'mal' ? '#c53030' : '#975a16' }}>
                ¿Qué está {items[clave] === 'mal' ? 'mal' : 'regular'}?
              </div>
              <textarea rows={2} value={notas[clave] || ''} placeholder={EJEMPLO_ITEM[clave]}
                onChange={e => { setNotas({ ...notas, [clave]: e.target.value }); setAviso('') }}
                style={{ ...TEXTAREA, marginTop: '6px' }} />
            </>
          )}
        </div>
      ))}

      {/* Daños y fallas */}
      <div style={{ background: 'white', borderRadius: '14px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: '18px', fontWeight: '700' }}>¿Encontraste daños nuevos?</div>
        <div style={{ fontSize: '15px', color: '#666' }}>Golpes, rayones, vidrios rotos</div>
        <SiNo valor={hayDanio} onCambiar={v => { setHayDanio(v); setAviso('') }} />
        {hayDanio && (
          <textarea rows={3} value={textoDanio} onChange={e => setTextoDanio(e.target.value)}
            placeholder="Ej: abollado el paragolpes trasero, lado derecho" style={TEXTAREA} />
        )}
      </div>

      <div style={{ background: 'white', borderRadius: '14px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: '18px', fontWeight: '700' }}>¿Encontraste fallas?</div>
        <div style={{ fontSize: '15px', color: '#666' }}>Algo que no funciona</div>
        <SiNo valor={hayFalla} onCambiar={v => { setHayFalla(v); setAviso('') }} />
        {hayFalla && (
          <textarea rows={3} value={textoFalla} onChange={e => setTextoFalla(e.target.value)}
            placeholder="Ej: no prende la luz de freno izquierda" style={TEXTAREA} />
        )}
      </div>

      <div style={{ background: 'white', borderRadius: '14px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: '18px', fontWeight: '700' }}>Observaciones <span style={{ fontWeight: '400', color: '#888', fontSize: '15px' }}>(opcional)</span></div>
        <textarea rows={2} value={observaciones} onChange={e => setObservaciones(e.target.value)}
          placeholder="Algo más para anotar" style={TEXTAREA} />
      </div>

      {aviso && <div style={{ background: '#fff5f5', color: '#c53030', padding: '14px', borderRadius: '10px', marginBottom: '12px', fontSize: '17px', fontWeight: '600' }}>{aviso}</div>}

      <button type="button" onClick={guardar} style={{ ...BTN, width: '100%', border: 'none', background: '#38a169', color: 'white', fontSize: '18px', padding: '18px' }}>
        Guardar control
      </button>
      <button type="button" onClick={onCancelar} style={{ ...BTN, width: '100%', border: 'none', background: '#e2e8f0', color: '#333', marginTop: '10px' }}>
        Cancelar
      </button>
    </div>
  )
}
