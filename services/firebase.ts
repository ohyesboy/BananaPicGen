import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, OAuthProvider, signInWithPopup, signOut, User } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

// Firebase configuration from environment variable
// Set VITE_FIREBASE_CONFIG as a JSON string in your .env file
// Example: VITE_FIREBASE_CONFIG='{"apiKey":"...","authDomain":"...",...}'
const parseFirebaseConfig = () => {
  const configString = import.meta.env.VITE_FIREBASE_CONFIG;

  if (configString) {
    try {
       
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
let facebookProvider: any;
let appleProvider: any;
let microsoftProvider: any;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({
      prompt: "select_account"
    });
    facebookProvider = new FacebookAuthProvider();
    facebookProvider.addScope('email');
    facebookProvider.addScope('public_profile');
    appleProvider = new OAuthProvider('apple.com');
    appleProvider.addScope('email');
    appleProvider.addScope('name');
    microsoftProvider = new OAuthProvider('microsoft.com');
    microsoftProvider.setCustomParameters({
      prompt: 'select_account',
      tenant: 'common'
    });
} catch (e) {
    console.warn("Firebase not configured correctly. Please update services/firebase.ts");
}

export { auth, db, googleProvider, facebookProvider, appleProvider, microsoftProvider };

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

export const signInWithFacebook = async () => {
  if (!auth) throw new Error("Firebase not configured");
  try {
    const result = await signInWithPopup(auth, facebookProvider);
    // Get the Facebook access token to fetch profile picture
    const credential = FacebookAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      // Store the access token for fetching profile picture
      sessionStorage.setItem('fb_access_token', credential.accessToken);
    }
    return result.user;
  } catch (error) {
    console.error("Error signing in with Facebook", error);
    throw error;
  }
};

export const signInWithApple = async () => {
  if (!auth) throw new Error("Firebase not configured");
  try {
    const result = await signInWithPopup(auth, appleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Apple", error);
    throw error;
  }
};

export const signInWithMicrosoft = async () => {
  if (!auth) throw new Error("Firebase not configured");
  try {
    const result = await signInWithPopup(auth, microsoftProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Microsoft", error);
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

// User document type
export interface UserDocument {
  firstname: string;
  lastname: string;
  prompts: Array<{ name: string; prompt: string; enabled: boolean; skip_beforeafter_prompt: boolean }>;
  prompt_before?: string;   // Text to add before each prompt
  prompt_after?: string;    // Text to add after each prompt
  historic_cost?: number;   // Total accumulated cost across all sessions
  historic_images?: number; // Total accumulated images across all sessions
}

// Get or create user document
export const getUserDocument = async (email: string): Promise<UserDocument> => {
  if (!db) throw new Error("Firestore not configured");

  const docRef = doc(db, "users", email);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data() as UserDocument;
  }

  // Create new user document with default values
  const newUserDoc: UserDocument = {
    firstname: "",
    lastname: "",
    prompts: [],
    historic_cost: 0,
    historic_images: 0
  };

  await setDoc(docRef, newUserDoc);
  return newUserDoc;
};

// Update user document
export const updateUserDocument = async (email: string, data: Partial<UserDocument>): Promise<void> => {
  if (!db) throw new Error("Firestore not configured");
  
  const docRef = doc(db, "users", email);
  await updateDoc(docRef, data);
};
