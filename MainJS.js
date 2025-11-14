/****************************************************
 * 1. Firebase Initialization
 ****************************************************/

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyDGJvoy39QvQpjkQsDf6Y5uHEN1GqzeMY0",
    authDomain: "mawd-59ecd.firebaseapp.com",
    projectId: "mawd-59ecd",
    storageBucket: "mawd-59ecd.firebasestorage.app",
    messagingSenderId: "864568963703",
    appId: "1:864568963703:web:997928c42d2310b9e00c72",
    measurementId: "G-YVFZ5MZ3G0"
};

let app = initializeApp(firebaseConfig);
let auth = getAuth(app);
let db = getFirestore(app);
let storage = getStorage(app);

let currentUserId = null;
let currentPath = "/";
let allUserItems = [];
let userItemsUnsubscribe = null;


/****************************************************
 * 2. Authentication Module
 ****************************************************/

async function handleSignup(email, password) {
    const msgEl = getMsg();
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", userCredential.user.uid), { items: [] });
        msgEl.textContent = "Account created. Logging in...";
        msgEl.className = msgGreen();
    } catch (err) {
        msgEl.textContent = err.message;
        msgEl.className = msgRed();
        enableAuthBtn("Sign Up");
    }
}

async function handleLogin(email, password) {
    const msgEl = getMsg();
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        msgEl.textContent = err.message;
        msgEl.className = msgRed();
        enableAuthBtn("Login");
    }
}

async function handleLogout(auto = false) {
    await signOut(auth);
    const msgEl = getMsg();
    if (msgEl) {
        msgEl.textContent = auto ? "Logged out due to inactivity." : "Logged out.";
        msgEl.className = msgGreen();
    }
}

function renderAuth(container, type) {
    container.innerHTML = `
        <div id="auth-card" class="card w-full max-w-md mx-auto mt-10">
            <h2 class="text-2xl font-semibold mb-6 text-center text-indigo-600">
                ${type === "login" ? "Welcome Back!" : "Create Account"}
            </h2>

            <div id="message" class="mb-4 text-sm text-center"></div>

            <form id="authForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium">Email</label>
                    <input type="email" name="email" class="input-field" required>
                </div>
                <div>
                    <label class="block text-sm font-medium">Password</label>
                    <input type="password" name="password" class="input-field" required>
                </div>
                <button class="btn-primary w-full">${type === "login" ? "Login" : "Sign Up"}</button>
            </form>

            <p class="mt-4 text-center text-sm">
                ${type === "login" ? "No account?" : "Have an account?"}
                <a href="#" id="switchView" class="text-indigo-600 font-medium">
                    ${type === "login" ? "Sign Up" : "Login"}
                </a>
            </p>
        </div>
    `;

    document.getElementById("switchView").onclick = (e) => {
        e.preventDefault();
        renderAuth(container, type === "login" ? "signup" : "login");
    };

    document.getElementById("authForm").onsubmit = (e) => {
        e.preventDefault();
        const btn = e.target.querySelector("button");
        btn.disabled = true;
        btn.textContent = "Processing...";

        const email = e.target.email.value;
        const password = e.target.password.value;

        type === "login" ? handleLogin(email, password) : handleSignup(email, password);
    };
}


/****************************************************
 * 3. Firestore Database Module
 ****************************************************/

function setupItemsSnapshot() {
    if (userItemsUnsubscribe) userItemsUnsubscribe();
    userItemsUnsubscribe = onSnapshot(doc(db, "users", currentUserId), (snap) => {
        allUserItems = snap.exists() ? snap.data().items : [];
        renderApp(currentPath);
    });
}

async function updateItemsInFirestore(items) {
    await setDoc(doc(db, "users", currentUserId), { items });
}


/****************************************************
 * 4. Storage (Upload / Delete / Download)
 ****************************************************/

async function handleUploadFile(file) {
    const msg = getMsg();

    if (existsInCurrentFolder(file.name)) {
        return showCustomAlert(`"${file.name}" already exists.`);
    }

    msg.textContent = `Uploading "${file.name}"...`;
    msg.className = msgBlue();

    try {
        const storagePath = `users/${currentUserId}${currentPath}${file.name}`;
        const uploadRef = ref(storage, storagePath);

        const uploaded = await uploadBytes(uploadRef, file);
        const url = await getDownloadURL(uploaded.ref);

        allUserItems.push({
            type: "file",
            name: file.name,
            path: currentPath,
            size: (file.size / 1024).toFixed(2) + " KB",
            date: Date.now(),
            storagePath,
            downloadURL: url
        });

        await updateItemsInFirestore(allUserItems);

        msg.textContent = `Uploaded "${file.name}".`;
        msg.className = msgGreen();
    } catch (err) {
        showCustomAlert("Upload failed.");
    }
}

async function handleCreateFolder(folderName) {
    const name = folderName.replace(/[^a-zA-Z0-9\s-_]/g, "").trim();
    const msg = getMsg();

    if (!name) return showCustomAlert("Folder name cannot be empty.");

    const newFolderPath = currentPath + name + "/";

    const exists = allUserItems.some(item =>
        item.type === "folder" &&
        (item.path + item.name + "/") === newFolderPath
    );

    if (exists) {
        return showCustomAlert(`A folder named "${name}" already exists.`);
    }

    const folder = {
        type: "folder",
        name,
        path: currentPath,
        date: Date.now()
    };

    allUserItems.push(folder);
    await updateItemsInFirestore(allUserItems);

    msg.textContent = `Folder "${name}" created successfully.`;
    msg.className = msgGreen();
}


async function downloadFile(name) {
    const file = findItem(name);

    if (!file || !file.downloadURL) {
        return showCustomAlert("Missing file data.");
    }

    const blob = await fetch(file.downloadURL).then(r => r.blob());
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();

    URL.revokeObjectURL(url);
}

function handleDeleteFile(name, isFolder) {
    showCustomConfirm(
        `Delete ${isFolder ? "this folder and everything inside it" : `"${name}"`}?`,
        async () => {
            const fullPath = currentPath + name + (isFolder ? "/" : "");

            let filesToDelete = [];
            allUserItems = allUserItems.filter(item => {
                const itemPath = item.path + item.name + (item.type === "folder" ? "/" : "");

                if (isFolder && itemPath.startsWith(fullPath)) {
                    if (item.storagePath) filesToDelete.push(item.storagePath);
                    return false;
                }

                if (!isFolder && itemPath === fullPath) {
                    if (item.storagePath) filesToDelete.push(item.storagePath);
                    return false;
                }

                return true;
            });

            for (let p of filesToDelete) {
                deleteObject(ref(storage, p)).catch(() => {});
            }

            await updateItemsInFirestore(allUserItems);
        }
    );
}


/****************************************************
 * 5. UI Rendering Module
 ****************************************************/

function renderApp(path = "/") {
    const app = document.getElementById("app");
    app.innerHTML = "";

    if (!currentUserId) return renderAuth(app, "login");

    currentPath = path;
    renderFileManager(app);
}

function renderFileManager(container) {

    const userEmail = auth.currentUser.email;

    container.innerHTML = `
        <div id="file-manager-card">

<div class="mb-8 flex justify-between">
    <h2 class="text-2xl font-semibold">Hello, ${userEmail}!</h2>

    <button onclick="toggleSettingsMenu()" 
        class="text-sm text-gray-700 border px-3 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">
        Settings ⚙️
    </button>
</div>

<div id="settingsMenu" 
    class="hidden bg-white dark:bg-gray-800 border rounded-lg p-4 shadow-lg absolute right-6 top-20 w-48">

    <button onclick="toggleDarkMode()" 
        class="w-full text-left py-2 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-200">
        🌙 Dark Mode
    </button>

    <button onclick="handleLogout()" 
        class="w-full text-left py-2 px-2 rounded text-red-600 hover:bg-red-100 dark:hover:bg-red-900">
        Logout
    </button>
</div>


            ${renderBreadcrumbs()}
            ${renderActions()}
            ${renderItems()}
        </div>
    `;

    document.getElementById("uploadForm").onsubmit = (e) => {
        e.preventDefault();
        const file = document.getElementById("fileInput").files[0];
        if (file) handleUploadFile(file);
    };

    document.getElementById("createFolderForm").onsubmit = (e) => {
        e.preventDefault();
        handleCreateFolder(e.target.folderName.value.trim());
        e.target.reset();
    };
}

function renderBreadcrumbs() {
    const parts = currentPath.split("/").filter(Boolean);
    let path = "/";

    let crumbs = `<div class="mb-4 p-2 bg-white border rounded shadow-sm flex justify-between">
        <div class="text-sm">`;

    crumbs += `<a href="#" onclick="renderApp('/')">Main</a>`;

    for (let folder of parts) {
        path += folder + "/";
        crumbs += ` / <a href="#" onclick="renderApp('${path}')">${folder}</a>`;
    }

    crumbs += `</div>`;

    if (currentPath !== "/") {
        crumbs += `<button onclick="goUpDirectory()" class="text-indigo-600">Up</button>`;
    }

    return crumbs + `</div>`;
}

function renderActions() {
    return `
        <div class="flex space-x-4 mb-8">
            <div class="card flex-1">
                <h3 class="text-lg mb-3">Create Folder</h3>
                <form id="createFolderForm" class="flex space-x-3">
                    <input name="folderName" class="input-field flex-grow" required>
                    <button class="btn-primary w-1/3">Create</button>
                </form>
            </div>

            <div class="card flex-1">
                <h3 class="text-lg mb-3">Upload File</h3>
                <form id="uploadForm" class="flex space-x-3">
                    <input id="fileInput" type="file" class="input-field flex-grow" required>
                    <button class="btn-primary w-1/3">Upload</button>
                </form>
            </div>
        </div>

        <p id="message" class="mb-4 text-sm text-center"></p>
    `;
}

function renderItems() {
    const items = getCurrentFolderItems();
    const list = items.length ?
        items.map(i => renderListItem(i)).join("") :
        `<li class="py-4 text-center text-gray-500">Empty folder.</li>`;

    return `
        <div class="card">
            <h3 class="text-xl mb-4">Files & Folders (${items.length})</h3>
            <ul>${list}</ul>
        </div>
    `;
}

function renderListItem(item) {
    const isFolder = item.type === "folder";
    const icon = isFolder ? "📁" : "📄";

    return `
        <li class="flex justify-between py-3 border-b cursor-pointer"
            onclick="${isFolder
                ? `renderApp('${currentPath}${item.name}/')`
                : `downloadFile('${item.name}')`}">

            <div>
                ${icon} ${item.name}
                <div class="text-xs text-gray-500">
                    ${isFolder ? "Folder" : item.size}
                </div>
            </div>

            <button onclick="event.stopPropagation(); handleDeleteFile('${item.name}', ${isFolder})"
                class="text-red-600">Delete</button>
        </li>
    `;
}

function getCurrentFolderItems() {
    const seen = new Set();
    const results = [];

    for (let item of allUserItems) {
        const full = item.path + item.name + (item.type === "folder" ? "/" : "");

if (full.startsWith(currentPath)) {
    let relative = full.slice(currentPath.length);

    if (!relative || relative === "/") continue;

    if (relative.endsWith("/")) relative = relative.slice(0, -1);

    const slash = relative.indexOf("/");
    const name = slash === -1 ? relative : relative.slice(0, slash);

    if (!name.trim()) continue;

    if (!seen.has(name)) {
        seen.add(name);
        results.push({
            type: slash === -1 ? item.type : "folder",
            name,
            size: item.size || ""
        });
    }
}

    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
}

window.goUpDirectory = function () {
    if (currentPath === "/") return;
    const trimmed = currentPath.slice(0, -1);
    renderApp(trimmed.substring(0, trimmed.lastIndexOf("/") + 1));
};


/****************************************************
 * 6. Modals & Alerts
 ****************************************************/

function showCustomAlert(msg) {
    alert(msg); // You can keep your modal here
}

function showCustomConfirm(msg, onConfirm) {
    if (confirm(msg)) onConfirm();
}


/****************************************************
 * 7. Auto Logout Timer
 ****************************************************/

let inactivityTimer = null;
const LOGOUT_TIME_MS = 5 * 60 * 1000;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        if (currentUserId) handleLogout(true);
    }, LOGOUT_TIME_MS);
}

["mousemove", "keypress", "scroll", "click"].forEach(ev => {
    window.addEventListener(ev, resetInactivityTimer);
});


/****************************************************
 * 8. Utility Helpers
 ****************************************************/

function findItem(name) {
    return allUserItems.find(i => i.name === name && i.path === currentPath);
}

function existsInCurrentFolder(name) {
    return allUserItems.some(i => i.name === name && i.path === currentPath);
}

function getMsg() {
    return document.getElementById("message");
}

const msgRed = () => "mb-4 text-sm text-center text-red-600";
const msgGreen = () => "mb-4 text-sm text-center text-green-600";
const msgBlue = () => "mb-4 text-sm text-center text-blue-600";

function enableAuthBtn(text) {
    const btn = document.querySelector("#authForm button");
    btn.disabled = false;
    btn.textContent = text;
}


/****************************************************
 * Dark Mode Support
 ****************************************************/

window.toggleDarkMode = function () {
    document.documentElement.classList.toggle("dark");

    const isDark = document.documentElement.classList.contains("dark");
    localStorage.setItem("darkMode", isDark ? "enabled" : "disabled");
};

(function () {
    if (localStorage.getItem("darkMode") === "enabled") {
        document.documentElement.classList.add("dark");
    }
})();


/****************************************************
 * Settings Menu Controls
 ****************************************************/

window.toggleSettingsMenu = function () {
    const menu = document.getElementById("settingsMenu");
    menu.classList.toggle("hidden");
};

document.addEventListener("click", (e) => {
    const menu = document.getElementById("settingsMenu");
    if (!menu) return;

    if (!menu.contains(e.target) && 
        !e.target.matches("button[onclick='toggleSettingsMenu()']")) {
        menu.classList.add("hidden");
    }
});



/****************************************************
 * 9. Window Exports
 ****************************************************/

window.handleLogout = handleLogout;
window.handleDeleteFile = handleDeleteFile;
window.downloadFile = downloadFile;
window.renderApp = renderApp;



/****************************************************
 * 10. Startup
 ****************************************************/

onAuthStateChanged(auth, (user) => {
    currentUserId = user ? user.uid : null;
    if (user) setupItemsSnapshot();
    renderApp("/");
});
