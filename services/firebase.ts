import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, User } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

// Firebase configuration from environment variable
// Set VITE_FIREBASE_CONFIG as a JSON string in your .env file
// Example: VITE_FIREBASE_CONFIG='{"apiKey":"...","authDomain":"...",...}'
const parseFirebaseConfig = () => {
  const configString = import.meta.env.VITE_FIREBASE_CONFIG;
  console.log("Firebase config string:", configString); 
  if (configString) {
    try {
        console.log("Parsing Firebase config");
      return JSON.parse(configString);
    } catch (e) {
      console.error("Failed to parse VITE_FIREBASE_CONFIG", e);
    }
  }
  throw new Error("VITE_FIREBASE_CONFIG is not set or invalid");
};

const firebaseConfig = parseFirebaseConfig();

// Initialize Firebase
let app;
let auth: any;
let db: any;
let googleProvider: any;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({
      prompt: "select_account"
    });
} catch (e) {
    console.warn("Firebase not configured correctly. Please update services/firebase.ts");
}

export { auth, db, googleProvider };

export const signInWithGoogle = async () => {
  if (!auth) throw new Error("Firebase not configured");
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

export const getAccessList = async (): Promise<string[]> => {
  if (!db) return [];
  try {
    const docRef = doc(db, "config", "access");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().allowedEmails || [];
    }
    return [];
  } catch (error) {
    console.error("Error fetching access list", error);
    return [];
  }
};
