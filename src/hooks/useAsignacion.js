import { useState, useEffect } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { calcularAsignacion, turnoYaPaso, planillaConTareas } from '../utils/vehiculos'

// Escucha en tiempo real todo lo necesario para saber quién maneja qué camioneta
// en un día y turno, y lo calcula. Lo usan la pantalla de Camionetas, la planilla y el inicio.
// Solo LEE: el único que guarda el registro es la pantalla de Camionetas.
// activo = false -> no escucha nada (por ejemplo, para los choferes, así no gastan lecturas).
export function useAsignacion(fecha, turno, activo = true) {
  const [vehiculos, setVehiculos] = useState(null)
  const [todosChoferes, setTodosChoferes] = useState(null)
  const [ausencias, setAusencias] = useState(null)
  const [asignDoc, setAsignDoc] = useState(null)
  const [conTareas, setConTareas] = useState(null)

  useEffect(() => {
    if (!activo) return
    const unsubs = [
      onSnapshot(collection(db, 'vehiculos'), s => setVehiculos(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setVehiculos([])),
      onSnapshot(collection(db, 'choferes'), s => setTodosChoferes(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setTodosChoferes([])),
      onSnapshot(collection(db, 'ausencias'), s => setAusencias(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setAusencias([]))
    ]
    return () => unsubs.forEach(u => u())
  }, [activo])

  useEffect(() => {
    if (!activo) return
    setAsignDoc(null)
    setConTareas(null)
    const unsubA = onSnapshot(
      doc(db, 'asignacionesVehiculos', `${fecha}_${turno}`),
      s => setAsignDoc(s.exists() ? s.data() : {}),
      () => setAsignDoc({})
    )
    const unsubP = onSnapshot(
      collection(db, 'planillas', fecha, 'choferes'),
      s => {
        const ids = new Set()
        s.forEach(d => {
          const [choferId, turnoDoc] = d.id.split('_')
          if (turnoDoc === turno && planillaConTareas(d.data())) ids.add(choferId)
        })
        setConTareas(ids)
      },
      () => setConTareas(new Set())
    )
    return () => { unsubA(); unsubP() }
  }, [fecha, turno, activo])

  const cargado = !!(vehiculos && todosChoferes && ausencias && asignDoc && conTareas)
  const fijos = (todosChoferes || []).filter(c => !c.puntual && c.activo).sort((a, b) => (a.orden || 0) - (b.orden || 0))
  const puntuales = (todosChoferes || []).filter(c => c.puntual && c.fecha === fecha && c.turno === turno)
  const manual = asignDoc?.manual || {}
  const congelado = turnoYaPaso(fecha, turno)

  const calculado = cargado
    ? calcularAsignacion({ vehiculos, choferes: fijos, puntuales, conTareas, ausencias, fecha, turno, manual })
    : []

  // Si el turno ya pasó y quedó guardado, se usa lo guardado; si no, lo calculado
  const hayRegistro = Object.keys(asignDoc?.registro || {}).length > 0
  const usarRegistro = congelado && hayRegistro
  const ordenChofer = id => {
    const i = fijos.findIndex(c => c.id === id)
    return i === -1 ? 999 : i
  }
  const filas = (usarRegistro
    ? Object.entries(asignDoc.registro).map(([choferId, r]) => ({ choferId, ...r }))
    : calculado
  ).sort((a, b) => ordenChofer(a.choferId) - ordenChofer(b.choferId))

  const vehiculoPorId = id => (vehiculos || []).find(v => v.id === id) || null
  const nombreChofer = id => (todosChoferes || []).find(c => c.id === id)?.nombre || 'Chofer borrado'
  const filaDe = choferId => filas.find(f => f.choferId === choferId) || null

  return {
    cargado, vehiculos: vehiculos || [], todosChoferes: todosChoferes || [], ausencias: ausencias || [],
    asignDoc, manual, fijos, puntuales, congelado, calculado, filas,
    estimado: congelado && !hayRegistro,
    vehiculoPorId, nombreChofer, filaDe
  }
}
