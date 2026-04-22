import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDC6obiUiIhL4qPITeNqkvnkXY0W-igfSE",
    authDomain: "plantmonitoring-2fc3a.firebaseapp.com",
    databaseURL: "https://plantmonitoring-2fc3a-default-rtdb.firebaseio.com",
    projectId: "plantmonitoring-2fc3a",
    storageBucket: "plantmonitoring-2fc3a.firebasestorage.app",
    messagingSenderId: "695901115358",
    appId: "1:695901115358:web:fd3999fb9fafb78bfa034f",
    measurementId: "G-T6ZSSPP3YH"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
