// Lógica de camionetas: quién maneja cuál en cada turno.
import { hoyLocal } from './fechas'

// Antes de las 12:00 -> mañana, después -> tarde
export function turnoActual() {
  return new Date().getHours() < 12 ? 'mañana' : 'tarde'
}

// "2026-11-10" -> "10/11"
export function fechaCorta(f) {
  if (!f) return ''
  const [, m, d] = f.split('-')
  return `${d}/${m}`
}

// Valor especial para "Vehículo propio / tercero" (choferes puntuales que traen el suyo)
export const PROPIO = '__propio'

// ¿Esta fila de la asignación es un chofer que trabaja y no tiene con qué?
export function filaSinCamioneta(f) {
  return !f || (!f.vehiculoId && f.motivo !== 'propio')
}

// Texto de lo que maneja el chofer en una fila de la asignación
export function textoFila(f, vehiculoPorId) {
  if (!f) return 'Sin camioneta'
  if (f.motivo === 'propio') return 'Vehículo propio / tercero'
  return f.vehiculoId ? nombreVehiculo(vehiculoPorId(f.vehiculoId)) : 'Sin camioneta'
}

// ¿La planilla tiene algo cargado? (para saber si un suplente o puntual trabaja ese turno)
export function planillaConTareas(data) {
  if (!data) return false
  return (data.levantes || []).some(l => l.cliente) ||
    (data.clientesPuntuales || []).some(l => l.cliente) ||
    (data.entregas || []).some(e => e.remitente || e.destinatario)
}

// ── Control quincenal ──
// Cada cuántos días hay que controlar cada camioneta
export const DIAS_CONTROL = 15
// Qué se revisa en el control: [clave, nombre para mostrar]
export const ITEMS_CONTROL = [
  ['aspecto', 'Aspecto general'],
  ['limpiezaInterior', 'Limpieza interior'],
  ['limpiezaExterior', 'Limpieza exterior'],
  ['cubiertas', 'Cubiertas'],
  ['luces', 'Luces'],
  ['niveles', 'Niveles (aceite, agua, frenos)']
]
export const NOMBRE_ITEM = Object.fromEntries(ITEMS_CONTROL)
// Ejemplos para el cuadro "¿Qué está mal?" de cada punto
export const EJEMPLO_ITEM = {
  aspecto: 'Ej: pintura muy gastada, espejo flojo',
  limpiezaInterior: 'Ej: asientos sucios, basura en la cabina',
  limpiezaExterior: 'Ej: muy sucia, con barro',
  cubiertas: 'Ej: la trasera derecha está lisa',
  luces: 'Ej: no anda el giro izquierdo',
  niveles: 'Ej: le falta aceite'
}

// Texto de los puntos de un control que quedaron en un valor ('mal' o 'regular'), con lo que escribió.
// Ej: "Limpieza interior (asientos sucios), Luces (no anda el giro izquierdo)"
export function detalleItems(control, valor = 'mal') {
  return ITEMS_CONTROL
    .filter(([clave]) => control.items?.[clave] === valor)
    .map(([clave, nombre]) => control.notas?.[clave] ? `${nombre} (${control.notas[clave]})` : nombre)
    .join(', ')
}

// Días entre dos fechas AAAA-MM-DD
export function diasEntre(desde, hasta) {
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

// Estado del control de una camioneta según su último control.
// falta = true si hay que controlarla (vencido o nunca controlada), salvo que esté en el taller.
export function estadoControl(ultimo, vehiculo) {
  if (!ultimo) return { texto: 'Nunca se controló', falta: !vehiculo?.enTaller, vencido: true }
  const d = diasEntre(ultimo.fecha, hoyLocal())
  const vencido = d >= DIAS_CONTROL
  const texto = vencido
    ? `Control vencido (hace ${d} días)`
    : d <= 0 ? 'Controlada hoy' : d === 1 ? 'Controlada ayer' : `Controlada hace ${d} días`
  return { texto, falta: vencido && !vehiculo?.enTaller, vencido }
}

// ── Alertas de fallas y daños nuevos ──
// Cada persona (Juan, Alvaro, Gustavo) marca por su cuenta lo que ya vio: se guarda en "vistoPor"
// ({ uid: cuándo lo vio }). Lo reportado antes de esta fecha se rige por las marcas viejas
// (vistoAdmin para Juan, vistoMant para Gustavo), así no aparece de golpe todo lo viejo.
export const INICIO_AVISOS_POR_PERSONA = Date.UTC(2026, 10, 18, 3, 0) // 18/11/2026 00:00 en Uruguay
const ROLES_CON_ALERTA = ['admin', 'coordinador', 'mantenimiento']

// ¿Este usuario todavía no vio esta falla o daño pendiente?
export function reporteSinVer(r, usuario) {
  if (!usuario || !ROLES_CON_ALERTA.includes(usuario.rol) || r.estado !== 'pendiente') return false
  if (r.creadoPorUid && r.creadoPorUid === usuario.uid) return false // lo reportó él mismo
  if (r.vistoPor && r.vistoPor[usuario.uid]) return false
  if ((r.creadoAt || 0) < INICIO_AVISOS_POR_PERSONA) {
    if (usuario.rol === 'admin') return r.tipo === 'daño' && !r.vistoAdmin
    if (usuario.rol === 'mantenimiento') return !r.vistoMant
    return false
  }
  return true
}

// Lo que hay que guardar para marcar una falla o daño como visto por este usuario
export function datosVisto(usuario) {
  const datos = { [`vistoPor.${usuario.uid}`]: Date.now() }
  if (usuario.rol === 'admin') datos.vistoAdmin = true
  if (usuario.rol === 'mantenimiento') datos.vistoMant = true
  return datos
}

// De dónde vino el reporte, para mostrarlo en la alerta
export function textoOrigen(r) {
  if (r.origen === 'recepcion') return 'al recibir la camioneta'
  if (r.origen === 'ruta') return 'durante el día'
  if (r.origen === 'control') return 'en el control quincenal'
  return ''
}

// Nombre corto para mostrar: "Camioneta 4" o "Backup"
export function nombreVehiculo(v) {
  if (!v) return 'Sin camioneta'
  return v.esBackup ? `Backup (${v.numero})` : `Camioneta ${v.numero}`
}

// Un turno ya pasó si es de un día anterior, o si es la mañana de hoy y ya es de tarde.
// Los turnos que ya pasaron quedan "congelados": se muestra lo que quedó registrado.
export function turnoYaPaso(fecha, turno) {
  const hoy = hoyLocal()
  if (fecha < hoy) return true
  if (fecha > hoy) return false
  return turno === 'mañana' && turnoActual() === 'tarde'
}

// ¿La camioneta está en el taller en ese día y turno?
// Se toma en cuenta desde qué turno se mandó: si se mandó "desde la tarde", la mañana de ese día todavía andaba.
export function enTallerEnTurno(v, fecha, turno) {
  if (!v.enTaller) return false
  if (!v.tallerDesde) return true
  if (fecha > v.tallerDesde) return true
  if (fecha < v.tallerDesde) return false
  return v.tallerDesdeTurno !== 'tarde' || turno === 'tarde'
}

function ausenciaEnTurno(ausencias, choferId, fecha, turno) {
  return ausencias.find(a =>
    a.choferId === choferId && a.desde <= fecha && a.hasta >= fecha &&
    (!a.turno || a.turno === 'ambos' || a.turno === turno)
  ) || null
}

// Calcula qué camioneta usa cada chofer en un día y turno.
//  choferes:   los choferes fijos activos, en el orden de Admin
//  puntuales:  los choferes puntuales de ese día y turno
//  conTareas:  Set con los ids de choferes que tienen algo cargado en su planilla ese turno
//  manual:     { choferId: vehiculoId | '' | PROPIO } cambios hechos a mano ('' = sin camioneta)
// Devuelve una lista de filas: { choferId, vehiculoId, motivo, detalle }
//  motivo: 'titular' | 'reemplazo' | 'backup' | 'manual' | 'propio' | 'sin'
export function calcularAsignacion({ vehiculos, choferes, puntuales = [], conTareas = new Set(), ausencias, fecha, turno, manual = {} }) {
  const titularDe = {}
  vehiculos.forEach(v => { if (v.choferTitularId && !v.esBackup) titularDe[v.choferTitularId] = v })
  const backup = vehiculos.find(v => v.esBackup) || null
  const usados = new Set()
  const filas = []

  // 1. Primero lo que el coordinador asignó a mano
  Object.entries(manual).forEach(([choferId, vehiculoId]) => {
    if (vehiculoId === PROPIO) {
      filas.push({ choferId, vehiculoId: '', motivo: 'propio', detalle: '' })
      return
    }
    filas.push({ choferId, vehiculoId: vehiculoId || '', motivo: vehiculoId ? 'manual' : 'sin', detalle: 'Asignado a mano' })
    if (vehiculoId) usados.add(vehiculoId)
  })

  // 2. Lo automático: cada chofer que trabaja usa su titular;
  //    el que cubre a un ausente (y no tiene camioneta propia) usa la del ausente.
  const trabajan = choferes.filter(c => !ausenciaEnTurno(ausencias, c.id, fecha, turno))
  const cubre = {}
  choferes.forEach(c => {
    const a = ausenciaEnTurno(ausencias, c.id, fecha, turno)
    if (a?.reemplazoId && titularDe[c.id]) cubre[a.reemplazoId] = c
  })

  const automaticas = []
  trabajan.forEach(c => {
    if (c.id in manual) return
    if (titularDe[c.id]) automaticas.push({ chofer: c, vehiculo: titularDe[c.id], motivo: 'titular', detalle: '' })
    else if (cubre[c.id]) automaticas.push({ chofer: c, vehiculo: titularDe[cubre[c.id].id], motivo: 'reemplazo', detalle: `Cubre a ${cubre[c.id].nombre}` })
  })

  // 3. Si la camioneta está ocupada (asignada a mano a otro) o en el taller, pasa al backup si está libre
  automaticas.forEach(({ chofer, vehiculo, motivo, detalle }) => {
    const enTaller = enTallerEnTurno(vehiculo, fecha, turno)
    if (!enTaller && !usados.has(vehiculo.id)) {
      usados.add(vehiculo.id)
      filas.push({ choferId: chofer.id, vehiculoId: vehiculo.id, motivo, detalle })
      return
    }
    const porQue = enTaller ? `la ${vehiculo.numero} está en taller` : `la ${vehiculo.numero} la tiene otro`
    if (backup && !enTallerEnTurno(backup, fecha, turno) && !usados.has(backup.id)) {
      usados.add(backup.id)
      filas.push({ choferId: chofer.id, vehiculoId: backup.id, motivo: 'backup', detalle: `Usa el backup porque ${porQue}` })
    } else {
      filas.push({ choferId: chofer.id, vehiculoId: '', motivo: 'sin', detalle: `No hay camioneta libre: ${porQue}` })
    }
  })

  // 4. Los puntuales que vienen con vehículo propio (se marca al agregarlos en Planillas del día)
  puntuales.forEach(c => {
    if (!(c.id in manual) && c.vehiculoPropio) filas.push({ choferId: c.id, vehiculoId: '', motivo: 'propio', detalle: '' })
  })

  // 5. Los que tienen planilla cargada en este turno pero ninguna camioneta (suplentes, puntuales)
  const conFila = new Set(filas.map(f => f.choferId))
  ;[...trabajan, ...puntuales].forEach(c => {
    if (!conFila.has(c.id) && conTareas.has(c.id)) {
      filas.push({ choferId: c.id, vehiculoId: '', motivo: 'sin', detalle: 'Tiene planilla pero no tiene camioneta asignada' })
    }
  })

  return filas
}
