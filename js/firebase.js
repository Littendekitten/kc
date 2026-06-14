// ================================
// KC-XCHANGE V2 - FIREBASE
// ================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


// ================================
// FIREBASE CONFIG
// ================================

const firebaseConfig = {
    apiKey: "AIzaSyDra6ILu1IGCyZ64fTfxKYGoQqEL6CbUFE",
    authDomain: "kc-xchange.firebaseapp.com",
    projectId: "kc-xchange",
    storageBucket: "kc-xchange.firebasestorage.app",
    messagingSenderId: "25389828665",
    appId: "1:25389828665:web:0e42a57c7176e06b499be8",
    measurementId: "G-G7TY0C4T3X"
};


// ================================
// INITIALIZE
// ================================

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export const provider = new GoogleAuthProvider();


// ================================
// GOD MODE
// ================================

export const GOD_EMAIL =
    "littendekitten@gmail.com";


// ================================
// RANDOM GUEST USERNAME
// ================================

function generateGuestUsername() {

    const random =
        Math.floor(Math.random() * 999999);

    return `kc-guest${random}`;
}


// ================================
// UNIQUE USERNAME
// ================================

export async function createUniqueUsername() {

    let username;
    let exists = true;

    while (exists) {

        username =
            generateGuestUsername();

        const usernameRef =
            doc(db, "usernames", username);

        const usernameSnap =
            await getDoc(usernameRef);

        exists =
            usernameSnap.exists();
    }

    return username;
}


// ================================
// USER SETUP
// ================================

export async function createUserIfNeeded(user) {

    const email =
        user.email.toLowerCase();

    const walletRef =
        doc(db, "wallets", email);

    const walletSnap =
        await getDoc(walletRef);

    if (walletSnap.exists()) {
        return walletSnap.data();
    }

    const username =
        await createUniqueUsername();

    const role =
        email === GOD_EMAIL
            ? "god"
            : "user";

    const newUser = {

        name:
            user.displayName,

        username,

        email,

        balance: 10,

        role,

        isAdmin:
            role === "god",

        totalSent: 0,

        totalReceived: 0,

        transactionCount: 0,

        createdAt:
            serverTimestamp()
    };

    await setDoc(
        walletRef,
        newUser
    );

    await setDoc(
        doc(db, "usernames", username),
        {
            email
        }
    );

    return newUser;
}


// ================================
// LOGIN
// ================================

export async function login() {

    const result =
        await signInWithPopup(
            auth,
            provider
        );

    await createUserIfNeeded(
        result.user
    );

    return result.user;
}


// ================================
// LOGOUT
// ================================

export async function logout() {

    await signOut(auth);

}


// ================================
// AUTH LISTENER
// ================================

export function listenAuth(callback) {

    return onAuthStateChanged(
        auth,
        callback
    );

}


// ================================
// GET USER DATA
// ================================

export async function getUserData(
    email
) {

    const ref =
        doc(
            db,
            "wallets",
            email.toLowerCase()
        );

    const snap =
        await getDoc(ref);

    if (!snap.exists()) {
        return null;
    }

    return snap.data();
}


// ================================
// UPDATE USERNAME
// ================================

export async function updateUsername(
    email,
    newUsername
) {

    newUsername =
        newUsername
        .trim()
        .toLowerCase();

    if (newUsername.length < 3) {
        throw new Error(
            "Username too short."
        );
    }

    const usernameRef =
        doc(
            db,
            "usernames",
            newUsername
        );

    const usernameSnap =
        await getDoc(usernameRef);

    if (usernameSnap.exists()) {

        throw new Error(
            "Username already taken."
        );
    }

    const userRef =
        doc(
            db,
            "wallets",
            email.toLowerCase()
        );

    const userSnap =
        await getDoc(userRef);

    const oldUsername =
        userSnap.data().username;

    await setDoc(
        usernameRef,
        {
            email
        }
    );

    await updateDoc(
        userRef,
        {
            username:
                newUsername
        }
    );

    return true;
}


// ================================
// SEND COINS
// ================================

export async function sendCoins(
    senderEmail,
    receiverEmail,
    amount
) {

    senderEmail =
        senderEmail.toLowerCase();

    receiverEmail =
        receiverEmail.toLowerCase();

    const senderRef =
        doc(
            db,
            "wallets",
            senderEmail
        );

    const receiverRef =
        doc(
            db,
            "wallets",
            receiverEmail
        );

    await runTransaction(
        db,
        async(transaction)=>{

            const senderDoc =
                await transaction.get(
                    senderRef
                );

            const receiverDoc =
                await transaction.get(
                    receiverRef
                );

            if (
                !receiverDoc.exists()
            ) {
                throw new Error(
                    "User not found."
                );
            }

            const balance =
                senderDoc.data()
                .balance;

            if (
                balance < amount
            ) {
                throw new Error(
                    "Not enough KittyCoins."
                );
            }

            transaction.update(
                senderRef,
                {
                    balance:
                        balance - amount,

                    totalSent:
                        (senderDoc.data()
                        .totalSent || 0)
                        + amount,

                    transactionCount:
                        (senderDoc.data()
                        .transactionCount || 0)
                        + 1
                }
            );

            transaction.update(
                receiverRef,
                {
                    balance:
                        receiverDoc.data()
                        .balance
                        + amount,

                    totalReceived:
                        (receiverDoc.data()
                        .totalReceived || 0)
                        + amount,

                    transactionCount:
                        (receiverDoc.data()
                        .transactionCount || 0)
                        + 1
                }
            );

        }
    );

    await addDoc(
        collection(
            db,
            "transactions"
        ),
        {
            from:
                senderEmail,

            to:
                receiverEmail,

            amount,

            timestamp:
                serverTimestamp()
        }
    );
}


// ================================
// TOP 10 LEADERBOARD
// ================================

export async function getTop10() {

    const q = query(
        collection(
            db,
            "wallets"
        ),
        orderBy(
            "balance",
            "desc"
        ),
        limit(10)
    );

    const snapshot =
        await getDocs(q);

    return snapshot.docs.map(
        doc => ({
            id: doc.id,
            ...doc.data()
        })
    );
}


// ================================
// CHECK ADMIN
// ================================

export function isAdmin(
    userData
) {

    return (
        userData.role === "admin"
        ||
        userData.role === "god"
    );

}


// ================================
// CHECK GOD MODE
// ================================

export function isGod(
    userData
) {

    return (
        userData.role === "god"
    );

}
