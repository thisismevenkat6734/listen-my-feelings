// =========================================================
// LISTEN MY FEELINGS
// Firebase Configuration
// Production Web Configuration
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


// ---------------------------------------------------------
// Firebase project configuration
// ---------------------------------------------------------

const firebaseConfig = {
    apiKey: "AIzaSyDaYNxk89vnvc-SHrTNfNrQ0gJCYdnrBOI",
    authDomain: "createyourownidentity-2e2a3.firebaseapp.com",
    projectId: "createyourownidentity-2e2a3",
    storageBucket: "createyourownidentity-2e2a3.firebasestorage.app",
    messagingSenderId: "316875593955",
    appId: "1:316875593955:web:529cb0fe3c45f2cca54dd6",
    measurementId: "G-LXVR8CJWRE"
};


// ---------------------------------------------------------
// Initialize Firebase
// ---------------------------------------------------------

const app = initializeApp(firebaseConfig);


// ---------------------------------------------------------
// Firebase services
// ---------------------------------------------------------

const auth = getAuth(app);

const db = getFirestore(app);


// ---------------------------------------------------------
// Export
// ---------------------------------------------------------

export {
    app,
    auth,
    db
};
