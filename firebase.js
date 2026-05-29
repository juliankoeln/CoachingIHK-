// firebase.js – CoachBoard
const firebaseConfig = {
  apiKey: "AIzaSyATg_smC2w-Ev3pR31IiRQPlQ-x5uAgpVc",
  authDomain: "coachingihk.firebaseapp.com",
  databaseURL: "https://coachingihk-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "coachingihk",
  storageBucket: "coachingihk.firebasestorage.app",
  messagingSenderId: "893616705442",
  appId: "1:893616705442:web:4ff341d1e5b80d5fdfecfb"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
