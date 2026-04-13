import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDdAw0dHfeoDW1g2n3A2Y_UldpFtcF1fC0",
  authDomain: "kafem-f9cc0.firebaseapp.com",
  projectId: "kafem-f9cc0",
  storageBucket: "kafem-f9cc0.firebasestorage.app",
  messagingSenderId: "1071930436785",
  appId: "1:1071930436785:web:e5341b93e373cfbf0a4690",
  measurementId: "G-1T8YJRE48K",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export default app;