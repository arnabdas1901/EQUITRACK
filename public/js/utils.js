export const BACKEND_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:3000' 
    : window.location.origin;

export function setupTabs(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const tabs = container.querySelectorAll('.tab-btn');
    const panes = container.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const targetPane = container.querySelector('#' + tab.dataset.tab);
            if (targetPane) targetPane.classList.add('active');
        });
    });
}

export async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 8000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, {
        ...options,
        signal: controller.signal  
    });
    clearTimeout(id);
    return response;
}

export async function safeJsonParse(response) {
    try {
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    } catch (e) {
        return { error: 'Invalid server response' };
    }
}

export function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function formatLargeCurrency(value) {
    if (value == null || isNaN(value)) return 'N/A';
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
}

export function showToast(message) {
    const toast = document.getElementById('global-toast-notification');
    if (!toast) return;
    toast.innerText = message;
    toast.classList.remove('hidden-toast');
    setTimeout(() => { toast.classList.add('hidden-toast'); }, 3000);
}
