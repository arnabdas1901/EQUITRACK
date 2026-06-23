import { BACKEND_URL, fetchWithTimeout, safeJsonParse, formatLargeCurrency } from '../utils.js';

let commoditiesData = [];

export function initCommoditiesDashboard() {
    setupUIListeners();
    loadCommodityDashboard();
}

function setupUIListeners() {
    const backBtn = document.getElementById('commodity-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('commodity-results-container').classList.add('hidden-element');
            document.getElementById('commodity-landing-view').classList.remove('hidden-element');
        });
    }

    // Optional: Search logic (mocked to just return to grid for now, or trigger selection if found)
    const searchBtn = document.getElementById('commodity-search-btn');
    const searchInput = document.getElementById('commodity-search-input');
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim().toUpperCase();
            if (!query) return;
            const match = commoditiesData.find(c => c.symbol.toUpperCase().includes(query) || c.name.toUpperCase().includes(query));
            if (match) {
                selectCommodity(match.id);
            } else {
                alert('Commodity not found in top 6 macro tracker. Detailed search coming soon.');
            }
        });
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchBtn.click();
        });
    }
}

async function loadCommodityDashboard() {
    const grid = document.getElementById('commodity-brackets-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="commodity-note" style="padding: 20px; grid-column: 1/-1;">Fetching live macro data...</div>';

    try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/api/commodities`);
        const payload = await safeJsonParse(response);
        
        if (payload?.commodities && Array.isArray(payload.commodities)) {
            commoditiesData = payload.commodities;
            renderCommodityGrid(commoditiesData);
        } else {
            grid.innerHTML = '<div class="commodity-note" style="padding: 20px; grid-column: 1/-1; color: var(--error-red);">Failed to load commodity data.</div>';
        }
    } catch (error) {
        console.error('Failed to load commodities:', error);
        grid.innerHTML = '<div class="commodity-note" style="padding: 20px; grid-column: 1/-1; color: var(--error-red);">Error connecting to macro service. Please try again.</div>';
    }
}

function renderCommodityGrid(items) {
    const grid = document.getElementById('commodity-brackets-grid');
    if (!grid) return;

    if (items.length === 0) {
        grid.innerHTML = '<div class="commodity-note">No commodities tracked.</div>';
        return;
    }

    grid.innerHTML = items.map(item => {
        if (item.error) {
            return `
                <button class="crypto-bracket-card disabled" disabled>
                    <div class="crypto-bracket-header">
                        <span class="crypto-bracket-emoji">${item.emoji || '⚠️'}</span>
                        <div>
                            <div class="crypto-bracket-name">${item.name}</div>
                            <div class="crypto-bracket-symbol">${item.symbol}</div>
                        </div>
                    </div>
                    <div class="crypto-bracket-price" style="font-size: 0.9rem; margin-top: 10px;">Data Unavailable</div>
                </button>
            `;
        }

        const priceText = item.price != null ? formatLargeCurrency(item.price) : 'N/A';
        const changeVal = item.changePercent != null ? parseFloat(item.changePercent) : 0;
        const changeText = item.changePercent != null ? `${changeVal >= 0 ? '+' : ''}${changeVal.toFixed(2)}%` : '--%';
        const changeClass = changeVal >= 0 ? 'pos-change' : 'neg-change';

        return `
            <button class="crypto-bracket-card" data-id="${item.id}">
                <div class="crypto-bracket-header">
                    <span class="crypto-bracket-emoji">${item.emoji}</span>
                    <div>
                        <div class="crypto-bracket-name">${item.name}</div>
                        <div class="crypto-bracket-symbol">${item.symbol}</div>
                    </div>
                </div>
                <div class="crypto-bracket-price">${priceText}</div>
                <div class="crypto-bracket-change ${changeClass}">${changeText}</div>
            </button>
        `;
    }).join('');

    // Attach listeners
    grid.querySelectorAll('.crypto-bracket-card:not(.disabled)').forEach(card => {
        card.addEventListener('click', () => {
            selectCommodity(card.getAttribute('data-id'));
        });
    });
}

async function selectCommodity(id) {
    const item = commoditiesData.find(c => c.id === id);
    if (!item) return;

    // Show results container, hide grid
    document.getElementById('commodity-landing-view').classList.add('hidden-element');
    document.getElementById('commodity-results-container').classList.remove('hidden-element');

    // Populate hero card
    document.getElementById('commodity-icon-display').innerText = item.emoji;
    document.getElementById('commodity-name-display').innerText = item.name;
    document.getElementById('commodity-ticker-badge').innerText = item.symbol;
    
    const priceText = item.price != null ? formatLargeCurrency(item.price) : 'N/A';
    document.getElementById('commodity-live-price-display').innerText = priceText;
    
    const changeVal = item.changePercent != null ? parseFloat(item.changePercent) : 0;
    const changeText = item.changePercent != null ? `${changeVal >= 0 ? '+' : ''}${changeVal.toFixed(2)}%` : '--%';
    const changeClass = changeVal >= 0 ? 'price-change-percent pos-change' : 'price-change-percent neg-change';
    
    const changeDisplay = document.getElementById('commodity-live-change-display');
    changeDisplay.innerText = changeText;
    changeDisplay.className = changeClass;

    // Fetch dynamic description
    const descEl = document.getElementById('commodity-description-display');
    descEl.innerHTML = '<span class="pulse-text" style="color: var(--neon-cyan-vibrant);">Analyzing global macro data and writing market profile...</span>';

    try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/api/commodities/description?symbol=${encodeURIComponent(item.symbol)}&name=${encodeURIComponent(item.name)}`);
        const payload = await safeJsonParse(response);
        
        if (payload?.description) {
            descEl.innerText = payload.description;
        } else {
            descEl.innerText = 'Market profile unavailable at this time.';
        }
    } catch (error) {
        console.error('Failed to fetch commodity description:', error);
        descEl.innerText = 'Failed to load market profile due to a network error.';
    }
}
