import { useState, useEffect, createContext, useContext } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('Auth state changed:', firebaseUser?.uid)
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'usuarios', firebaseUser.uid))
          console.log('Doc existe:', snap.exists())
          if (snap.exists() && snap.data().activo) {
            setUsuario({ uid: firebaseUser.uid, ...snap.data() })
          } else {
            setUsuario(null)
          }
        } catch(e) {
          console.log('Error:', e)
          setUsuario(null)
        }
      } else {
        setUsuario(null)
      }
      setCargando(false)
    })
    return () => unsub()
  }, [])

  return (
    <AuthContext.Provider value={{ usuario, cargando }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}