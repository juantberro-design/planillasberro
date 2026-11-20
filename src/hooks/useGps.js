import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { normalizarMatricula, gpsAlDia, gpsEnHorario } from '../utils/gps'

// Dónde está cada camioneta según el GPS (lo guarda el programa "GPS Berro" del servidor en gps/estado).
// Solo LEE. activo = false -> no escucha nada (no gasta lecturas).
// Cada minuto se vuelve a calcular, para darse cuenta si el GPS dejó de actualizarse
// aunque no llegue nada nuevo.
export function useGps(activo) {
  const [estado, setEstado] = useState(null) // null: todavía no se sabe · false: el programa nunca guardó nada
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (!activo) return
    const unsub = onSnapshot(
      doc(db, 'gps', 'estado'),
      s => setEstado(s.exists() ? s.data() : false),
      () => setEstado(false)
    )
    return () => unsub()
  }, [activo])

  useEffect(() => {
    if (!activo) return
    setAhora(Date.now())
    const t = setInterval(() => setAhora(Date.now()), 60000)
    return () => clearInterval(t)
  }, [activo])

  // instalado: el programa ya guardó algo alguna vez (antes de instalarlo, no se muestra nada)
  const instalado = !!activo && !!estado
  const alDia = instalado && gpsAlDia(estado, ahora)
  // atrasado: tendría que estar trayendo datos (dentro del horario, con 15 minutos de gracia al arrancar) y no los trae
  const atrasado = instalado && !alDia && gpsEnHorario(estado.horario, ahora, 15)

  return {
    instalado,
    alDia,
    atrasado,
    ahora,
    actualizado: (instalado && estado.actualizado) || null,
    error: (instalado && estado.error) || '',
    // Lo que dice el GPS de una camioneta (null si no hay datos al día)
    unidad: matricula => (alDia && estado.unidades?.[normalizarMatricula(matricula)]) || null,
    // ¿El GPS no reconoce esta matrícula? (camioneta sin GPS, o matrícula mal escrita)
    sinGps: matricula => alDia && (estado.sinGps || []).includes(normalizarMatricula(matricula))
  }
}
