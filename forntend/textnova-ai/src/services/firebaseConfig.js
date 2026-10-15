import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

// Firebase configuration - Update with your settings
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const hasFirebaseConfig =
  Boolean(firebaseConfig.apiKey) &&
  Boolean(firebaseConfig.authDomain) &&
  Boolean(firebaseConfig.projectId);

if (!hasFirebaseConfig) {
  console.warn(
    "Firebase config is missing. Create .env.local in the frontend root with VITE_FIREBASE_* values.",
  );
}

let app = null;
let auth = null;

if (hasFirebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
}

// Initialize Auth
export { auth };

const getAuthInstance = () => {
  if (!auth) {
    throw new Error(
      "Firebase authentication is not configured correctly. Check your VITE_FIREBASE_* values in .env.local and restart Vite.",
    );
  }
  return auth;
};

// Set persistence to LOCAL to keep user logged in
if (auth) {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.log("Persistence error:", error);
  });
}

// Google Auth Provider
export const googleProvider = auth ? new GoogleAuthProvider() : null;

/**
 * Register user with email and password
 */
export const registerUser = async (email, password) => {
  try {
    const currentAuth = getAuthInstance();
    const userCredential = await createUserWithEmailAndPassword(
      currentAuth,
      email,
      password,
    );
    return userCredential.user;
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Sign in user with email and password
 */
export const loginUser = async (email, password) => {
  try {
    const currentAuth = getAuthInstance();
    const userCredential = await signInWithEmailAndPassword(
      currentAuth,
      email,
      password,
    );
    return userCredential.user;
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Sign in with Google
 */
export const loginWithGoogle = async () => {
  try {
    const currentAuth = getAuthInstance();
    if (!googleProvider) {
      throw new Error("Google auth provider is unavailable.");
    }
    const result = await signInWithPopup(currentAuth, googleProvider);
    return result.user;
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Sign out user
 */
export const logoutUser = async () => {
  try {
    await signOut(getAuthInstance());
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Get current user
 */
export const getCurrentUser = () => {
  return auth?.currentUser || null;
};

/**
 * Listen to auth state changes
 */
export const onAuthChange = (callback) => {
  if (!auth) {
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

export default app;
