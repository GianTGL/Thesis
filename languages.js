export const LANGUAGES = {
    en: {
        hello: "Hello",
        createFolder: "Create Folder",
        uploadFile: "Upload File",
        filesFolders: "Files & Folders",
        emptyFolder: "Empty folder.",
        darkMode: "🌙 Dark Mode / ☀️ Light Mode",
        logout: "Logout",
        language: "Language",
        storageused: "Storaged Used : ",
        upgrade: "Upgrade to 100GB",
        share: "Share",
        rename: "Rename",
        delete: "Delete",
        uploadMsg: name => `Uploading "${name}"...`,
        uploadedMsg: name => `Uploaded "${name}".`,
        createFolderMsg: name => `Folder "${name}" created successfully.`,
    },

    fil: {
        hello: "Kamusta",
        createFolder: "Gumawa ng Folder",
        uploadFile: "Mag-upload ng File",
        filesFolders: "Mga File at Folder",
        emptyFolder: "Walang laman na folder.",
        darkMode: "🌙 Madilim na Tema / ☀️ Maliwanag na Tema",
        logout: "Mag-logout",
        language: "Wika",
        storageused: "Imbakan na Ginamit",
        upgrade: "Mag-upgrade sa 100GB",
        share: "Ibahagi",
        rename: "Palitan ang pangalan",
        delete: "Tanggalin",
        uploadMsg: name => `Ina-upload ang "${name}"...`,
        uploadedMsg: name => `Na-upload ang "${name}".`,
        createFolderMsg: name => `Matagumpay na nagawa ang folder "${name}".`,
    }
};

export function setLanguage(lang) {
    localStorage.setItem("appLanguage", lang);
}

export function getLanguage() {
    return localStorage.getItem("appLanguage") || "en";
}

export function t(key, param) {
    const lang = getLanguage();
    const pack = LANGUAGES[lang];

    if (!pack) return key; 
    if (typeof pack[key] === "function") return pack[key](param);
    return pack[key] || key;
}
