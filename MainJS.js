
/* 1. Firebase Initialization*/
import { showShareNotification } from "./notifications.js";
import { t, setLanguage, getLanguage, LANGUAGES } from "./languages.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

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
  onSnapshot,
  getDocs,
  collection,
  query,
  where,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
/* */
const FREE_STORAGE_BYTES = 20 * 1024 * 1024 * 1024;  
const PREMIUM_STORAGE_BYTES = 100 * 1024 * 1024 * 1024; 

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

let isMigrating = false;

/* Auth Module */

async function handleSignup(email, password) {
    const msgEl = getMsg();
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", userCredential.user.uid), { items: [], email });
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
                ${type === "login" ? "Welcome" : "Create Account"}
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

/*Firestore/Database Module*/

let previousItems = [];
let lastChecked = Number(localStorage.getItem("lastChecked")) || 0;

function setupItemsSnapshot() {
    if (userItemsUnsubscribe) userItemsUnsubscribe();

    userItemsUnsubscribe = onSnapshot(doc(db, "users", currentUserId), async (snap) => {

        const newItems = snap.exists() && snap.data().items ? snap.data().items : [];

        newItems.forEach(item => {
            const isShared = item.sharedBy && item.sharedBy !== (auth && auth.currentUser ? auth.currentUser.email : null);

            if (!isShared) return;

            const alreadyHad = previousItems.some(i =>
                i.name === item.name &&
                i.path === item.path
            );

            const isNewRealtime = !alreadyHad;
            const isNewAfterLogin = item.sharedAt && item.sharedAt > lastChecked;

            if (isNewRealtime || isNewAfterLogin) {
                showShareNotification(item.name, item.sharedBy);
            }
        });

        previousItems = newItems;
        lastChecked = Date.now();
        localStorage.setItem("lastChecked", lastChecked);

        allUserItems = newItems;

        if (!isMigrating) {
            await migrateOldSizes();
        }

        renderApp(currentPath);
        updateStorageDisplay();
    });
}

async function updateItemsInFirestore(items) {
    await setDoc(doc(db, "users", currentUserId), { items }, { merge: true });
    updateStorageDisplay();
}

/* Renamer */

function splitNameExt(filename) {
    const idx = filename.lastIndexOf(".");
    if (idx === -1) return [filename, ""];
    return [filename.slice(0, idx), filename.slice(idx)];
}

function makeNameWithSuffix(base, ext, n) {
    return `${base} (${n})${ext}`;
}

function generateUniqueNameFor(items, desiredName, path) {
    const [base, ext] = splitNameExt(desiredName);
    let n = 1;
    let candidate = desiredName;
    const exists = (name) => items.some(i => i.name === name && i.path === path);
    while (exists(candidate)) {
        n++;
        candidate = makeNameWithSuffix(base, ext, n);
    }
    return candidate;
}

function convertSizeStringToBytes(sizeStr) {
    if (!sizeStr || typeof sizeStr !== "string") return 0;
    const m = sizeStr.trim().match(/^([\d.,]+)\s*(B|KB|MB|GB)?$/i);
    if (!m) return 0;
    const num = parseFloat(m[1].replace(/,/g, ""));
    const unit = (m[2] || "").toUpperCase();
    if (isNaN(num)) return 0;
    switch (unit) {
        case "GB": return Math.round(num * 1024 * 1024 * 1024);
        case "MB": return Math.round(num * 1024 * 1024);
        case "KB": return Math.round(num * 1024);
        default: return Math.round(num);
    }
}


async function migrateOldSizes() {
    if (!Array.isArray(allUserItems) || allUserItems.length === 0) return;

    const toUpdate = [];
    let changed = false;

    for (let it of allUserItems) {
        if (it.type === "file" && (it.sizeBytes === undefined || it.sizeBytes === null)) {
            const bytesFromSize = convertSizeStringToBytes(it.size);
            if (bytesFromSize > 0) {
                it.sizeBytes = bytesFromSize;
                changed = true;
            } else if (it.sizeBytes === undefined && typeof it.sizeBytes !== "number") {
                it.sizeBytes = null;
            }
        }
    }

    if (changed) {
        try {
            isMigrating = true;
            await updateItemsInFirestore(allUserItems);
            setTimeout(() => { isMigrating = false; }, 800);
        } catch (e) {
            console.warn("Migration write failed:", e);
            isMigrating = false;
        }
    }
}


/* Upload */

async function handleUploadFile(file) {
    const msg = getMsg();

    let fileName = file.name;
    if (existsInCurrentFolder(fileName)) {
        fileName = generateUniqueNameFor(allUserItems, fileName, currentPath);
    }

    const currentUsed = calculateTotalStorageUsed();
    const newFileSize = file.size; 

    if (currentUsed + newFileSize > FREE_STORAGE_BYTES) {
        showCustomAlert("You have reached your 20GB storage limit.\nSubscribe to get 100GB.");
        return;
    }

    msg.textContent = t("uploadMsg", fileName);
    msg.className = msgBlue();

    try {
        const storagePath = `users/${currentUserId}${currentPath}${fileName}`;
        const uploadRef = ref(storage, storagePath);

        const uploadTask = uploadBytesResumable(uploadRef, file);

        msg.textContent = `Uploading "${fileName}"... 0%`;
        msg.className = msgBlue();

        uploadTask.on("state_changed",
            (snapshot) => {
                const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                msg.textContent = `Uploading "${fileName}"... ${progress}%`;
            },
            (error) => {
                console.error("Upload error:", error);
                showCustomAlert("Upload failed.");
            },
            async () => {
                const url = await getDownloadURL(uploadTask.snapshot.ref);

                allUserItems.push({
                    type: "file",
                    name: fileName,
                    path: currentPath,
                    sizeBytes: file.size, 
                    date: Date.now(),
                    storagePath,
                    downloadURL: url,
                    uploaderEmail: auth && auth.currentUser ? auth.currentUser.email : null
                });

                await updateItemsInFirestore(allUserItems);

                msg.textContent = t("uploadedMsg", fileName);
                msg.className = msgGreen();

                updateStorageDisplay();
            }
        );
    } catch (err) {
        console.error("Upload catch error:", err);
        showCustomAlert("Upload failed.");
    }
}

/* Folder */
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

    msg.textContent = t("createFolderMsg", name);
    msg.className = msgGreen();

    updateStorageDisplay();
}

/* Download */
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

/* Delete */
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
            updateStorageDisplay();
        }
    );
}



/* Share */

window.shareItem = async function (name) {
    const item = allUserItems.find(i => i.name === name && i.path === currentPath && i.type === "file");
    if (!item) return showCustomAlert("File not found.");

    const email = prompt("Enter recipient's email:");
    if (!email) return;

    try {
        const q = query(collection(db, "users"), where("email", "==", email));
        const snaps = await getDocs(q);

        if (snaps.empty) {
            return showCustomAlert("User not found.");
        }

        const recipientDoc = snaps.docs[0];
        const recipientId = recipientDoc.id;
        const recipientData = recipientDoc.data();
        const recipientItems = Array.isArray(recipientData.items) ? [...recipientData.items] : [];

        let copyName = item.name;
        const existsInRecipient = (n) => recipientItems.some(i => i.name === n && i.path === "/");
        if (existsInRecipient(copyName)) {
            const [base, ext] = splitNameExt(copyName);
            let n = 1;
            let candidate = copyName;
            while (existsInRecipient(candidate)) {
                n++;
                candidate = makeNameWithSuffix(base, ext, n);
            }
            copyName = candidate;
        }

        const sizeBytesForRecipient = item.sizeBytes || convertSizeStringToBytes(item.size) || 0;

        const copyMeta = {
            type: "file",
            name: copyName,
            path: "/",
            size: item.size || "",
            sizeBytes: sizeBytesForRecipient,
            date: Date.now(),
            storagePath: item.storagePath,
            downloadURL: item.downloadURL,

            sharedBy: auth.currentUser ? auth.currentUser.email : "unknown",
            sharedAt: Date.now()
        };

        recipientItems.push(copyMeta);

        await setDoc(doc(db, "users", recipientId), { items: recipientItems }, { merge: true });

        showCustomAlert(`Shared "${item.name}" with ${email}.`);
    } catch (err) {
        console.error(err);
        showCustomAlert("Error while sharing file.");
    }
};


/* Rendering */

function renderApp(path = "/") {
    const app = document.getElementById("app");
    app.innerHTML = "";

    if (!currentUserId) return renderAuth(app, "login");

    currentPath = path;
    renderFileManager(app);
}

function renderFileManager(container) {

    const userEmail = auth.currentUser ? auth.currentUser.email : "";

    container.innerHTML = `
        <div id="file-manager-card">

            <!-- Top Bar -->
            <div class="mb-8 flex justify-between items-start">

                <div>
                    <h2 class="text-2xl font-semibold">
                        ${t("hello")} ${userEmail}!
                    </h2>

                    <p class="text-sm text-gray-600 dark:text-gray-300 mt-1" id="storageDisplay"></p>
                    <p class="text-xs text-red-500 cursor-pointer hover:underline"
                       onclick="alert('Subscription system coming soon!')">
                       ${t("upgrade")}
                    </p>
                </div>

                <!-- Settings Button + Dropdown -->
                <div class="relative">
                    <button 
                        onclick="toggleSettingsMenu()" 
                        class="text-gray-700 dark:text-gray-200 border px-3 py-2 rounded-lg 
                               hover:bg-gray-100 dark:hover:bg-gray-700 text-2xl leading-none">
                        ⚙️
                    </button>

                    <div id="settingsMenu" 
                        class="hidden absolute right-0 mt-2 bg-white dark:bg-gray-800 border 
                               rounded-lg p-4 shadow-lg w-56 z-50">

                        <label class="block mb-2 text-gray-900 dark:text-gray-200 font-semibold">
                            ${t("language")}
                        </label>

                        <select id="languageSelect" 
                            class="w-full mb-3 p-2 rounded border bg-white text-gray-900 
                                   dark:bg-gray-700 dark:text-white">
                        </select>

                        <button onclick="toggleDarkMode()" 
                            class="w-full text-left py-2 px-2 rounded hover:bg-gray-100 
                                   dark:hover:bg-gray-700 text-gray-900 dark:text-gray-200">
                            ${t("darkMode")}
                        </button>

                        <button onclick="handleLogout()" 
                            class="w-full text-left py-2 px-2 rounded text-red-600 
                                   hover:bg-red-100 dark:hover:bg-red-900">
                            ${t("logout")}
                        </button>

                    </div>
                </div>
            </div>

            ${renderBreadcrumbs()}
            ${renderActions()}
            ${renderItems()}

        </div>
    `;

    setTimeout(() => {
        const select = document.getElementById("languageSelect");
        if (select) {
            select.innerHTML = Object.keys(LANGUAGES)
                .map(code => `<option value="${code}">${code.toUpperCase()}</option>`)
                .join("");

            select.value = getLanguage();

            select.onchange = () => {
                setLanguage(select.value);
                renderApp(currentPath);
            };
        }

        updateStorageDisplay();
    }, 50);

    const uploadForm = document.getElementById("uploadForm");
    if (uploadForm) {
        uploadForm.onsubmit = (e) => {
            e.preventDefault();
            const file = document.getElementById("fileInput").files[0];
            if (file) handleUploadFile(file);
        };
    }

    const createForm = document.getElementById("createFolderForm");
    if (createForm) {
        createForm.onsubmit = (e) => {
            e.preventDefault();
            handleCreateFolder(e.target.folderName.value.trim());
            e.target.reset();
        };
    }
}


function renderBreadcrumbs() {
    const parts = currentPath.split("/").filter(Boolean);
    let path = "/";

    let crumbs = `<div class="mb-4 p-2 bg-white border rounded shadow-sm flex justify-between">
        <div class="text-sm">`;

    crumbs += `<a href="#" onclick="renderApp('/')">Home</a>`;

    for (let folder of parts) {
        path += folder + "/";
        crumbs += ` / <a href="#" onclick="renderApp('${path}')">${folder}</a>`;
    }

    crumbs += `</div>`;

    if (currentPath !== "/") {
        crumbs += `<button onclick="goUpDirectory()" class="text-indigo-600"> ← </button>`;
    }

    return crumbs + `</div>`;
}

function renderActions() {
    return `
        <div class="flex space-x-4 mb-8">
            <div class="card flex-1">
                <h3 class="text-lg mb-3">${t("createFolder")}</h3>
                <form id="createFolderForm" class="flex space-x-3">
                    <input name="folderName" class="input-field flex-grow" required>
                    <button class="btn-primary w-1/3">Create</button>
                </form>
            </div>

            <div class="card flex-1">
                <h3 class="text-lg mb-3">${t("uploadFile")}</h3>
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
        `<li class="py-4 text-center text-gray-500">${t("emptyFolder")}</li>`;

    return `
        <div class="card">
            <h3 class="text-xl mb-4">${t("filesFolders")} (${items.length})</h3>
            <ul>${list}</ul>
        </div>
    `;
}

function renderListItem(item) {
    const isFolder = item.type === "folder";
    const icon = isFolder ? "📁" : "📄";

    let displaySize = "";
    if (!isFolder) {
        if (item.sizeBytes || item.sizeBytes === 0) {
            displaySize = formatFileSize(item.sizeBytes);
        } else if (item.size) {
            displaySize = item.size;
        }
    }

    const dateStr = item.date ? (new Date(item.date)).toLocaleString() : "";
    let ownerInfo = "Uploaded by you";

    if (item.sharedBy) {
        ownerInfo = `Shared by ${item.sharedBy}`;
    } else if (item.uploaderEmail && item.uploaderEmail !== (auth && auth.currentUser ? auth.currentUser.email : null)) {
        ownerInfo = `Uploaded by ${item.uploaderEmail}`;
    }

    const tooltip = `Size: ${displaySize || "—"}\n${ownerInfo}\nUploaded: ${dateStr}\nPath: ${item.path}`;

    return `
        <li class="flex justify-between py-3 border-b cursor-pointer file-item"
            title="${escapeHtml(tooltip)}"
            onclick="${isFolder
                ? `renderApp('${currentPath}${item.name}/')`
                : `downloadFile('${item.name}')`}">

            <div>
                ${icon} ${item.name}
                <div class="text-xs text-gray-500">
                    ${isFolder ? "Folder" : displaySize}
                </div>
            </div>

            <div class="space-x-3">
${
    isFolder
        ? `<button onclick="event.stopPropagation(); window.shareFolder('${item.name}')" class="text-indigo-600">${t("share")}</button>`
        : `<button onclick="event.stopPropagation(); window.shareItem('${item.name}')" class="text-indigo-600">${t("share")}</button>`
}
                <button onclick="event.stopPropagation(); window.renameItem('${item.name}')" class="text-yellow-600">${t("rename")}</button>
                <button onclick="event.stopPropagation(); handleDeleteFile('${item.name}', ${isFolder})"
                    class="text-red-600">${t("delete")}</button>
            </div>
        </li>
    `;
}

/* Share Folder */
window.shareFolder = async function (folderName) {

    const basePath = currentPath + folderName + "/";

    const email = prompt(`Share folder "${folderName}" with:\nEnter email:`);

    if (!email) return;

    try {
        const q = query(collection(db, "users"), where("email", "==", email));
        const snaps = await getDocs(q);

        if (snaps.empty) return showCustomAlert("User not found.");

        const recipientDoc = snaps.docs[0];
        const recipientId = recipientDoc.id;
        const recipientData = recipientDoc.data();
        const recipientItems = Array.isArray(recipientData.items) ? [...recipientData.items] : [];

        const itemsToCopy = allUserItems.filter(i =>
            (i.path + i.name + (i.type === "folder" ? "/" : "")).startsWith(basePath)
        );

        let uniqueRoot = folderName;
        const existsInRecipientRoot = (n) =>
            recipientItems.some(i => i.name === n && i.path === "/");

        if (existsInRecipientRoot(uniqueRoot)) {
            const [b, e] = splitNameExt(uniqueRoot);
            let n = 1;
            let candidate = uniqueRoot;
            while (existsInRecipientRoot(candidate)) {
                n++;
                candidate = `${b} (${n})`;
            }
            uniqueRoot = candidate;
        }

        for (let item of itemsToCopy) {
            const itemFull = item.path + item.name + (item.type === "folder" ? "/" : "");

            let relative = itemFull.substring(basePath.length);

            if (relative === "") {
                relative = item.name + "/";
            }

            let relativeFolderPath = relative.split("/").slice(0, -1).join("/");

            let newPath = "/";
            if (relativeFolderPath.trim() !== "") {
                newPath = `/${uniqueRoot}/${relativeFolderPath}/`;
            } else {
                newPath = `/${uniqueRoot}/`;
            }

            let newName = item.name;

            if (item.type === "file") {
                let conflict = recipientItems.some(x => x.name === newName && x.path === newPath);
                if (conflict) {
                    const [b, e] = splitNameExt(newName);
                    let n = 1;
                    let candidate = newName;
                    while (recipientItems.some(x => x.name === candidate && x.path === newPath)) {
                        n++;
                        candidate = `${b} (${n})${e}`;
                    }
                    newName = candidate;
                }
            }

            recipientItems.push({
                type: item.type,
                name: newName,
                path: newPath,
                size: item.size || "",
                sizeBytes: item.sizeBytes || convertSizeStringToBytes(item.size) || null,
                date: Date.now(),
                storagePath: item.storagePath || null,
                downloadURL: item.downloadURL || null,
                ...(item.type === "file" ? {
                    sharedBy: auth.currentUser ? auth.currentUser.email : "unknown",
                    sharedAt: Date.now()
                } : {})
            });
        }

        await setDoc(doc(db, "users", recipientId), { items: recipientItems }, { merge: true });

        showCustomAlert(`Successfully shared folder "${folderName}" to ${email}.`);

    } catch (err) {
        console.error(err);
        showCustomAlert("Error sharing folder.");
    }
};

function escapeHtml(str = "") {
    return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
                    size: item.size || "",
                    sizeBytes: item.sizeBytes || (item.size ? convertSizeStringToBytes(item.size) : null)
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

/* Rename */
window.renameItem = async function (oldName) {
    const newName = prompt("Enter new name:", oldName);
    if (!newName || !newName.trim()) return;
    const trimmed = newName.trim();

    if (existsInCurrentFolder(trimmed)) {
        return showCustomAlert(`An item named "${trimmed}" already exists here.`);
    }

    let updated = false;
    allUserItems = allUserItems.map(i => {
        if (i.path === currentPath && i.name === oldName) {
            updated = true;
            return { ...i, name: trimmed, date: Date.now() };
        }
        return i;
    });

    if (!updated) return showCustomAlert("Item not found.");

    await updateItemsInFirestore(allUserItems);
};

/* Alerts */
function showCustomAlert(msg) {
    alert(msg);
}

function showCustomConfirm(msg, onConfirm) {
    if (confirm(msg)) onConfirm();
}


/* 5 minute timer */

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


/* Upload */
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
    if (btn) {
        btn.disabled = false;
        btn.textContent = text;
    }
}

function calculateTotalStorageUsed() {
    let total = 0;

    allUserItems.forEach(item => {
        if (item.type === "file") {
            if (typeof item.sizeBytes === "number") {
                total += item.sizeBytes;
            } else if (item.size) {
                total += convertSizeStringToBytes(item.size);
            }
        }
    });

    return total;
}


function formatFileSize(bytes) {
    if (bytes === null || bytes === undefined) return "";
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024*1024*1024)).toFixed(2) + " GB";
    if (bytes >= 1024 * 1024) return (bytes / (1024*1024)).toFixed(2) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + " KB";
    return bytes + " B";
}

function updateStorageDisplay() {
    const el = document.getElementById("storageDisplay");
    if (!el) return;

    const usedBytes = calculateTotalStorageUsed();
    const usedGB = (usedBytes / (1024*1024*1024)).toFixed(2);
    const maxGB = (FREE_STORAGE_BYTES / (1024*1024*1024)).toFixed(0);

    el.textContent = `${t("storageused")} ${usedGB} GB / ${maxGB} GB`;
}

/* Dark Mode */

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

/* Settings */
window.toggleSettingsMenu = function () {
    const menu = document.getElementById("settingsMenu");
    if (menu) menu.classList.toggle("hidden");
};

document.addEventListener("click", (e) => {
    const menu = document.getElementById("settingsMenu");
    if (!menu) return;

    if (!menu.contains(e.target) &&
        !e.target.matches("button[onclick=\"toggleSettingsMenu()\"]")) {
        menu.classList.add("hidden");
    }
});

window.handleLogout = handleLogout;
window.handleDeleteFile = handleDeleteFile;
window.downloadFile = downloadFile;
window.renderApp = renderApp;

/* Startup */
onAuthStateChanged(auth, async (user) => {
    currentUserId = user ? user.uid : null;
    if (user) {
        try {
            await setDoc(doc(db, "users", user.uid), { email: user.email }, { merge: true });
        } catch (e) {
            console.warn("Could not set user email in Firestore:", e);
        }
        setupItemsSnapshot();
    }
    if (user) {
        previousItems = [];
        lastChecked = Number(localStorage.getItem("lastChecked")) || 0;
    }
    renderApp("/");
});
