import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'
import { getFirestore, type Firestore } from 'firebase/firestore'

// Firebase Web configuration for the Chater project.
// These client-side identifiers are intended to be included in the web app.
// Protect the project with Firebase Security Rules and API-key restrictions.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDA-u5mi-mkJk9X3GUcNokISnxBxBOyInQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'chater-8f834.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'chater-8f834',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'chater-8f834.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '980191020906',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:980191020906:web:697cd47ff87bd6bb624713',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-N36H678CMD',
}

const requiredConfigValues = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.storageBucket,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId,
]

export const isFirebaseConfigured = requiredConfigValues.every(
  (value) => typeof value === 'string' && value.trim().length > 0,
)

export const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null

export const firestoreDb: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null

// Analytics is optional and is enabled only in browsers supported by Firebase.
const app = firebaseApp
export const firebaseAnalytics: Promise<Analytics | null> = app
  ? isSupported()
      .then((supported) => (supported ? getAnalytics(app) : null))
      .catch(() => null)
  : Promise.resolve(null)
