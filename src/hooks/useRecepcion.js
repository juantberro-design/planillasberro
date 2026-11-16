import { useState, useEffect } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { hoyLocal } from '../utils/fechas'
import { turnoActual } from '../utils/vehiculos'
import { useAsignacion } from './useAsignacion'

// Para el chofer: qué camioneta maneja ahora y si ya la "recibió" hoy (Todo OK o reportó algo).
// Se pregunta una vez por día por camioneta: si al mediodía pasa a otra (por ejemplo, el backup),
// se le vuelve a preguntar por la nueva.
// La respuesta se guarda en "recepcionesVehiculos/<fecha>_<choferId>_<vehiculoId>":
//   { fecha, turno, choferId, choferNombre, vehiculoId, estado: 'ok' | 'reporto', creadoAt, uid }
// activo = false -> no escucha nada (para los que no son choferes).
export function useRecepcion(usuario, activo = true) {
  // Se revisa la hora cada minuto: si cambia el turno o el día, se recalcula la camioneta
  const [ahora, setAhora] = useState(() => ({ fecha: hoyLocal(), turno: turnoActual() }))
  useEffect(() => {
    if (!activo) return
    const t = setInterval(() => {
      const fecha = hoyLocal(), turno = turnoActual()
      setAhora(a => (a.fecha === fecha && a.turno === turno) ? a : { fecha, turno })
    }, 60000)
    return () => clearInterval(t)
  }, [activo])
  const { fecha, turno } = ahora

  const choferId = usuario?.choferId || ''
  const asign = useAsignacion(fecha, turno, activo && !!choferId)
  const fila = choferId ? asign.filaDe(choferId) : null
  const vehiculoId = fila?.vehiculoId || ''
  const vehiculo = vehiculoId ? asign.vehiculoPorId(vehiculoId) : null
  // Su camioneta de siempre (si es titular de alguna), para explicarle cuando hoy usa otra
  const titular = choferId ? asign.vehiculos.find(v => v.choferTitularId === choferId && !v.esBackup) || null : null

  // ¿Ya la recibió hoy? (null = cargando)
  const idRecepcion = vehiculoId ? `${fecha}_${choferId}_${vehiculoId}` : ''
  const [recepcion, setRecepcion] = useState(null)
  useEffect(() => {
    setRecepcion(null)
    if (!activo || !idRecepcion) return
    return onSnapshot(
      doc(db, 'recepcionesVehiculos', idRecepcion),
      s => setRecepcion(s.exists() ? s.data() : false),
      () => setRecepcion(false)
    )
  }, [activo, idRecepcion])

  // Lo que ya está reportado de esa camioneta (para que no lo vuelva a reportar)
  const [conocidos, setConocidos] = useState([])
  useEffect(() => {
    setConocidos([])
    if (!activo || !vehiculoId) return
    return onSnapshot(
      query(collection(db, 'reportesVehiculos'), where('vehiculoId', '==', vehiculoId)),
      s => setConocidos(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.estado === 'pendiente')),
      () => setConocidos([])
    )
  }, [activo, vehiculoId])

  // Sin chofer asociado (o si no es chofer) no hay nada que esperar
  const cargado = !activo || !choferId || (asign.cargado && (!vehiculoId || recepcion !== null))
  return {
    cargado, fecha, turno, choferId, fila, vehiculo, titular, idRecepcion, conocidos,
    recibida: recepcion || null,
    // Hay que preguntarle: tiene camioneta asignada y todavía no contestó hoy por esa camioneta
    pendiente: activo && cargado && !!vehiculo && recepcion === false
  }
}
