import { useState, useEffect } from 'react'
import { addDoc, updateDoc, deleteDoc, collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { hoyLocal } from '../utils/fechas'
import { turnoActual, fechaCorta, nombreVehiculo, estadoControl, ITEMS_CONTROL, detalleItems } from '../utils/vehiculos'

// Ficha de una camioneta: sus fallas y daños.
// Cada falla o daño se guarda en la colección "reportesVehiculos":
//   { vehiculoId, tipo: 'falla' | 'daño', descripcion, estado: 'pendiente' | 'arreglado' | 'no_se_arregla',
//     fecha, turno, creadoAt, creadoPor, creadoPorUid, choferEnUso,
//     resueltoAt, resueltoPor, vistoAdmin, vistoMant }
// vistoAdmin / vistoMant: para los avisos de "nuevo" (a Juan los daños; a Gustavo todo).

const BTN = { padding: '14px 16px', borderRadius: '10px', border: 'none', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }

const TIPOS = {
  falla: { titulo: 'Fallas', boton: '+ Reportar falla', ayuda: 'Algo que no funciona. Ej: no prende la luz de freno izquierda', color: '#dd6b20' },
  'daño': { titulo: 'Daños', boton: '+ Reportar daño', ayuda: 'Golpe, rayón, vidrio roto. Ej: abollado el paragolpes trasero, lado derecho', color: '#c53030' }
}

// Botón chico de borrar: solo lo ve el admin (para errores o pruebas), y siempre pide confirmación
const BTN_BORRAR = { background: 'none', border: 'none', color: '#c53030', padding: '8px 0 0', fontSize: '15px', cursor: 'pointer' }

const COLOR_VALOR = { bien: '#276749', regular: '#975a16', mal: '#c53030' }
const TEXTO_VALOR = { bien: 'Bien', regular: 'Regular', mal: 'Mal' }

// acciones: botones extra que arma la pantalla de Camionetas (taller, editar) para admin y coordinador
// controles: los controles quincenales de ESTA camioneta, del más nuevo al más viejo
// onHacerControl: abre el formulario del control (solo si el usuario puede hacerlo)
export default function FichaVehiculo({ vehiculo, reportes, usuario, choferEnUso, onVolver, acciones = null, controles = [], onHacerControl = null }) {
  const puedeResolver = ['admin', 'coordinador', 'mantenimiento'].includes(usuario.rol)
  const [nuevoTipo, setNuevoTipo] = useState(null) // 'falla' | 'daño' | null
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [verHistorial, setVerHistorial] = useState(false)
  const [verControles, setVerControles] = useState(false)
  const esAdmin = usuario.rol === 'admin'

  // Quién la recibió (lo que contestan los choferes al empezar): sirve para saber quién la tenía si aparece un daño
  const [recepciones, setRecepciones] = useState([])
  const [verRecepciones, setVerRecepciones] = useState(false)
  useEffect(() => onSnapshot(
    query(collection(db, 'recepcionesVehiculos'), where('vehiculoId', '==', vehiculo.id)),
    s => setRecepciones(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creadoAt || 0) - (a.creadoAt || 0))),
    () => setRecepciones([])
  ), [vehiculo.id])

  async function borrar(coleccion, id, pregunta) {
    if (!window.confirm(`${pregunta}\n\nSe borra para siempre y no se puede deshacer.`)) return
    try {
      await deleteDoc(doc(db, coleccion, id))
    } catch {
      window.alert('No se pudo borrar. Revisá la conexión y probá de nuevo.')
    }
  }
  const ultimoControl = controles[0] || null
  const estado = estadoControl(ultimoControl, vehiculo)

  const propios = reportes
    .filter(r => r.vehiculoId === vehiculo.id)
    .sort((a, b) => (b.creadoAt || 0) - (a.creadoAt || 0))
  const pendientes = tipo => propios.filter(r => r.tipo === tipo && r.estado === 'pendiente')
  const historial = propios.filter(r => r.estado !== 'pendiente')

  async function guardarReporte() {
    const texto = descripcion.trim()
    if (!texto) { setAviso('Escribí qué pasa.'); return }
    setGuardando(true)
    setAviso('')
    try {
      await addDoc(collection(db, 'reportesVehiculos'), {
        vehiculoId: vehiculo.id,
        tipo: nuevoTipo,
        descripcion: texto,
        estado: 'pendiente',
        fecha: hoyLocal(),
        turno: turnoActual(),
        creadoAt: Date.now(),
        creadoPor: usuario.nombre || '',
        creadoPorUid: usuario.uid,
        choferEnUso: choferEnUso || '',
        resueltoAt: null,
        resueltoPor: '',
        // El que lo carga ya lo vio
        vistoAdmin: usuario.rol === 'admin',
        vistoMant: usuario.rol === 'mantenimiento'
      })
      setNuevoTipo(null)
      setDescripcion('')
    } catch {
      setAviso('No se pudo guardar. Revisá la conexión y probá de nuevo.')
    }
    setGuardando(false)
  }

  // Al marcar una falla o un daño como resuelto, se abre un cuadro para anotar qué era y cómo se arregló
  // (o por qué no se arregla). El comentario es opcional y queda en el historial.
  const [resolviendo, setResolviendo] = useState(null) // { id, estado }
  const [comentario, setComentario] = useState('')

  function abrirResolver(r, estado) {
    setResolviendo({ id: r.id, estado })
    setComentario('')
  }

  function guardarResolucion(r) {
    const { estado } = resolviendo
    setResolviendo(null) // se cierra enseguida, sin esperar a que el servidor confirme
    updateDoc(doc(db, 'reportesVehiculos', r.id), {
      estado, resueltoAt: Date.now(), resueltoPor: usuario.nombre || '', resueltoFecha: hoyLocal(),
      comentarioResolucion: comentario.trim()
    }).catch(() => window.alert('No se pudo guardar. Revisá la conexión y probá de nuevo.'))
  }

  // Textos del cuadro de comentario según qué se está marcando
  function textosResolucion(tipo, estado) {
    if (estado === 'no_se_arregla') return { pregunta: '¿Por qué no se arregla?', ejemplo: 'Ej: es un rayón chico, no vale la pena', boton: 'Guardar: no se arregla' }
    if (tipo === 'falla') return { pregunta: '¿Qué era y cómo se arregló?', ejemplo: 'Ej: era el fusible de la luz, se cambió', boton: '✅ Guardar como arreglada' }
    return { pregunta: '¿Cómo se arregló?', ejemplo: 'Ej: se llevó a chapa y pintura', boton: '✅ Guardar como arreglado' }
  }

  async function reabrir(r) {
    if (!window.confirm(`¿Volver a marcar como pendiente?\n\n"${r.descripcion}"`)) return
    try {
      await updateDoc(doc(db, 'reportesVehiculos', r.id), { estado: 'pendiente', resueltoAt: null, resueltoPor: '', resueltoFecha: '', comentarioResolucion: '' })
    } catch {
      window.alert('No se pudo guardar. Revisá la conexión y probá de nuevo.')
    }
  }

  function quien(r) {
    const extra = r.tipo === 'daño' && r.choferEnUso ? ` · la manejaba ${r.choferEnUso}` : ''
    return `${r.creadoPor || 'Sin nombre'} · ${fechaCorta(r.fecha)} ${r.turno || ''}${extra}`
  }

  return (
    <div style={{ padding: '16px', maxWidth: '640px', margin: '0 auto' }}>
      <button onClick={onVolver} style={{ ...BTN, background: '#e2e8f0', color: '#333', marginBottom: '14px' }}>
        ← Volver
      </button>

      <div style={{ background: 'white', borderRadius: '14px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '24px', fontWeight: '700' }}>{nombreVehiculo(vehiculo)}</div>
        <div style={{ fontSize: '17px', color: '#555', marginTop: '4px' }}>{vehiculo.matricula}</div>
        {vehiculo.enTaller && (
          <div style={{ fontSize: '17px', fontWeight: '600', color: '#c53030', marginTop: '8px' }}>🔧 En taller desde el {fechaCorta(vehiculo.tallerDesde)}</div>
        )}
        {choferEnUso && <div style={{ fontSize: '16px', color: '#4a5568', marginTop: '6px' }}>Ahora la usa: {choferEnUso}</div>}
        {acciones}
      </div>

      {/* Control quincenal */}
      <div style={{ background: 'white', borderRadius: '14px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: estado.falta ? '2px solid #feb2b2' : '2px solid transparent' }}>
        <div style={{ fontSize: '19px', fontWeight: '700' }}>📋 Control quincenal</div>
        <div style={{ fontSize: '17px', fontWeight: '600', marginTop: '6px', color: estado.falta ? '#c53030' : '#276749' }}>
          {estado.falta ? '⚠️ ' : '✅ '}{estado.texto}
        </div>
        {ultimoControl && (
          <div style={{ fontSize: '15px', color: '#555', marginTop: '4px' }}>
            Último: {fechaCorta(ultimoControl.fecha)} por {ultimoControl.hechoPor || 'sin nombre'}
            {ultimoControl.hayMal
              ? <span style={{ color: '#c53030', fontWeight: '600' }}> · Mal: {detalleItems(ultimoControl, 'mal')}</span>
              : <span style={{ color: '#276749' }}> · nada en Mal</span>}
          </div>
        )}
        {onHacerControl && (
          <button onClick={onHacerControl} style={{ ...BTN, width: '100%', marginTop: '12px', background: '#2c7a7b', color: 'white', fontSize: '17px' }}>
            Hacer control ahora
          </button>
        )}
        {controles.length > 0 && (
          <button onClick={() => setVerControles(!verControles)} style={{ ...BTN, width: '100%', marginTop: '10px', background: 'white', color: '#333', border: '1px solid #ddd' }}>
            {verControles ? 'Ocultar controles' : `Ver controles (${controles.length})`}
          </button>
        )}
        {verControles && controles.map(c => (
          <div key={c.id} style={{ background: '#f7fafc', borderRadius: '10px', padding: '12px', marginTop: '10px', fontSize: '15px' }}>
            <div style={{ fontWeight: '700' }}>{fechaCorta(c.fecha)} · {c.hechoPor}</div>
            <div style={{ marginTop: '4px', lineHeight: 1.6 }}>
              {ITEMS_CONTROL.map(([clave, nombre]) => (
                <div key={clave}>
                  {nombre}: <b style={{ color: COLOR_VALOR[c.items?.[clave]] || '#555' }}>{TEXTO_VALOR[c.items?.[clave]] || '—'}</b>
                  {c.notas?.[clave] && <span style={{ color: '#555' }}> — {c.notas[clave]}</span>}
                </div>
              ))}
            </div>
            {c.danio && <div style={{ marginTop: '4px' }}>💥 Daño: {c.danio}</div>}
            {c.falla && <div style={{ marginTop: '4px' }}>⚠️ Falla: {c.falla}</div>}
            {c.observaciones && <div style={{ marginTop: '4px', color: '#555' }}>📝 {c.observaciones}</div>}
            {esAdmin && (
              <button onClick={() => borrar('controlesVehiculos', c.id, `¿Borrar el control del ${fechaCorta(c.fecha)} hecho por ${c.hechoPor}?\n(Los daños y fallas que se cargaron con ese control no se borran: si hace falta, borralos aparte.)`)} style={BTN_BORRAR}>
                🗑 Borrar control
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Botones para reportar */}
      {nuevoTipo === null ? (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {Object.entries(TIPOS).map(([tipo, t]) => (
            <button key={tipo} onClick={() => { setNuevoTipo(tipo); setAviso('') }}
              style={{ ...BTN, flex: 1, background: t.color, color: 'white', fontSize: '17px', padding: '18px 10px' }}>
              {t.boton}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '14px', padding: '16px', marginBottom: '20px', border: `2px solid ${TIPOS[nuevoTipo].color}` }}>
          <div style={{ fontSize: '19px', fontWeight: '700', marginBottom: '6px' }}>{TIPOS[nuevoTipo].boton.replace('+ ', '')}</div>
          <div style={{ fontSize: '15px', color: '#666', marginBottom: '10px' }}>{TIPOS[nuevoTipo].ayuda}</div>
          <textarea autoFocus rows={4} value={descripcion} onChange={e => setDescripcion(e.target.value)}
            placeholder="Escribí acá qué pasa"
            style={{ width: '100%', padding: '12px', border: '1px solid #ccc', borderRadius: '10px', fontSize: '17px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          {aviso && <div style={{ color: '#c53030', fontSize: '16px', marginTop: '8px' }}>{aviso}</div>}
          <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
            <button onClick={guardarReporte} disabled={guardando} style={{ ...BTN, flex: 1, background: '#38a169', color: 'white' }}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={() => { setNuevoTipo(null); setDescripcion(''); setAviso('') }} style={{ ...BTN, flex: 1, background: '#e2e8f0', color: '#333' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Pendientes */}
      {Object.entries(TIPOS).map(([tipo, t]) => {
        const lista = pendientes(tipo)
        return (
          <div key={tipo} style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '19px', fontWeight: '700', marginBottom: '8px' }}>
              {t.titulo} pendientes {lista.length > 0 && <span style={{ color: t.color }}>({lista.length})</span>}
            </div>
            {lista.length === 0 && <div style={{ fontSize: '16px', color: '#888' }}>✅ No hay {t.titulo.toLowerCase()} pendientes</div>}
            {lista.map(r => (
              <div key={r.id} style={{ background: 'white', borderLeft: `6px solid ${t.color}`, borderRadius: '10px', padding: '14px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: '17px', whiteSpace: 'pre-wrap' }}>{r.descripcion}</div>
                <div style={{ fontSize: '14px', color: '#777', marginTop: '6px' }}>{quien(r)}</div>
                {puedeResolver && resolviendo?.id !== r.id && (
                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    <button onClick={() => abrirResolver(r, 'arreglado')} style={{ ...BTN, flex: 1, background: '#38a169', color: 'white' }}>
                      ✅ {tipo === 'falla' ? 'Arreglada' : 'Arreglado'}
                    </button>
                    {tipo === 'daño' && (
                      <button onClick={() => abrirResolver(r, 'no_se_arregla')} style={{ ...BTN, flex: 1, background: '#e2e8f0', color: '#333' }}>
                        No se arregla
                      </button>
                    )}
                  </div>
                )}
                {resolviendo?.id === r.id && (() => {
                  const txt = textosResolucion(tipo, resolviendo.estado)
                  return (
                    <div style={{ marginTop: '12px', background: '#f7fafc', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '17px', fontWeight: '700' }}>
                        {txt.pregunta} <span style={{ fontWeight: '400', color: '#888', fontSize: '15px' }}>(opcional)</span>
                      </div>
                      <textarea autoFocus rows={3} value={comentario} onChange={e => setComentario(e.target.value)} placeholder={txt.ejemplo}
                        style={{ width: '100%', padding: '12px', border: '1px solid #ccc', borderRadius: '10px', fontSize: '17px', boxSizing: 'border-box', fontFamily: 'inherit', marginTop: '8px' }} />
                      <button onClick={() => guardarResolucion(r)} style={{ ...BTN, width: '100%', marginTop: '10px', background: resolviendo.estado === 'arreglado' ? '#38a169' : '#4a5568', color: 'white' }}>
                        {txt.boton}
                      </button>
                      <button onClick={() => setResolviendo(null)} style={{ ...BTN, width: '100%', marginTop: '8px', background: '#e2e8f0', color: '#333' }}>
                        Cancelar
                      </button>
                    </div>
                  )
                })()}
                {esAdmin && (
                  <button onClick={() => borrar('reportesVehiculos', r.id, `¿Borrar ${tipo === 'falla' ? 'esta falla' : 'este daño'}?\n\n"${r.descripcion}"`)} style={BTN_BORRAR}>
                    🗑 Borrar
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      })}

      {/* Quién la recibió */}
      {recepciones.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '19px', fontWeight: '700', marginBottom: '8px' }}>🔑 Quién la recibió</div>
          {(verRecepciones ? recepciones.slice(0, 30) : recepciones.slice(0, 3)).map(r => (
            <div key={r.id} style={{ background: 'white', borderRadius: '10px', padding: '10px 14px', marginBottom: '6px', fontSize: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <b>{fechaCorta(r.fecha)}</b> {r.creadoAt ? new Date(r.creadoAt).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : ''} · {r.choferNombre} ·{' '}
              <span style={{ fontWeight: '600', color: r.estado === 'ok' ? '#276749' : '#c05621' }}>{r.estado === 'ok' ? '✅ Todo OK' : '⚠️ Reportó algo'}</span>
            </div>
          ))}
          {recepciones.length > 3 && (
            <button onClick={() => setVerRecepciones(!verRecepciones)} style={{ background: 'none', border: 'none', color: '#3182ce', padding: '4px 0', fontSize: '15px', cursor: 'pointer' }}>
              {verRecepciones ? 'Ver menos' : `Ver más (${Math.min(recepciones.length, 30)})`}
            </button>
          )}
        </div>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <div>
          <button onClick={() => setVerHistorial(!verHistorial)} style={{ ...BTN, width: '100%', background: 'white', color: '#333', border: '1px solid #ddd' }}>
            {verHistorial ? 'Ocultar historial' : `Ver historial (${historial.length})`}
          </button>
          {verHistorial && historial.map(r => (
            <div key={r.id} style={{ background: '#f7fafc', borderRadius: '10px', padding: '12px', marginTop: '10px', fontSize: '15px' }}>
              <div style={{ fontWeight: '600', color: r.estado === 'arreglado' ? '#276749' : '#555' }}>
                {r.tipo === 'falla' ? 'Falla' : 'Daño'} · {r.estado === 'arreglado' ? '✅ Arreglado' : 'No se arregla'} el {fechaCorta(r.resueltoFecha)} por {r.resueltoPor}
              </div>
              <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{r.descripcion}</div>
              {r.comentarioResolucion && <div style={{ marginTop: '4px', color: '#2d3748' }}>💬 {r.comentarioResolucion}</div>}
              <div style={{ color: '#777', marginTop: '4px' }}>Reportado: {quien(r)}</div>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {puedeResolver && (
                  <button onClick={() => reabrir(r)} style={{ background: 'none', border: 'none', color: '#3182ce', padding: '8px 0 0', fontSize: '15px', cursor: 'pointer' }}>
                    Volver a pendiente
                  </button>
                )}
                {esAdmin && (
                  <button onClick={() => borrar('reportesVehiculos', r.id, `¿Borrar ${r.tipo === 'falla' ? 'esta falla' : 'este daño'}?\n\n"${r.descripcion}"`)} style={BTN_BORRAR}>
                    🗑 Borrar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
