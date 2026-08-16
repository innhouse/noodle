// Firebase project: noodle (noodle-dec11)
// These values are public by design — they identify the project, they do not grant
// access. Access is controlled by firestore.rules and storage.rules, which scope
// every document to the signed-in user.
import { initializeApp } from 'firebase/app';

export const firebaseConfig = {
  apiKey: 'AIzaSyBk_8ebs0qPU5NCpIxICfb8Xk9PiGmbl_4',
  authDomain: 'noodle-dec11.firebaseapp.com',
  projectId: 'noodle-dec11',
  storageBucket: 'noodle-dec11.firebasestorage.app',
  messagingSenderId: '130558906765',
  appId: '1:130558906765:web:94d6677036435757466dc4',
};

export const app = initializeApp(firebaseConfig);
