const firebaseConfig = {
  apiKey: "AIzaSyCH0Nde7AmEUtBMOMJ6CHGcCdEeyfSB9IM",
  authDomain: "liberty-runs.firebaseapp.com",
  projectId: "liberty-runs",
  storageBucket: "liberty-runs.firebasestorage.app",
  messagingSenderId: "316068584054",
  appId: "1:316068584054:web:241be0afff7755ddc25d57"
};

import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);

export {auth,db};
