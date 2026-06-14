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

// DOM Elementen koppelen
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const balanceAmount = document.getElementById('balance-amount');
const transferForm = document.getElementById('transfer-form');
const btnSend = document.getElementById('btn-send');

const userDisplayName = document.getElementById('user-display-name');
const userEmail = document.getElementById('user-email');
const userPhoto = document.getElementById('user-photo');
const topbarUsername = document.getElementById('topbar-username');

const btnOpenSidebar = document.getElementById('btn-open-sidebar');
const btnCloseSidebar = document.getElementById('btn-close-sidebar');

const navDashboard = document.getElementById('nav-dashboard');
const navSettings = document.getElementById('nav-settings');
const navAdmin = document.getElementById('nav-admin');

const viewDashboard = document.getElementById('view-dashboard');
const viewSettings = document.getElementById('view-settings');
const viewAdmin = document.getElementById('view-admin');

const settingsUsernameForm = document.getElementById('settings-username-form');
const settingsUsernameInput = document.getElementById('settings-username-input');
const adminBalanceForm = document.getElementById('admin-balance-form');
const adminPromoteForm = document.getElementById('admin-promote-form');

const leaderboardList = document.getElementById('leaderboard-list');
const myRankTag = document.getElementById('my-rank-tag');
const myRankUser = document.getElementById('my-rank-user');
const myRankBalance = document.getElementById('my-rank-balance');

let leaderboardUnsubscribe = null;

// Snelkoppeling sidebar open/dicht
if(btnOpenSidebar) btnOpenSidebar.addEventListener('click', () => document.body.classList.add('sidebar-open'));
if(btnCloseSidebar) btnCloseSidebar.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

function switchView(activeNav, activeView) {
    const views = [viewDashboard, viewSettings, viewAdmin];
    const navs = [navDashboard, navSettings, navAdmin];
    
    views.forEach(v => { if(v) v.classList.add('hidden'); });
    navs.forEach(n => { if(n) n.classList.remove('bg-slate-900', 'text-amber-400', 'font-bold'); });

    if(activeView) activeView.classList.remove('hidden');
    if(activeNav) activeNav.classList.add('bg-slate-900', 'text-amber-400', 'font-bold');
    document.body.classList.remove('sidebar-open');
}

if(navDashboard) navDashboard.addEventListener('click', () => switchView(navDashboard, viewDashboard));
if(navSettings) navSettings.addEventListener('click', () => switchView(navSettings, viewSettings));
if(navAdmin) navAdmin.addEventListener('click', () => switchView(navAdmin, viewAdmin));

// Unieke gastnaam generator
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

// LOGIN CONFIG & STATE CONTROL
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if(authView) authView.classList.add('hidden');
        if(appView) appView.classList.remove('hidden');

        if(userEmail) userEmail.innerText = user.email;
        if(userPhoto) userPhoto.src = user.photoURL || 'https://placehold.co/150';

        const userRef = doc(db, "wallets", user.email.toLowerCase());
        let userSnap = await getDoc(userRef);
        let currentUsername = "";

        if (userSnap.exists() && userSnap.data().username) {
            currentUsername = userSnap.data().username;
            if(balanceAmount) balanceAmount.innerText = (userSnap.data().balance || 0).toFixed(2);
        } else {
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
            if(balanceAmount) balanceAmount.innerText = startBalance.toFixed(2);
            userSnap = await getDoc(userRef);
        }

        if(userDisplayName) userDisplayName.innerText = `@${currentUsername}`;
        if(topbarUsername) topbarUsername.innerText = `@${currentUsername}`;
        if(settingsUsernameInput) settingsUsernameInput.value = currentUsername;

        const isAdmin = user.email.toLowerCase() === 'littendekitten@gmail.com' || (userSnap.exists() && userSnap.data().isAdmin === true);
        if (isAdmin && navAdmin) {
            navAdmin.classList.remove('hidden');
        } else if(navAdmin) {
            navAdmin.classList.add('hidden');
        }

        startLeaderboard(user.email.toLowerCase());
    } else {
        if(authView) authView.classList.remove('hidden');
        if(appView) appView.classList.add('hidden');
        if (leaderboardUnsubscribe) leaderboardUnsubscribe();
    }
});

// GEBRUIKERSNAAM OPSLAAN (UNIEK CHECK)
if(settingsUsernameForm) {
    settingsUsernameForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        let newUsername = settingsUsernameInput.value.trim().toLowerCase().replace(/\s+/g, '');
        if (!newUsername || newUsername.includes('@')) return alert("Invalid username format.");

        const myEmail = auth.currentUser.email.toLowerCase();
        try {
            const q = query(collection(db, "wallets"), where("username", "==", newUsername));
            const querySnap = await getDocs(q);
            let isTaken = false;
            querySnap.forEach((doc) => { if (doc.id !== myEmail) isTaken = true; });

            if (isTaken) return alert(`Username @${newUsername} is taken! Pick another.`);

            await setDoc(doc(db, "wallets", myEmail), { username: newUsername }, { merge: true });
            if(userDisplayName) userDisplayName.innerText = `@${newUsername}`;
            if(topbarUsername) topbarUsername.innerText = `@${newUsername}`;
            alert(`Public username is now @${newUsername}!`);
        } catch (err) { alert(err.message); }
    });
}

// REALTIME RANKING STREAM
function startLeaderboard(currentUserEmail) {
    const q = query(collection(db, "wallets"), orderBy("balance", "desc"));
    leaderboardUnsubscribe = onSnapshot(q, (snapshot) => {
        if(!leaderboardList) return;
        leaderboardList.innerHTML = "";
        let currentRank = 1, userRank = -1, userCurrentBalance = 0, userCurrentName = "guest";

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
                            <p class="text-sm font-semibold text-white">@${uname} ${medal}</p>
                        </div>
                        <p class="text-sm font-bold text-amber-400">${balance.toFixed(2)} <span class="text-[10px] text-slate-500">KC</span></p>
                    </div>`;
                leaderboardList.insertAdjacentHTML('beforeend', rowHtml);
            }
            currentRank++;
        });

        if (userRank !== -1) {
            if(myRankTag) myRankTag.innerText = `#${userRank}`;
            if(myRankUser) myRankUser.innerText = `@${userCurrentName}`;
            if(myRankBalance) myRankBalance.innerText = userCurrentBalance.toFixed(2);
        }
    });
}

// COINS VERSTUREN
if(transferForm) {
    transferForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetUname = document.getElementById('receiver-username').value.trim().toLowerCase().replace('@', '');
        const amount = parseFloat(document.getElementById('transfer-amount').value);
        const myEmail = auth.currentUser.email.toLowerCase();

        if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount.");
        if(btnSend) { btnSend.disabled = true; btnSend.innerText = "Processing..."; }

        try {
            const q = query(collection(db, "wallets"), where("username", "==", targetUname));
            const querySnap = await getDocs(q);
            if (querySnap.empty) throw new Error(`@${targetUname} not found!`);

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

            alert(`Successfully sent ${amount.toFixed(2)} KC to @${targetUname}!`);
            transferForm.reset();
        } catch (err) { alert(err.message); }
        finally { if(btnSend) { btnSend.disabled = false; btnSend.innerText = "Send Coins"; } }
    });
}

// ADMIN PANEL ACTIES
if(adminBalanceForm) {
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
            alert(`Overrode balance of @${targetUname}!`);
            adminBalanceForm.reset();
        } catch(err) { alert(err.message); }
    });
}

if(adminPromoteForm) {
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
            alert(`@${targetUname} promoted to Admin!`);
            adminPromoteForm.reset();
        } catch(err) { alert(err.message); }
    });
}

if(btnLogin) btnLogin.addEventListener('click', () => signInWithPopup(auth, provider).catch(err => alert(err.message)));
if(btnLogout) btnLogout.addEventListener('click', () => signOut(auth));
