import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, runTransaction, collection, query, orderBy, onSnapshot, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDra6ILu1IGCyZ64fTfxKYGoQqEL6CbUFE",
    authDomain: "kc-xchange.firebaseapp.com",
    projectId: "kc-xchange",
    storageBucket: "kc-xchange.firebasestorage.app",
    messagingSenderId: "25389828665",
    appId: "1:25389828665:web:0e42a57c7176e06b499be8",
    measurementId: "G-G7TY0C4T3X"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// DOM Elementen
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const balanceAmount = document.getElementById('balance-amount');
const transferForm = document.getElementById('transfer-form');
const btnSend = document.getElementById('btn-send');

// Profile & Topbar info
const userDisplayName = document.getElementById('user-display-name');
const userEmail = document.getElementById('user-email');
const userPhoto = document.getElementById('user-photo');
const topbarUsername = document.getElementById('topbar-username');

// Sidebar Hamburger Elementen
const sidebar = document.body;
const btnOpenSidebar = document.getElementById('btn-open-sidebar');
const btnCloseSidebar = document.getElementById('btn-close-sidebar');

// Views navigatie
const navDashboard = document.getElementById('nav-dashboard');
const navSettings = document.getElementById('nav-settings');
const navAdmin = document.getElementById('nav-admin');

const viewDashboard = document.getElementById('view-dashboard');
const viewSettings = document.getElementById('view-settings');
const viewAdmin = document.getElementById('view-admin');

// Formulieren
const settingsUsernameForm = document.getElementById('settings-username-form');
const settingsUsernameInput = document.getElementById('settings-username-input');
const adminBalanceForm = document.getElementById('admin-balance-form');
const adminPromoteForm = document.getElementById('admin-promote-form');

// Leaderboard elementen
const leaderboardList = document.getElementById('leaderboard-list');
const myRankTag = document.getElementById('my-rank-tag');
const myRankUser = document.getElementById('my-rank-user');
const myRankBalance = document.getElementById('my-rank-balance');

let leaderboardUnsubscribe = null;

// HAMBURGER BAR CLAUDE/GEMINI STYLE NAVIGATION TOGGLES
btnOpenSidebar.addEventListener('click', () => sidebar.classList.add('sidebar-open'));
btnCloseSidebar.addEventListener('click', () => sidebar.classList.remove('sidebar-open'));

function switchView(activeNav, activeView) {
    [viewDashboard, viewSettings, viewAdmin].forEach(v => v.classList.add('hidden'));
    [navDashboard, navSettings, navAdmin].forEach(n => n.classList.remove('bg-slate-900', 'text-amber-400', 'font-bold'));
    [navDashboard, navSettings, navAdmin].forEach(n => n.classList.add('text-slate-400'));

    activeView.classList.remove('hidden');
    activeNav.classList.add('bg-slate-900', 'text-amber-400', 'font-bold');
    sidebar.classList.remove('sidebar-open'); // Sluit op mobiel na klik
}

navDashboard.addEventListener('click', () => switchView(navDashboard, viewDashboard));
navSettings.addEventListener('click', () => switchView(navSettings, viewSettings));
navAdmin.addEventListener('click', () => switchView(navAdmin, viewAdmin));

// HULPFUNCTIE: GENEREER UNIEKE DEFAULT GUEST USERNAME
async function generateUniqueGuestName() {
    let exists = true;
    let guestName = "";
    while (exists) {
        let rand = Math.floor(1000 + Math.random() * 9000);
        guestName = `kc-guest-${rand}`;
        const q = query(collection(db, "wallets"), where("username", "==", guestName));
        const snap = await getDocs(q);
        if (snap.empty) exists = false;
    }
    return guestName;
}

// AUTH CONTROLLER
onAuthStateChanged(auth, async (user) => {
    if (user) {
        authView.classList.add('hidden');
        appView.classList.remove('hidden');

        userEmail.innerText = user.email;
        userPhoto.src = user.photoURL || 'https://placehold.co/150';

        const userRef = doc(db, "wallets", user.email.toLowerCase());
        let userSnap = await getDoc(userRef);

        let currentUsername = "";

        if (userSnap.exists() && userSnap.data().username) {
            currentUsername = userSnap.data().username;
            balanceAmount.innerText = (userSnap.data().balance || 0).toFixed(2);
        } else {
            // Nieuwe account creatie -> unieke gastnaam genereren
            currentUsername = await generateUniqueGuestName();
            const startBalance = 10.00;
            await setDoc(userRef, {
                name: user.displayName,
                email: user.email.toLowerCase(),
                username: currentUsername,
                balance: startBalance,
                isAdmin: user.email.toLowerCase() === 'littendekitten@gmail.com',
                createdAt: new Date()
            }, { merge: true });
            balanceAmount.innerText = startBalance.toFixed(2);
            userSnap = await getDoc(userRef); // Herlaad data
        }

        // Update naam weergaven
        userDisplayName.innerText = `@${currentUsername}`;
        topbarUsername.innerText = `@${currentUsername}`;
        settingsUsernameInput.value = currentUsername;

        // Admin rechten valideren
        const isAdmin = user.email.toLowerCase() === 'littendekitten@gmail.com' || (userSnap.exists() && userSnap.data().isAdmin === true);
        if (isAdmin) {
            navAdmin.classList.remove('hidden');
        } else {
            navAdmin.classList.add('hidden');
        }

        startLeaderboard(user.email.toLowerCase());

    } else {
        authView.classList.remove('hidden');
        appView.classList.add('hidden');
        if (leaderboardUnsubscribe) leaderboardUnsubscribe();
    }
});

// SETTINGS: USERNAME VERANDEREN (IEDEREEN STRENG UNIEK!)
settingsUsernameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let newUsername = settingsUsernameInput.value.trim().toLowerCase().replace(/\s+/g, '');
    if (!newUsername || newUsername.includes('@')) return alert("Invalid username format.");

    const myEmail = auth.currentUser.email.toLowerCase();
    const userRef = doc(db, "wallets", myEmail);

    try {
        // Controleer of de naam al door iemand anders bezet is
        const q = query(collection(db, "wallets"), where("username", "==", newUsername));
        const querySnap = await getDocs(q);

        let isTaken = false;
        querySnap.forEach((doc) => {
            if (doc.id !== myEmail) isTaken = true; // Naam is bezet door iemand anders
        });

        if (isTaken) {
            return alert(`😿 Username @${newUsername} is already taken by a teammate! Pick another one.`);
        }

        await setDoc(userRef, { username: newUsername }, { merge: true });
        userDisplayName.innerText = `@${newUsername}`;
        topbarUsername.innerText = `@${newUsername}`;
        alert(`🎉 Success! Your public unique username is now @${newUsername}`);
    } catch (err) {
        alert("Settings error: " + err.message);
    }
});

// REALTIME LEADERBOARD LOGICA
function startLeaderboard(currentUserEmail) {
    const q = query(collection(db, "wallets"), orderBy("balance", "desc"));

    leaderboardUnsubscribe = onSnapshot(q, (snapshot) => {
        leaderboardList.innerHTML = "";
        let currentRank = 1;
        let userRank = -1;
        let userCurrentBalance = 0;
        let userCurrentName = "guest";

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const email = data.email || docSnap.id;
            const uname = data.username || "guest";
            const balance = data.balance || 0;

            if (email === currentUserEmail) {
                userRank = currentRank;
                userCurrentBalance = balance;
                userCurrentName = uname;
            }

            if (currentRank <= 10) {
                let medal = "", rowStyle = "bg-slate-900/40 border border-slate-800/60", badgeStyle = "bg-slate-800 text-slate-400";
                if (currentRank === 1) { medal = '🏆 '; rowStyle = "bg-amber-500/10 border border-amber-500/30"; badgeStyle = "bg-amber-500 text-slate-950 font-black"; }
                else if (currentRank === 2) { medal = '🥈 '; rowStyle = "bg-slate-400/10 border border-slate-400/20"; badgeStyle = "bg-slate-300 text-slate-950 font-black"; }
                else if (currentRank === 3) { medal = '🥉 '; rowStyle = "bg-amber-700/10 border border-amber-700/20"; badgeStyle = "bg-amber-700 text-white font-black"; }

                if (email === currentUserEmail) rowStyle += " ring-1 ring-amber-400";

                const rowHtml = `
                    <div class="flex items-center justify-between p-3 rounded-xl ${rowStyle}">
                        <div class="flex items-center gap-3">
                            <span class="w-7 h-7 flex items-center justify-center text-xs rounded-lg ${badgeStyle}">#${currentRank}</span>
                            <div>
                                <p class="text-sm font-semibold text-white">@${uname} ${medal}</p>
                            </div>
                        </div>
                        <p class="text-sm font-bold text-amber-400">${balance.toFixed(2)} <span class="text-[10px] text-slate-500">KC</span></p>
                    </div>`;
                leaderboardList.insertAdjacentHTML('beforeend', rowHtml);
            }
            currentRank++;
        });

        if (userRank !== -1) {
            myRankTag.innerText = `#${userRank}`;
            myRankUser.innerText = `@${userCurrentName}`;
            myRankBalance.innerText = userCurrentBalance.toFixed(2);
        }
    });
}

// MUNTEN VERSTUREN MET @USERNAME IN PLAATS VAN EMAIL
transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetUname = document.getElementById('receiver-username').value.trim().toLowerCase().replace('@', '');
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    const myEmail = auth.currentUser.email.toLowerCase();

    if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount.");

    btnSend.disabled = true;
    btnSend.innerText = "Processing...";

    try {
        // Zoek de ontvanger via zijn unieke username
        const q = query(collection(db, "wallets"), where("username", "==", targetUname));
        const querySnap = await getDocs(q);

        if (querySnap.empty) {
            throw new Error(`Account with username @${targetUname} not found! Check spelling.`);
        }

        let receiverEmail = "";
        querySnap.forEach((doc) => { receiverEmail = doc.id; });

        if (myEmail === receiverEmail) throw new Error("You cannot send coins to yourself!");

        const senderRef = doc(db, "wallets", myEmail);
        const receiverRef = doc(db, "wallets", receiverEmail);

        await runTransaction(db, async (transaction) => {
            const senderDoc = await transaction.get(senderRef);
            const receiverDoc = await transaction.get(receiverRef);

            const senderBal = senderDoc.data().balance || 0;
            if (senderBal < amount) throw new Error("Insufficient funds! 😿");

            transaction.update(senderRef, { balance: senderBal - amount });
            transaction.update(receiverRef, { balance: (receiverDoc.data().balance || 0) + amount });
        });

        alert(`Successfully sent ${amount.toFixed(2)} KC to @${targetUname}! 🚀`);
        transferForm.reset();
        const updatedDoc = await getDoc(senderRef);
        balanceAmount.innerText = (updatedDoc.data().balance).toFixed(2);

    } catch (err) {
        alert(err.message);
    } finally {
        btnSend.disabled = false;
        btnSend.innerText = "Send Coins";
    }
});

// ADMIN CODES: RECHTEN MANIPULATIE VIA USERNAME
adminBalanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetUname = document.getElementById('admin-target-username').value.trim().toLowerCase().replace('@', '');
    const newAmount = parseFloat(document.getElementById('admin-target-amount').value);

    try {
        const q = query(collection(db, "wallets"), where("username", "==", targetUname));
        const snap = await getDocs(q);
        if (snap.empty) return alert("Username not found.");

        let targetEmail = "";
        snap.forEach(d => targetEmail = d.id);

        await setDoc(doc(db, "wallets", targetEmail), { balance: newAmount }, { merge: true });
        alert(`Overrode @${targetUname} balance to ${newAmount} KC!`);
        adminBalanceForm.reset();
    } catch(err) { alert(err.message); }
});

adminPromoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetUname = document.getElementById('admin-promote-username').value.trim().toLowerCase().replace('@', '');

    try {
        const q = query(collection(db, "wallets"), where("username", "==", targetUname));
        const snap = await getDocs(q);
        if (snap.empty) return alert("Username not found.");

        let targetEmail = "";
        snap.forEach(d => targetEmail = d.id);

        await setDoc(doc(db, "wallets", targetEmail), { isAdmin: true }, { merge: true });
        alert(`@${targetUname} has been promoted to Admin! 👑`);
        adminPromoteForm.reset();
    } catch(err) { alert(err.message); }
});

// GOOGLE AUTH ACTIONS
btnLogin.addEventListener('click', () => signInWithPopup(auth, provider).catch(err => alert(err.message)));
btnLogout.addEventListener('click', () => signOut(auth));
