// notifications.js

export function showShareNotification(fileName, fromEmail) {
    const box = document.createElement("div");

    box.style.position = "fixed";
    box.style.top = "20px";
    box.style.right = "20px";
    box.style.background = "#4f46e5";
    box.style.color = "white";
    box.style.padding = "14px 20px";
    box.style.borderRadius = "10px";
    box.style.fontSize = "14px";
    box.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    box.style.zIndex = "99999";
    box.style.opacity = "0";
    box.style.transition = "opacity 0.3s ease";

    box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <span>${fromEmail} shared "${fileName}" with you.</span>
            <button id="closeNotifBtn" style="
                background: rgba(255,255,255,0.2);
                border:none;
                color:white;
                font-size:14px;
                padding:4px 8px;
                border-radius:6px;
                cursor:pointer;
            ">X</button>
        </div>
    `;

    document.body.appendChild(box);

    setTimeout(() => { box.style.opacity = "1"; }, 20);

    // Close when pressing X
    box.querySelector("#closeNotifBtn").onclick = () => {
        box.style.opacity = "0";
        setTimeout(() => box.remove(), 300);
    };

    // Auto disappear after 5 seconds
    setTimeout(() => {
        box.style.opacity = "0";
        setTimeout(() => box.remove(), 300);
    }, 5000);
}
