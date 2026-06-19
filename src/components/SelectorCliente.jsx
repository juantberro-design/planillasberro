import { useState, useRef, useEffect } from 'react'

const IS = { width:'100%', padding:'7px 10px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }

/**
 * Input de texto con autocompletado de clientes.
 * - value: valor actual seleccionado
 * - onSelect(nombreCliente): callback cuando se elige una opción de la lista
 * - clientes: array de strings con todos los nombres disponibles
 * - disabled, placeholder, style: igual que un input normal
 */
export default function SelectorCliente({ value, onSelect, clientes, disabled, placeholder, style }) {
  const [texto, setTexto] = useState(value || '')
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const wrapRef = useRef(null)

  useEffect(() => { setTexto(value || '') }, [value])

  useEffect(() => {
    function onClickFuera(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setAbierto(false)
        validarYConfirmar()
      }
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  })

  const sugerencias = texto.trim()
    ? clientes.filter(c => c.toLowerCase().includes(texto.trim().toLowerCase())).slice(0, 8)
    : clientes.slice(0, 8)

  const esValido = !texto.trim() || clientes.some(c => c.toLowerCase() === texto.trim().toLowerCase())

  function elegir(cliente) {
    setTexto(cliente)
    onSelect(cliente)
    setAbierto(false)
  }

  // Si lo que quedó escrito no es exactamente un cliente válido, se revierte
  // al último valor confirmado (no se permite texto libre)
  function validarYConfirmar() {
    if (!texto.trim()) {
      // Campo vacío: lo dejamos vacío, no revertimos
      if (value) onSelect('')
      return
    }
    const coincideExacto = clientes.find(c => c.toLowerCase() === texto.trim().toLowerCase())
    if (coincideExacto) {
      if (coincideExacto !== value) onSelect(coincideExacto)
      setTexto(coincideExacto)
    } else {
      // No es un cliente válido: revertimos a lo que había antes
      setTexto(value || '')
    }
  }

  function onBlur() {
    // Pequeño delay para permitir que el click en una sugerencia (onMouseDown) se procese primero
    setTimeout(() => {
      if (!abierto) validarYConfirmar()
    }, 80)
  }

  function onKeyDown(e) {
    if (!abierto) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltado(r => Math.min(r + 1, sugerencias.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado(r => Math.max(r - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (sugerencias[resaltado]) elegir(sugerencias[resaltado])
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={texto}
        disabled={disabled}
        placeholder={placeholder || 'Escribí para buscar...'}
        style={{ ...(style || IS), borderColor: esValido ? undefined : '#e53e3e', paddingRight: texto ? '28px' : undefined }}
        onChange={e => { setTexto(e.target.value); setAbierto(true); setResaltado(0) }}
        onFocus={() => setAbierto(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {texto && !disabled && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setTexto(''); onSelect(''); setAbierto(false) }}
          title="Borrar"
          style={{
            position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: '#aaa', cursor: 'pointer',
            fontSize: '15px', padding: '2px 4px', lineHeight: 1
          }}
        >
          ✕
        </button>
      )}
      {abierto && !disabled && sugerencias.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'white', border: '1px solid #ddd', borderRadius: '8px',
          marginTop: '2px', maxHeight: '220px', overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
        }}>
          {sugerencias.map((c, i) => (
            <div
              key={c}
              onMouseDown={() => elegir(c)}
              onMouseEnter={() => setResaltado(i)}
              style={{
                padding: '8px 12px', fontSize: '14px', cursor: 'pointer',
                background: i === resaltado ? '#ebf8ff' : 'white',
                color: i === resaltado ? '#1a4d80' : '#1a1a2e'
              }}
            >
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
