import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'

/**
 * Edoomate Firebase Web App Configuration
 * Reads configuration values from Vite environment variables (VITE_FIREBASE_*)
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
}

/**
 * Check whether required Firebase Web App configuration parameters are present
 */
export const isFirebaseConfigured = () => {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  )
}

let appInstance = null
let authInstance = null
let googleProvider = null

/**
 * Lazy-initialize Firebase App (Singleton)
 * Ensures initializeApp is called only once across the application and during HMR
 */
export const getFirebaseApp = () => {
  if (!isFirebaseConfigured()) {
    return null
  }
  if (!appInstance) {
    const existingApps = getApps()
    appInstance = existingApps.length > 0 ? getApp() : initializeApp(firebaseConfig)
  }
  return appInstance
}

/**
 * Lazy-initialize Firebase Auth (Singleton)
 * Ensures both Google Sign-In and Email/Password authentication share the exact same Auth instance
 */
export const getFirebaseAuth = () => {
  const app = getFirebaseApp()
  if (!app) {
    return null
  }
  if (!authInstance) {
    authInstance = getAuth(app)
  }
  if (!googleProvider) {
    googleProvider = new GoogleAuthProvider()
    googleProvider.setCustomParameters({
      prompt: 'select_account',
    })
  }
  return authInstance
}

export const firebaseService = {
  isConfigured: isFirebaseConfigured,

  getConfig() {
    return { ...firebaseConfig }
  },

  getApp() {
    return getFirebaseApp()
  },

  getAuth() {
    return getFirebaseAuth()
  },

  /**
   * Authenticate student with Email and Password using Firebase Auth
   * Shares the same Firebase app and Auth instance as Google Sign-In
   */
  async signInWithEmailPassword(email, password) {
    if (!isFirebaseConfigured()) {
      const err = new Error(
        'Firebase Web App configuration is missing in .env. Please provide VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID.'
      )
      err.code = 'FIREBASE_NOT_CONFIGURED'
      throw err
    }
    const auth = getFirebaseAuth()
    return signInWithEmailAndPassword(auth, email, password)
  },

  /**
   * Register student with Email and Password using Firebase Auth
   * Shares the same Firebase app and Auth instance as Google Sign-In
   */
  async createUserWithEmailPassword(email, password) {
    if (!isFirebaseConfigured()) {
      const err = new Error(
        'Firebase Web App configuration is missing in .env. Please provide VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID.'
      )
      err.code = 'FIREBASE_NOT_CONFIGURED'
      throw err
    }
    const auth = getFirebaseAuth()
    return createUserWithEmailAndPassword(auth, email, password)
  },

  /**
   * Sign out from Firebase Auth
   */
  async signOut() {
    const auth = getFirebaseAuth()
    if (auth) {
      return signOut(auth)
    }
  },

  /**
   * Helper to map Firebase authentication error codes to helpful, actionable messages
   */
  mapAuthError(error) {
    if (!error) return 'Google authentication failed.'
    switch (error.code) {
      case 'auth/popup-closed-by-user':
        return 'Google Sign-In was cancelled.'
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked by the browser. Please allow popups for this site and try again.'
      case 'auth/cancelled-popup-request':
        return 'Only one sign-in attempt can be active at a time.'
      case 'auth/operation-not-allowed':
        return 'Google Sign-in is not enabled under Firebase Authentication → Sign-in method in Firebase Console. Please enable it to allow Google login.'
      case 'auth/unauthorized-domain':
        return `The domain "${window.location.hostname}" is not authorized in Firebase Console → Authentication → Settings → Authorized domains.`
      case 'auth/network-request-failed':
        return 'Network error during Google authentication. Please check your internet connection.'
      default:
        return error.message || 'Google authentication failed.'
    }
  },

  /**
   * Check if the current browser environment is mobile
   */
  isMobileDevice() {
    if (typeof navigator === 'undefined') return false
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent || navigator.vendor || window.opera
    )
  },

  /**
   * Perform Google Sign-In using Firebase Web SDK
   * Tries popup authentication first. If popup fails due to popup-blocked on mobile,
   * seamlessly falls back to signInWithRedirect.
   * @returns {Promise<{ user: Object, idToken: string, credential: Object } | { redirectStarted: boolean }>}
   */
  async signInWithGoogle() {
    if (!isFirebaseConfigured()) {
      const err = new Error(
        'Firebase Web App configuration is missing in .env. Please provide VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID.'
      )
      err.code = 'FIREBASE_NOT_CONFIGURED'
      throw err
    }

    const authInstance = getFirebaseAuth()
    if (!authInstance) {
      const err = new Error('Failed to initialize Firebase Authentication.')
      err.code = 'FIREBASE_INIT_FAILED'
      throw err
    }

    try {
      const userCredential = await signInWithPopup(authInstance, googleProvider)
      const user = userCredential.user
      const idToken = await user.getIdToken()

      return {
        user,
        idToken,
        credential: userCredential,
      }
    } catch (error) {
      // If popup was blocked or failed on a mobile device, initiate redirect sign-in
      const isMobile = this.isMobileDevice()
      const isPopupBlock =
        error.code === 'auth/popup-blocked' ||
        error.code === 'auth/popup-closed-by-user' ||
        error.code === 'auth/cancelled-popup-request'

      if (isMobile && isPopupBlock) {
        try {
          sessionStorage.setItem('edoomate_google_redirect_pending', 'true')
          await signInWithRedirect(authInstance, googleProvider)
          return { redirectStarted: true }
        } catch (redirectErr) {
          throw new Error(this.mapAuthError(redirectErr))
        }
      }

      throw new Error(this.mapAuthError(error))
    }
  },

  /**
   * Checks for and processes any pending Google redirect authentication result
   * Call on login page mount to handle return from Google redirect on Android / mobile browsers
   * @returns {Promise<{ user: Object, idToken: string, credential: Object } | null>}
   */
  async handleRedirectResult() {
    if (!isFirebaseConfigured()) return null
    const authInstance = getFirebaseAuth()
    if (!authInstance) return null

    try {
      const userCredential = await getRedirectResult(authInstance)
      if (userCredential && userCredential.user) {
        try {
          sessionStorage.removeItem('edoomate_google_redirect_pending')
        } catch {}
        const user = userCredential.user
        const idToken = await user.getIdToken()
        return {
          user,
          idToken,
          credential: userCredential,
        }
      }
      return null
    } catch (error) {
      try {
        sessionStorage.removeItem('edoomate_google_redirect_pending')
      } catch {}
      throw new Error(this.mapAuthError(error))
    }
  },
}
