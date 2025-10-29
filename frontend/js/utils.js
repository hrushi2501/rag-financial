// frontend/js/utils.js

/**
 * Utility functions for Financial RAG Chatbot frontend.
 * General helpers for UI, formatting, error display, localStorage, etc.
 */

// Show a toast message (temporary popup)
function showToast(message, type = 'info', duration = 3000) {
    const styles = {
        info: "bg-gray-800 text-white",
        success: "bg-green-600 text-white",
        error: "bg-red-700 text-white"
    };
    const toast = document.createElement("div");
    toast.className = `fixed bottom-6 right-6 px-5 py-3 rounded shadow-lg z-50 ${styles[type]}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, duration);
}

// Format text with markdown (simple subset)
function markdownToHtml(text) {
    return text
        .replace(/([*_]{2}|__)(.*?)\1/g, '<b>$2</b>')                // bold
        .replace(/([*_])(.*?)\1/g, '<i>$2</i>')                      // italic
        .replace(/`([^`]+)`/g, '<code>$1</code>')                    // inline code
        .replace(/\n/g, '<br />');
}

// Save/load theme preference
function saveTheme(theme) {
    localStorage.setItem('theme', theme);
}
function loadTheme() {
    return localStorage.getItem('theme') || 'dark';
}

// Debounce
function debounce(fn, delay = 300) {
    let timeoutId;
    return (...args) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

// Scroll to bottom of chat panel
function scrollToBottom(panelId = 'chatPanel') {
    const panel = document.getElementById(panelId);
    if (panel) panel.scrollTop = panel.scrollHeight;
}

// Export utils
export { showToast, markdownToHtml, saveTheme, loadTheme, debounce, scrollToBottom };
