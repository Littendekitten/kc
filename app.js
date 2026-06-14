// 1. FIREBASE INTERNATIONALE CDN IMPORTS
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, runTransaction, collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. JOUW VERIFIEERDE FIREBASE CONFIGURATIE
const firebaseConfig = {
    apiKey: "AIzaSyDra6ILu1IGCyZ64fTfxKYGoQqEL6CbUFE",
    authDomain: "kc-xchange.firebaseapp.com",
    projectId: "kc-xchange",
    storageBucket: "kc-xchange.firebasestorage.app",
    messagingSenderId: "25389828665",
    appId: "1:25389828665:web:0e42a57c7176e06b499be8",
    measurementId: "G-G7TY0C4T3X"
};

// Services opstarten
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// 3. HTML ELEMENTEN VERBINDEN
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const userPhoto = document.getElementById('user-photo');
const balanceAmount = document.getElementById('balance-amount');
const transferForm = document.getElementById('transfer-form');
const btnSend = document.getElementById('btn-send');

// Leaderboard elementen
const leaderboardList = document.getElementById('leaderboard-list');
const myRankTag = document.getElementById('my-rank-tag');
const myRankEmail = document.getElementById('my-rank-email');
const myRankBalance = document.getElementById('my-rank-balance');

// Admin elementen
const btnAdminPanel = document.getElementById('btn-admin-panel');
const btnAdminBack = document.getElementById('btn-admin-back');
const userContent = document.getElementById('user-content');
const adminContent = document.getElementById('admin-content');
const adminBalanceForm = document.getElementById('admin-balance-form');
const adminPromoteForm = document.getElementById('admin-promote-form');

// Listener referentie voor leaderboard stream (om geheugenlekken te voorkomen)
let leaderboardUnsubscribe = null;

// 4. AUTHENTICATIE CONTROLEREN & GEBRUIKER INITIALISEREN
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Schakel schermen om naar Dashboard
        authView.classList.add('hidden');
        appView.classList.remove('hidden');

        // Gebruikersinfo invullen
        userName.innerText = user.displayName;
        userEmail.innerText = user.email;
        userPhoto.src = user.photoURL || 'https://placehold.co/150';

        const userRef = doc(db, "wallets", user.email.toLowerCase());
        const userSnap = await getDoc(userRef);

        // Bepaal of deze user admin rechten bezit
        const isSuperAdmin = user.email.toLowerCase() === 'littendekitten@gmail.com';
        const hasAdminFlag = userSnap.exists() && userSnap.data().isAdmin === true;

        if (userSnap.exists() && userSnap.data().balance !== undefined) {
            balanceAmount.innerText = userSnap.data().balance.toFixed(2);
            // Synconiseer isAdmin vlag voor de superadmin indien nog niet aanwezig in DB
            if (isSuperAdmin && !userSnap.data().isAdmin) {
                await setDoc(userRef, { isAdmin: true }, { merge: true });
            }
        } else {
            // Nieuwe wallet genereren + Starter bonus uitdelen!
            const startBalance = 10.00;
            await setDoc(userRef, {
                name: user.displayName,
                email: user.email.toLowerCase(),
                balance: startBalance,
                isAdmin: isSuperAdmin, // Wordt direct true als jij het bent
                createdAt: new Date()
            }, { merge: true });
            balanceAmount.innerText = startBalance.toFixed(2);
            alert("Welcome to KC-Xchange! You received a starter bonus of 10 free KittyCoins! 🐱🎉");
        }

        // Toon Admin Panel knop op basis van status
        if (isSuperAdmin || hasAdminFlag) {
            btnAdminPanel.classList.remove('hidden');
        } else {
            btnAdminPanel.classList.add('hidden');
        }

        // Knal de realtime leaderboard stream aan
        startLeaderboard(user.email.toLowerCase());

    } else {
        // Niet ingelogd? Terug naar inlogscherm
        authView.classList.remove('hidden');
        appView.classList.add('hidden');
        userContent.classList.remove('hidden');
        adminContent.classList.add('hidden');
        
        // Kill de actieve database stream bij uitloggen
        if (leaderboardUnsubscribe) {
            leaderboardUnsubscribe();
        }
    }
});

// 5. REALTIME LEADERBOARD LOGICA
function startLeaderboard(currentUserEmail) {
    const walletsRef = collection(db, "wallets");
    const q = query(walletsRef, orderBy("balance", "desc"));

    // Realtime stream via onSnapshot
    leaderboardUnsubscribe = onSnapshot(q, (snapshot) => {
        leaderboardList.innerHTML = "";
        let currentRank = 1;
        let userRank = -1;
        let userCurrentBalance = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const email = data.email || docSnap.id;
            const name = data.name || email.split('@')[0];
            const balance = data.balance || 0;

            if (email === currentUserEmail) {
                userRank = currentRank;
                userCurrentBalance = balance;
            }

            // Alleen de Top 10 renderen in de hoofdlijst
            if (currentRank <= 10) {
                let medal = "";
                let rowStyle = "bg-slate-900/40 border border-slate-800/60";
                let badgeStyle = "bg-slate-800 text-slate-400";

                if (currentRank === 1) {
                    medal = '<i class="fa-solid fa-trophy text-amber-400 animate-bounce"></i> ';
                    rowStyle = "bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/30";
                    badgeStyle = "bg-amber-500 text-slate-950 font-black";
                } else if (currentRank === 2) {
                    medal = '<i class="fa-solid fa-medal text-slate-300"></i> ';
                    rowStyle = "bg-gradient-to-r from-slate-400/10 to-transparent border border-slate-400/20";
                    badgeStyle = "bg-slate-300 text-slate-950 font-black";
                } else if (currentRank === 3) {
                    medal = '<i class="fa-solid fa-medal text-amber-700"></i> ';
                    rowStyle = "bg-gradient-to-r from-amber-700/10 to-transparent border border-amber-700/20";
                    badgeStyle = "bg-amber-700 text-white font-black";
                }

                if (email === currentUserEmail) {
                    rowStyle += " ring-2 ring-amber-400/50 ring-offset-2 ring-offset-slate-950";
                }

                const rowHtml = `
                    <div class="flex items-center justify-between p-3 rounded-xl transition hover:translate-x-1 duration-200 ${rowStyle}">
                        <div class="flex items-center gap-3">
                            <span class="w-7 h-7 flex items-center justify-center text-xs rounded-lg ${badgeStyle}">#${currentRank}</span>
                            <div>
                                <p class="text-sm font-semibold text-white flex items-center gap-1.5">${medal}${name}</p>
                                <p class="text-[10px] text-slate-500">${email}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-sm font-bold text-amber-400">${balance.toFixed(2)} <span class="text-[10px] font-normal text-slate-500">KC</span></p>
                        </div>
                    </div>
                `;
                leaderboardList.insertAdjacentHTML('beforeend', rowHtml);
            }
            currentRank++;
        });

        // Update de sticky "My Ranking" bar onder het leaderboard
        if (userRank !== -1) {
            myRankTag.innerText = `#${userRank}`;
            myRankEmail.innerText = currentUserEmail;
            myRankBalance.innerText = userCurrentBalance.toFixed(2);
        }
    });
}

// 6. COINS VERSTUREN (VEILIGE TRANSACTIE)
transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const senderEmail = auth.currentUser.email.toLowerCase();
    const receiverEmail = document.getElementById('receiver-email').value.trim().toLowerCase();
    const amount = parseFloat(document.getElementById('transfer-amount').value);

    if (senderEmail === receiverEmail) return alert("You cannot send KittyCoins to yourself, ya goofy cat! 🐱");
    if (isNaN(amount) || amount <= 0) return alert("Please enter a valid amount higher than 0.");

    btnSend.disabled = true;
    btnSend.innerText = "Processing...";

    const senderRef = doc(db, "wallets", senderEmail);
    const receiverRef = doc(db, "wallets", receiverEmail);

    try {
        await runTransaction(db, async (transaction) => {
            const senderDoc = await transaction.get(senderRef);
            const receiverDoc = await transaction.get(receiverRef);

            if (!receiverDoc.exists()) {
                throw new Error("Recipient account not found! Your classmate needs to log into KC-Xchange at least once.");
            }

            const currentSenderBalance = senderDoc.data().balance;
            if (currentSenderBalance < amount) {
                throw new Error("Transaction denied: Insufficient funds! 😿");
            }

            transaction.update(senderRef, { balance: currentSenderBalance - amount });
            transaction.update(receiverRef, { balance: receiverDoc.data().balance + amount });
        });

        alert(`Boom! Successfully sent ${amount.toFixed(2)} KC! 🚀`);
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

// 7. ADMIN STRUCTUUR EN TOGGLES
btnAdminPanel.addEventListener('click', () => {
    userContent.classList.add('hidden');
    adminContent.classList.remove('hidden');
});

btnAdminBack.addEventListener('click', () => {
    adminContent.classList.add('hidden');
    userContent.classList.remove('hidden');
});

// ADMIN POWER 1: MUNTEN PRINTEN / OVERSCHRIJVEN
adminBalanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetEmail = document.getElementById('admin-target-email').value.trim().toLowerCase();
    const newAmount = parseFloat(document.getElementById('admin-target-amount').value);

    if (isNaN(newAmount) || newAmount < 0) return alert("Enter a valid amount.");
    const targetRef = doc(db, "wallets", targetEmail);
    
    try {
        await setDoc(targetRef, {
            balance: newAmount,
            email: targetEmail,
            name: targetEmail.split('@')[0]
        }, { merge: true });

        alert(`Machtig! ${targetEmail} balance updated to ${newAmount.toFixed(2)} KC! ⚡`);
        adminBalanceForm.reset();

        if (targetEmail === auth.currentUser.email.toLowerCase()) {
            balanceAmount.innerText = newAmount.toFixed(2);
        }
    } catch (err) {
        alert("Error manipulation: " + err.message);
    }
});

// ADMIN POWER 2: CO-ADMINS AANWIIJZEN
adminPromoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetEmail = document.getElementById('admin-promote-email').value.trim().toLowerCase();
    const targetRef = doc(db, "wallets", targetEmail);

    try {
        await setDoc(targetRef, {
            isAdmin: true,
            email: targetEmail,
            name: targetEmail.split('@')[0]
        }, { merge: true });

        alert(`Success! ${targetEmail} is now a co-admin! 👑`);
        adminPromoteForm.reset();
    } catch (err) {
        alert("Error promoting: " + err.message);
    }
});

// 8. GOOGLE IN- EN UITLOG EVENT LISTENERS
btnLogin.addEventListener('click', () => {
    signInWithPopup(auth, provider).catch((error) => alert("Login failed: " + error.message));
});

btnLogout.addEventListener('click', () => {
    signOut(auth).catch((error) => alert("Logout failed: " + error.message));
});
