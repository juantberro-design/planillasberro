// Fechas según la hora de Uruguay (la del celular/PC), en formato AAAA-MM-DD.
// Antes se usaba toISOString(), que da la fecha de Londres: después de las 21:00
// en Uruguay ya devolvía el día siguiente.
export function fechaLocal(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

export function hoyLocal() {
  return fechaLocal(new Date())
}

export function haceUnMesLocal() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return fechaLocal(d)
}
