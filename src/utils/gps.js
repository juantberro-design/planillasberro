// GPS (Logicasur): cálculos y textos para mostrar dónde está cada camioneta.
// Los datos los guarda el programa "GPS Berro", que corre en el servidor de la oficina, en gps/estado.

// Matrícula como la usa el GPS: mayúsculas, sin espacios ni guiones ("stp 1234" -> "STP1234")
export function normalizarMatricula(m) {
  return String(m || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Horario en que consulta el programa, por si no vino guardado (es el mismo que trae su config.json)
const HORARIO_POR_DEFECTO = { dias: [1, 2, 3, 4, 5, 6], desde: '06:00', hasta: '20:00' }

const dosCifras = n => String(n).padStart(2, '0')
const horaTexto = d => `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`

// Después de cuántos minutos sin novedades se considera que el GPS dejó de actualizarse.
// El programa guarda por lo menos cada 10 minutos, aunque no cambie nada.
export function minutosSinActualizar(estado) {
  return Math.max(15, (Number(estado?.intervaloMinutos) || 2) * 2 + 5)
}

// ¿Los datos son recientes?
export function gpsAlDia(estado, ahora = Date.now()) {
  return !!estado?.actualizado && ahora - estado.actualizado < minutosSinActualizar(estado) * 60000
}

// ¿A esta hora el programa tendría que estar trayendo datos?
// margenMin: minutos de gracia desde que arranca (para no avisar apenas empieza el día)
export function gpsEnHorario(horario, ahora = Date.now(), margenMin = 0) {
  const h = { ...HORARIO_POR_DEFECTO, ...(horario || {}) }
  const d = new Date(ahora)
  if (!h.dias.includes(d.getDay())) return false
  const [hh, mm] = String(h.desde).split(':').map(Number)
  const minutosDesde = hh * 60 + mm + margenMin
  const desde = `${dosCifras(Math.floor(minutosDesde / 60))}:${dosCifras(minutosDesde % 60)}`
  const hora = horaTexto(d)
  return hora >= desde && hora < h.hasta
}

// "las 10:42" si es de hoy; "el 18/11 a las 19:58" si es de otro día (conHora = false: "el 18/11")
export function cuandoTexto(fechaHora, ahora = Date.now(), conHora = true) {
  const d = new Date(fechaHora)
  if (d.toDateString() === new Date(ahora).toDateString()) return `las ${horaTexto(d)}`
  const dia = `el ${dosCifras(d.getDate())}/${dosCifras(d.getMonth() + 1)}`
  return conHora ? `${dia} a las ${horaTexto(d)}` : dia
}

// Qué mostrar en la tarjeta del chofer según lo que dice el GPS de su camioneta
export function textoUnidad(u, ahora = Date.now()) {
  if (!u) return null
  if (u.estado === 'sin_senal') {
    return { icono: '⚫', texto: u.ultimaSenal ? `Sin señal desde ${cuandoTexto(u.ultimaSenal, ahora, false)}` : 'Sin señal' }
  }
  if (u.estado === 'movimiento') return { icono: '🚚', texto: 'En movimiento' }
  // Detenida. "desde las 10:42" solo si la detención empezó hoy
  // (si viene de antes, por ejemplo la noche en la base, no se pone hora)
  const inicioHoy = new Date(ahora)
  inicioHoy.setHours(0, 0, 0, 0)
  const desde = u.desde && new Date(u.desde).getTime() > inicioHoy.getTime() + 60000
    ? ` desde las ${horaTexto(new Date(u.desde))}`
    : ''
  if (u.geocerca) return { icono: '📍', texto: `En ${u.geocerca}${desde}` }
  return { icono: '🅿️', texto: `Detenida${desde}` }
}
