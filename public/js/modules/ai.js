import { BACKEND_URL, fetchWithTimeout, safeJsonParse, showToast, escapeHtml } from '../utils.js';

let isAiRunning = false;

function formatAiOutput(text) {
    if (!text) return '';
    // Escape HTML first for safety
    let safe = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    // Convert **bold** to <strong>
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Convert bullet points (lines starting with -, •, or *)
    safe = safe.replace(/^[\-•*]\s+(.+)$/gm, '<span class="terminal-bullet">• $1</span>');
    // Convert headings (#, ##, ###, etc.)
    safe = safe.replace(/^#{1,4}\s+(.+)$/gm, '<strong class="terminal-heading">$1</strong>');
    // Convert double newlines to paragraph breaks, single to <br>
    safe = safe.replace(/\n\n/g, '</p><p>');
    safe = safe.replace(/\n/g, '<br>');
    return '<p>' + safe + '</p>';
}

export function setupAiAdvisor() {
    const btn = document.getElementById('execute-ai-btn');
    const input = document.getElementById('ai-ticker-input');
    if (!btn) return;

    btn.addEventListener('click', executeAiAnalysis);
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') executeAiAnalysis();
        });
    }
    
    const pdfBtn = document.getElementById('ai-pdf-btn');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', exportAiPdf);
    }
}

async function executeAiAnalysis() {
    if (isAiRunning) return;

    const tickerInput = document.getElementById('ai-ticker-input');
    const frameSelect = document.getElementById('ai-model-select');
    const output = document.getElementById('ai-terminal-output');
    const btn = document.getElementById('execute-ai-btn');

    const ticker = tickerInput?.value.trim().toUpperCase();
    const frame = frameSelect?.value || 'dupont';

    if (!ticker) {
        showToast('Enter a ticker symbol for AI analysis.');
        return;
    }

    isAiRunning = true;
    if (btn) btn.disabled = true;
    
    const pdfBtn = document.getElementById('ai-pdf-btn');
    if (pdfBtn) pdfBtn.style.display = 'none';

    const frameLabel = frameSelect?.selectedOptions?.[0]?.textContent || frame;
    if (output) {
        output.innerHTML = `<span class="terminal-prompt terminal-accent">&gt; Running ${escapeHtml(frameLabel)} on ${escapeHtml(ticker)}…</span>`;
    }

    try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/api/ai/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker, frame }),
            timeout: 90000,
        });

        const data = await safeJsonParse(response);

        if (!response.ok) {
            throw new Error(data?.error || 'AI analysis failed.');
        }

        if (output) {
            const providerNote = data.provider
                ? ` [${escapeHtml(data.provider)}${data.model ? ` / ${escapeHtml(data.model)}` : ''}]`
                : '';
            output.innerHTML = `
                <span class="terminal-prompt terminal-success">&gt; Scan complete: ${escapeHtml(ticker)} — ${escapeHtml(frameLabel)}${providerNote}</span>
                <div class="ai-analysis-text">${formatAiOutput(data.analysis)}</div>
                <span class="terminal-prompt terminal-warn">&gt; Educational use only. Not financial advice.</span>
            `;
        }
        
        if (pdfBtn) pdfBtn.style.display = 'inline-flex';
        
        showToast(`AI analysis ready for ${ticker}.`);
    } catch (error) {
        console.error(error);
        const message =
            error.name === 'AbortError'
                ? 'AI request timed out. Try again in a moment.'
                : error.message || 'AI analysis failed.';
        if (output) {
            output.innerHTML = `<span class="terminal-prompt terminal-warn">&gt; ${escapeHtml(message)}</span>`;
        }
        showToast(message);
    } finally {
        isAiRunning = false;
        if (btn) btn.disabled = false;
    }
}

async function exportAiPdf() {
    if (!window.html2pdf) {
        import('../utils.js').then(({ showToast }) => showToast('PDF library is still loading...'));
        return;
    }
    const element = document.getElementById('dashboard-ai');
    const tickerInput = document.getElementById('ai-ticker-input');
    const ticker = tickerInput?.value.trim().toUpperCase() || 'Report';
    const opt = {
        margin:       10,
        filename:     `STRATA_AI_Analysis_${ticker}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    const btn = document.getElementById('ai-pdf-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating PDF...';
    
    try {
        await window.html2pdf().set(opt).from(element).save();
    } catch (err) {
        console.error("PDF generation failed:", err);
    } finally {
        btn.innerHTML = originalText;
    }
}
