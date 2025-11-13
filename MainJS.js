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
    getDoc,
    onSnapshot,
    setLogLevel
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

let currentPath = '/';
let app, auth, db, storage;
let currentUserId = null;
let userItemsUnsubscribe = null;
let allUserItems = [];

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    setLogLevel('Debug');
    setupAuthListener();
} catch (e) {
    console.error("Error initializing Firebase:", e);
    document.getElementById('app').innerHTML = `<h1 class="text-4xl font-bold text-center text-gray-800 mb-8">File Management System</h1><p class="text-center text-red-600">Error: Could not connect to Firebase. Did you paste your config object correctly?</p>`;
}

function showCustomConfirm(message, onConfirm, title = "Confirm Action") {
    const modalOverlay = document.getElementById('custom-modal-overlay');
    const modalTitle = document.getElementById('custom-modal-title');
    const modalMessage = document.getElementById('custom-modal-message');
    const confirmButtons = document.getElementById('custom-modal-buttons');
    const alertButtons = document.getElementById('custom-modal-alert-buttons');
    const confirmBtn = document.getElementById('custom-modal-confirm');
    const cancelBtn = document.getElementById('custom-modal-cancel');
    if (!modalOverlay || !modalTitle || !modalMessage || !confirmButtons || !alertButtons || !confirmBtn || !cancelBtn) { console.error("Modal elements not found!"); return; }
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    confirmButtons.classList.remove('hidden');
    alertButtons.classList.add('hidden');
    confirmBtn.onclick = () => { onConfirm(); hideCustomModal(); };
    cancelBtn.onclick = hideCustomModal;
    modalOverlay.classList.remove('hidden');
}

function showCustomAlert(message, title = "Alert") {
    const modalOverlay = document.getElementById('custom-modal-overlay');
    const modalTitle = document.getElementById('custom-modal-title');
    const modalMessage = document.getElementById('custom-modal-message');
    const confirmButtons = document.getElementById('custom-modal-buttons');
    const alertButtons = document.getElementById('custom-modal-alert-buttons');
    const okBtn = document.getElementById('custom-modal-ok');
    if (!modalOverlay || !modalTitle || !modalMessage || !confirmButtons || !alertButtons || !okBtn) { console.error("Modal elements not found!"); return; }
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    confirmButtons.classList.add('hidden');
    alertButtons.classList.remove('hidden');
    okBtn.onclick = hideCustomModal;
    modalOverlay.classList.remove('hidden');
}

function hideCustomModal() {
    const modalOverlay = document.getElementById('custom-modal-overlay');
    if (modalOverlay) { modalOverlay.classList.add('hidden'); }
    else { console.error("Modal overlay not found in hideCustomModal!"); }
}

let inactivityTimer;
const LOGOUT_TIME_MS = 5 * 60 * 1000; 
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        if (currentUserId) handleLogout(true);
    }, LOGOUT_TIME_MS);
}
function setupActivityListeners() {
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keypress', resetInactivityTimer);
    window.addEventListener('scroll', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);
}

function setupAuthListener() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserId = user.uid;
            currentPath = '/';
            allUserItems = [];
            setupItemsSnapshot();
            renderApp('/');
            setupActivityListeners();
        } else {
            currentUserId = null;
            currentPath = '/';
            allUserItems = [];
            if (userItemsUnsubscribe) {
                userItemsUnsubscribe();
                userItemsUnsubscribe = null;
            }
            renderApp();
            clearTimeout(inactivityTimer);
        }
    });
}

function setupItemsSnapshot() {
    if (userItemsUnsubscribe) userItemsUnsubscribe();
    const userDocRef = doc(db, "users", currentUserId);
    userItemsUnsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            allUserItems = docSnap.data().items || [];
        } else {
            allUserItems = [];
        }
        if (document.getElementById('file-manager-card')) renderApp(currentPath);
    }, (error) => {
        console.error("Error listening to file changes: ", error);
        showCustomAlert("Error: Could not load files from database.", "Connection Error");
    });
}

function renderApp(path = currentPath) {
    const appContainer = document.getElementById('app');
    appContainer.innerHTML = ``;
    if (currentUserId) {
        currentPath = path;
        renderFileManager(appContainer);
        resetInactivityTimer();
    } else {
        currentPath = '/';
        renderAuth(appContainer, 'login');
        clearTimeout(inactivityTimer);
    }
}

let currentAuthView = 'login';

function renderAuth(container, view, message = '', isError = false) {
    currentAuthView = view;
    const isLogin = view === 'login';
    const authHtml = `
        <div id="auth-card" class="card w-full max-w-md mx-auto mt-10">
            <h2 class="text-2xl font-semibold mb-6 text-center text-indigo-600">${isLogin ? 'Welcome Back!' : 'Create Account'}</h2>
            <div id="message" class="mb-4 text-sm text-center ${isError ? 'text-red-600' : 'text-green-600'}">${message}</div>
            <form id="${view}Form" class="space-y-4">
                <div>
                    <label for="auth-email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" id="auth-email" name="email" class="input-field" required>
                </div>
                <div>
                    <label for="auth-password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input type="password" id="auth-password" name="password" class="input-field" minlength="6" required>
                </div>
                <button type="submit" id="auth-submit-btn" class="btn-primary w-full">${isLogin ? 'Login' : 'Sign Up'}</button>
            </form>
            <p class="mt-4 text-center text-sm text-gray-600">
                ${isLogin ? "Don't have an account? " : "Already have an account? "}
                <a href="#" onclick="switchAuthView()" class="text-indigo-600 hover:text-indigo-800 font-medium">
                    ${isLogin ? 'Sign Up' : 'Login'}
                </a>
            </p>
        </div>
    `;
    container.innerHTML += authHtml;
    document.getElementById(`${view}Form`).addEventListener('submit', (e) => {
        e.preventDefault();
        const email = e.target.email.value;
        const password = e.target.password.value;
        const btn = document.getElementById('auth-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Processing...';
        if (isLogin) handleLogin(email, password);
        else handleSignup(email, password);
    });
}

window.switchAuthView = function() {
    const appContainer = document.getElementById('app');
    const existingCard = document.getElementById('auth-card');
    if (existingCard) existingCard.remove();
    renderAuth(appContainer, currentAuthView === 'login' ? 'signup' : 'login');
    return false;
}

async function handleSignup(email, password) {
    const messageElement = document.getElementById('message');
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await setDoc(doc(db, "users", user.uid), { items: [] });
        messageElement.className = 'mb-4 text-sm text-center text-green-600';
        messageElement.textContent = 'Success! Account created. Logging you in...';
    } catch (error) {
        console.error("Signup error:", error);
        messageElement.className = 'mb-4 text-sm text-center text-red-600';
        messageElement.textContent = `Error: ${error.message}`;
        const btn = document.getElementById('auth-submit-btn');
        btn.disabled = false;
        btn.textContent = 'Sign Up';
    }
}

async function handleLogin(email, password) {
    const messageElement = document.getElementById('message');
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Login error:", error);
        messageElement.className = 'mb-4 text-sm text-center text-red-600';
        messageElement.textContent = `Error: ${error.message}`;
        const btn = document.getElementById('auth-submit-btn');
        btn.disabled = false;
        btn.textContent = 'Login';
    }
}

async function handleLogout(fromInactivity = false) {
    try {
        await signOut(auth);
        setTimeout(() => {
            const messageElement = document.getElementById('message');
            if (messageElement) {
                messageElement.className = 'mb-4 text-sm text-center text-green-600';
                messageElement.textContent = fromInactivity ? 'Logged out due to inactivity.' : 'You have been logged out.';
            }
        }, 100);
    } catch (error) {
        console.error("Logout error:", error);
        showCustomAlert(`Error logging out: ${error.message}`, "Logout Error");
    }
}

function renderFileManager(container) {
    const userEmail = auth.currentUser ? auth.currentUser.email : "User";
    const userItems = allUserItems || [];
    const uniqueItems = [];
    const names = new Set();

    userItems.forEach(item => {
        let fullPath = item.path + item.name + (item.type === 'folder' ? '/' : '');
        if (item.type === 'folder') fullPath = item.path + item.name + '/';
        if (fullPath.startsWith(currentPath)) {
            let fragment = fullPath.substring(currentPath.length);
            if (fragment.endsWith('/')) fragment = fragment.slice(0, -1);
            const firstSlashIndex = fragment.indexOf('/');
            let name = (firstSlashIndex === -1) ? fragment : fragment.substring(0, firstSlashIndex);
            if (name && !names.has(name)) {
                names.add(name);
                uniqueItems.push({
                    type: (firstSlashIndex === -1 && item.type === 'file') ? 'file' : 'folder',
                    name: name,
                    size: item.type === 'file' ? item.size : '',
                    date: item.type === 'file' ? item.date : ''
                });
            }
        }
    });

    uniqueItems.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
    });

    const folderIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-yellow-500" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>`;
    const fileIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`;

    window.renderApp = renderApp; 

    const getBreadcrumbs = () => {
        const parts = currentPath.split('/').filter(p => p.length > 0);
        let path = '/';
        let breadcrumbs = `<a href="#" onclick="window.renderApp('/')" class="text-indigo-600 hover:text-indigo-800 transition">Main</a>`;
        parts.forEach(part => {
            path += part + '/';
            breadcrumbs += `<span class="mx-2 text-gray-400">/</span><a href="#" onclick="window.renderApp('${path}')" class="text-indigo-600 hover:text-indigo-800 transition">${part}</a>`;
        });
        return breadcrumbs;
    };

    const fileListHtml = uniqueItems.map(item => {
        const isFolder = item.type === 'folder';
        const icon = isFolder ? folderIcon : fileIcon;
        const clickAction = isFolder ? `window.renderApp('${currentPath + item.name}/')` : `window.downloadFile('${item.name}')`;
        return `
            <li class="file-item flex justify-between items-center py-3 border-b border-gray-200" onclick="${clickAction}">
                <div class="flex items-center space-x-3">
                    ${icon}
                    <div>
                        <p class="font-medium ${isFolder ? 'text-blue-700' : 'text-gray-800'}">${item.name}</p>
                        <span class="text-xs text-gray-500">${isFolder ? 'Folder' : `${item.size} - ${new Date(item.date).toLocaleDateString()}`}</span>
                    </div>
                </div>
                <div class="space-x-2">
                    ${!isFolder ? 
                        `<button onclick="event.stopPropagation(); window.downloadFile('${item.name}')" class="text-sm text-indigo-600 hover:text-indigo-800 transition">Download</button>
                         <button onclick="event.stopPropagation(); window.handleDeleteFile('${item.name}', false)" class="text-sm text-red-600 hover:text-red-800 transition">Delete</button>` :
                        `<button onclick="event.stopPropagation(); window.handleDeleteFile('${item.name}', true)" class="text-sm text-red-600 hover:text-red-800 transition">Delete Folder</button>`
                    }
                </div>
            </li>
        `;
    }).join('');

    window.goUpDirectory = () => {
        if (currentPath === '/') return;
        let path = currentPath.slice(0, -1);
        const lastSlash = path.lastIndexOf('/');
        const parentPath = path.substring(0, lastSlash + 1);
        renderApp(parentPath || '/');
    }

    window.handleLogout = handleLogout;
    window.handleDeleteFile = handleDeleteFile;
    window.downloadFile = downloadFile; 

    const managerHtml = `
        <div id="file-manager-card">
            <div class="mb-8 flex justify-between items-center">
                <h2 class="text-2xl font-semibold text-gray-800 truncate" title="${userEmail}">Hello, ${userEmail}!</h2>
                <button onclick="window.handleLogout(false)" class="text-sm text-red-500 hover:text-red-700 font-medium py-1 px-3 border border-red-300 rounded-lg">Logout</button>
            </div>
            <div class="mb-4 p-3 bg-white rounded-lg border border-gray-200 flex items-center justify-between shadow-sm">
                <div class="text-sm font-medium text-gray-600">${getBreadcrumbs()}</div>
                ${currentPath !== '/' ? 
                    `<button onclick="window.goUpDirectory()" class="text-indigo-600 hover:text-indigo-800 transition text-sm flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Up
                    </button>` : ''
                }
            </div>
            <div class="flex space-x-4 mb-8">
                <div class="card flex-1">
                    <h3 class="text-lg font-medium mb-3 text-gray-700">Create Folder</h3>
                    <form id="createFolderForm" class="flex space-x-3">
                        <input type="text" id="folderName" name="folderName" placeholder="New Folder Name" class="input-field flex-grow" required>
                        <button type="submit" class="btn-primary w-1/3">Create</button>
                    </form>
                </div>
                <div class="card flex-1">
                    <h3 class="text-lg font-medium mb-3 text-gray-700">Upload File</h3>
                    <form id="uploadForm" class="flex space-x-3">
                        <input type="file" id="fileInput" name="fileToUpload" class="input-field flex-grow cursor-pointer p-2 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" required>
                        <button type="submit" class="btn-primary w-1/3">Upload</button>
                    </form>
                </div>
            </div>
            <p id="message" class="mb-4 text-sm text-center"></p>
            <div class="card">
                <h3 class="text-xl font-medium mb-4 text-gray-700">Items in ${currentPath === '/' ? 'Main' : currentPath.substring(currentPath.lastIndexOf('/', currentPath.length - 2) + 1).slice(0, -1)} (${uniqueItems.length})</h3>
                <ul class="divide-y divide-gray-200">
                    ${uniqueItems.length > 0 ? fileListHtml : '<li class="py-4 text-center text-gray-500">This folder is empty.</li>'}
                </ul>
            </div>
        </div>
    `;

    container.innerHTML += managerHtml;

    document.getElementById('uploadForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('fileInput');
        if (fileInput.files.length > 0) handleUploadFile(fileInput.files[0]);
    });

    document.getElementById('createFolderForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const folderName = e.target.folderName.value.trim();
        if (folderName) handleCreateFolder(folderName, e.target);
    });
}

async function updateItemsInFirestore(newItemsArray) {
    if (!currentUserId) return;
    try {
        const userDocRef = doc(db, "users", currentUserId);
        await setDoc(userDocRef, { items: newItemsArray });
    } catch (error) {
        console.error("Error updating items in Firestore: ", error);
        showCustomAlert("Error: Could not save changes to the database.", "Save Error");
    }
}

async function handleCreateFolder(folderName, formElement) {
    const messageElement = document.getElementById('message');
    const newFolderName = folderName.replace(/[^a-zA-Z0-9\s-_.]/g, '').trim();
    const newFolderPath = currentPath + newFolderName + '/';
    const isDuplicate = allUserItems.some(item => (item.path + item.name + (item.type === 'folder' ? '/' : '')) === newFolderPath);
    if (isDuplicate) {
        showCustomAlert(`Error: An item named "${newFolderName}" already exists here.`, 'Create Error');
        return;
    }
    const newFolderItem = { type: 'folder', name: newFolderName, path: currentPath, date: new Date().getTime() };
    const newItemsArray = [...allUserItems, newFolderItem];
    await updateItemsInFirestore(newItemsArray);
    messageElement.className = 'mb-4 text-sm text-center text-green-600';
    messageElement.textContent = `Success! Folder "${newFolderName}" created.`;
    formElement.reset();
}

async function handleUploadFile(file) {
    const messageElement = document.getElementById('message');
    const isDuplicate = allUserItems.some(item => item.type === 'file' && item.path === currentPath && item.name === file.name);
    if (isDuplicate) {
        showCustomAlert(`Error: File named "${file.name}" already exists here.`, 'Upload Error');
        return;
    }
    messageElement.className = 'mt-3 text-sm text-blue-600';
    messageElement.textContent = `Uploading "${file.name}"...`;
    document.getElementById('uploadForm').reset();
    try {
        const storagePath = `users/${currentUserId}${currentPath}${file.name}`;
        const storageRef = ref(storage, storagePath);
        const uploadResult = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(uploadResult.ref);
        const newFile = {
            type: 'file',
            name: file.name,
            path: currentPath,
            size: (file.size / 1024).toFixed(2) + ' KB',
            date: new Date().getTime(),
            storagePath: storagePath,
            downloadURL: downloadURL
        };
        const newItemsArray = [...allUserItems, newFile];
        await updateItemsInFirestore(newItemsArray);
        messageElement.className = 'mt-3 text-sm text-green-600';
        messageElement.textContent = `Success! File "${file.name}" was uploaded.`;
    } catch (error) {
        console.error("Upload Error:", error);
        showCustomAlert(`Error: Could not upload file. ${error.message}`, 'Upload Error');
        messageElement.textContent = '';
    }
}

function handleDeleteFile(itemName, isFolder) {
    const message = `Are you sure you want to delete ${isFolder ? 'the folder and all its contents' : 'the file'} named "${itemName}"?`;
    showCustomConfirm(message, async () => {
        const fullItemPath = currentPath + itemName + (isFolder ? '/' : '');
        let newItemsArray;
        let filesToDelete = [];
        if (!isFolder) {
            const fileToDelete = allUserItems.find(item => item.type === 'file' && item.name === itemName && item.path === currentPath);
            if (fileToDelete && fileToDelete.storagePath) filesToDelete.push(fileToDelete.storagePath);
            newItemsArray = allUserItems.filter(item => !(item.type === 'file' && item.name === itemName && item.path === currentPath));
        } else {
            allUserItems.forEach(item => {
                if (item.type === 'file' && (item.path).startsWith(fullItemPath)) {
                    if (item.storagePath) filesToDelete.push(item.storagePath);
                }
            });
            newItemsArray = allUserItems.filter(item => !((item.path + item.name + '/') === fullItemPath || (item.path).startsWith(fullItemPath)));
        }
        const deletePromises = filesToDelete.map(storagePath => {
            const fileRef = ref(storage, storagePath);
            return deleteObject(fileRef).catch(err => console.warn("Failed to delete", storagePath, err));
        });
        try {
            await Promise.all(deletePromises);
        } catch (error) {
            console.error("Error during file deletion: ", error);
            showCustomAlert("Warning: Some files might not have been deleted from storage.", "Delete Error");
        }
        await updateItemsInFirestore(newItemsArray);
    }, 'Delete Confirmation');
}

async function downloadFile(fileName) {
    const fileToDownload = allUserItems.find(item => item.type === 'file' && item.name === fileName && item.path === currentPath);
    if (!fileToDownload || !fileToDownload.downloadURL) {
        showCustomAlert(`Error: Could not find file data for "${fileName}".`, 'Download Error');
        return;
    }
    try {
        const response = await fetch(fileToDownload.downloadURL);
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error("Download error:", error);
        showCustomAlert("Error downloading file. Please try again.", "Download Error");
    }
}

window.renderApp = renderApp;
window.goUpDirectory = () => { if (currentPath === '/') return; let path = currentPath.slice(0, -1); const lastSlash = path.lastIndexOf('/'); const parentPath = path.substring(0, lastSlash + 1); renderApp(parentPath || '/'); };
window.handleLogout = handleLogout;
window.handleDeleteFile = handleDeleteFile;
window.downloadFile = downloadFile;

