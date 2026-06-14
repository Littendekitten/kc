// We gebruiken hier HTTPS-links (CDN). Dit werkt direct op GitHub Pages!
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// JOUW FIREBASE CONFIG DIE JE UIT DE CONSOLE HEBT GEKOPIEERD
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_CONFIG",
    authDomain: "YOUR_FIREBASE_CONFIG",
    projectId: "YOUR_FIREBASE_CONFIG",
    storageBucket: "YOUR_FIREBASE_CONFIG",
    messagingSenderId: "YOUR_FIREBASE_CONFIG",
    appId: "YOUR_FIREBASE_CONFIG"
};

// Initialiseer Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// HTML Elementen selecteren
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const userPhoto = document.getElementById('user-photo');
const balanceAmount = document.getElementById('balance-amount');

// Formulier Elementen
const transferForm = document.getElementById('transfer-form');
const receiverEmailInput = document.getElementById('receiver-email');
const transferAmountInput = document.getElementById('transfer-amount');
const btnSend = document.getElementById('btn-send');

// 1. Check of de gebruiker is ingelogd of niet
onAuthStateChanged(auth, async (user) => {
    if (user) {
        authView.classList.add('hidden');
        appView.classList.remove('hidden');

        userName.innerText = user.displayName;
        userEmail.innerText = user.email;
        userPhoto.src = user.photoURL || 'https://placehold.co/150';

        // Check saldo
        await checkOrCreateUserWallet(user);
    } else {
        authView.classList.remove('hidden');
        appView.classList.add('hidden');
    }
});

// 2. Wallet checken of aanmaken bij eerste keer inloggen
async function checkOrCreateUserWallet(user) {
    const userRef = doc(db, "wallets", user.email.toLowerCase());
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        balanceAmount.innerText = userSnap.data().balance.toFixed(2);
    } else {
        // Welkomstbonus!
        const startBalance = 10.00;
        await setDoc(userRef, {
            name: user.displayName,
            email: user.email.toLowerCase(),
            balance: startBalance,
            createdAt: new Date()
        });
        balanceAmount.innerText = startBalance.toFixed(2);
        alert("Welcome! You received 10 free KittyCoins! 🐱");
    }
}

// 3. KittyCoins versturen via Database Transactie
transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const senderEmail = auth.currentUser.email.toLowerCase();
    const receiverEmail = receiverEmailInput.value.trim().toLowerCase();
    const amount = parseFloat(transferAmountInput.value);

    if (senderEmail === receiverEmail) {
        alert("You cannot send KittyCoins to yourself!");
        return;
    }

    if (amount <= 0) {
        alert("Please enter a valid amount higher than 0.");
        return;
    }

    btnSend.disabled = true;
    btnSend.innerText = "Processing...";

    const senderRef = doc(db, "wallets", senderEmail);
    const receiverRef = doc(db, "wallets", receiverEmail);

    try {
        await runTransaction(db, async (transaction) => {
            const senderDoc = await transaction.get(senderRef);
            const receiverDoc = await transaction.get(receiverRef);

            if (!receiverDoc.exists()) {
                throw new Error("Recipient account not found! They need to log in to KC-Xchange at least once.");
            }

            const senderBalance = senderDoc.data().balance;
            if (senderBalance < amount) {
                throw new Error("Insufficient funds!");
            }

            transaction.update(senderRef, { balance: senderBalance - amount });
            transaction.update(receiverRef, { balance: receiverDoc.data().balance + amount });
        });

        alert(`Successfully sent ${amount} KC to ${receiverEmail}! 🎉`);
        transferForm.reset();
        
        const updatedSenderDoc = await getDoc(senderRef);
        balanceAmount.innerText = updatedSenderDoc.data().balance.toFixed(2);

    } catch (error) {
        alert(error.message);
    } finally {
        btnSend.disabled = false;
        btnSend.innerText = "Send Coins";
    }
});

// Login & Logout Events
btnLogin.addEventListener('click', () => signInWithPopup(auth, provider));
btnLogout.addEventListener('click', () => signOut(auth));
