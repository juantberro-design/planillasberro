// Días de la semana de los retiros precargados.
// Firebase no acepta una lista dentro de otra lista, así que los días de cada cliente
// se guardan como texto: "12345" = de lunes a viernes, "135" = lunes, miércoles y viernes.
// (Los números son los de Date.getDay(): 1 = lunes ... 6 = sábado.)

// [1, 3, 5] -> "135"
export function diasATexto(dias) {
  return [...dias].sort().join('')
}

// "135" -> [1, 3, 5]. Si no hay nada guardado (plantillas viejas) devuelve null = todos los días.
export function textoADias(valor) {
  if (Array.isArray(valor)) return valor
  if (typeof valor === 'string' && valor !== '') return valor.split('').map(Number)
  return null
}
