import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyA3klqJwguVNMc2cYCVf1sMXIS9_Mxw78M",
  authDomain: "planillasberro.firebaseapp.com",
  projectId: "planillasberro",
  storageBucket: "planillasberro.firebasestorage.app",
  messagingSenderId: "219500673907",
  appId: "1:219500673907:web:f3fa35fd9f78a615826306"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)