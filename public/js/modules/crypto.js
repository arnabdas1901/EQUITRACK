import { BACKEND_URL, fetchWithTimeout, safeJsonParse, showToast, escapeHtml, formatLargeCurrency, setupTabs } from '../utils.js';

let cryptoChartInstance = null;

export function setupCryptoTracker() {
    const searchBtn = document.getElementById('crypto-search-btn');
    const searchInput = document.getElementById('crypto-search-input');
    const backBtn = document.getElementById('crypto-back-btn');
    
    if (searchBtn) {
        searchBtn.addEventListener('click', executeCryptoSearch);
    }
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') executeCryptoSearch();
        });
    }
    if (backBtn) {
        backBtn.addEventListener('click', clearCryptoResults);
    }

    setupTabs('#dashboard-crypto');
    loadTopCryptos();
}

function clearCryptoResults() {
    const results = document.getElementById('crypto-results-container');
    const landing = document.getElementById('crypto-landing-view');
    const searchInput = document.getElementById('crypto-search-input');
    
    if (results) results.classList.add('hidden-element');
    if (landing) landing.classList.remove('hidden-element');
    if (searchInput) searchInput.value = '';
}

async function loadTopCryptos() {
    const bracketsGrid = document.getElementById('crypto-brackets-grid');
    if (!bracketsGrid) return;

    bracketsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">Loading top cryptocurrencies...</p>';

    try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/api/crypto/top?limit=6`, {
            timeout: 10000,
        });
        const data = await safeJsonParse(response);

        if (!response.ok) {
            throw new Error(data?.error || 'Failed to load cryptocurrencies.');
        }

        bracketsGrid.innerHTML = '';
        data.forEach((crypto) => {
            const bracket = document.createElement('div');
            bracket.className = 'crypto-bracket-card';
            bracket.role = 'button';
            bracket.tabindex = '0';
            
            const change24h = crypto.price_change_percentage_24h || 0;
            const changeColor = change24h >= 0 ? '#10b981' : '#ef4444';
            const changeIcon = change24h >= 0 ? '▲' : '▼';

            bracket.innerHTML = `
                <div class="bracket-icon">${crypto.image ? `<img src="${crypto.image}" alt="${crypto.name}">` : '💰'}</div>
                <div class="bracket-name">${escapeHtml(crypto.name)}</div>
                <div class="bracket-symbol">${escapeHtml(crypto.symbol.toUpperCase())}</div>
                <div class="bracket-price">$${crypto.current_price?.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0.00'}</div>
                <div class="bracket-change" style="color: ${changeColor};">${changeIcon} ${Math.abs(change24h).toFixed(2)}%</div>
            `;

            bracket.addEventListener('click', () => displayCryptoDetails(crypto.id));
            bracket.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') displayCryptoDetails(crypto.id);
            });

            bracketsGrid.appendChild(bracket);
        });
    } catch (error) {
        console.error('Error loading top cryptos:', error);
        bracketsGrid.innerHTML = `<p style="grid-column: 1/-1; color: #ef4444; text-align: center;">Error loading cryptocurrencies. Try again.</p>`;
        showToast('Failed to load top cryptocurrencies.');
    }
}

async function executeCryptoSearch() {
    const input = document.getElementById('crypto-search-input');
    const query = input?.value.trim();

    if (!query) {
        showToast('Enter a cryptocurrency ticker or name to search.');
        return;
    }

    try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/api/crypto/search?query=${encodeURIComponent(query)}`, {
            timeout: 10000,
        });
        const data = await safeJsonParse(response);

        if (!response.ok) {
            throw new Error(data?.error || 'Search failed.');
        }

        if (!data.coins || data.coins.length === 0) {
            showToast('No cryptocurrencies found. Try another search.');
            return;
        }

        const topResult = data.coins[0];
        displayCryptoDetails(topResult.id);
        showToast(`Found: ${topResult.name}`);
    } catch (error) {
        console.error('Search error:', error);
        showToast('Search failed. Please try again.');
    }
}

async function displayCryptoDetails(cryptoId) {
    const loader = document.getElementById('crypto-loader');
    const resultsContainer = document.getElementById('crypto-results-container');
    const landing = document.getElementById('crypto-landing-view');

    if (loader) loader.classList.remove('hidden-element');
    if (resultsContainer) resultsContainer.classList.add('hidden-element');
    if (landing) landing.classList.add('hidden-element');

    try {
        const [detailsResponse, historyResponse] = await Promise.all([
            fetchWithTimeout(`${BACKEND_URL}/api/crypto/details?id=${encodeURIComponent(cryptoId)}`, { timeout: 10000 }),
            fetchWithTimeout(`${BACKEND_URL}/api/crypto/history?id=${encodeURIComponent(cryptoId)}&days=365`, { timeout: 10000 }).catch(() => null),
        ]);

        const details = await safeJsonParse(detailsResponse);
        const history = await safeJsonParse(historyResponse);

        if (!detailsResponse || !detailsResponse.ok) throw new Error(details?.error || 'Failed to fetch details');

        populateCryptoDetails(details);
        renderCryptoChart(history);

        if (loader) loader.classList.add('hidden-element');
        if (resultsContainer) resultsContainer.classList.remove('hidden-element');
        showToast(`Loaded ${details.name} details.`);
    } catch (error) {
        console.error('Error displaying crypto:', error);
        if (loader) loader.classList.add('hidden-element');
        if (landing) landing.classList.remove('hidden-element');
        showToast('Failed to load cryptocurrency details.');
    }
}

function populateCryptoDetails(crypto) {
    const marketData = crypto.market_data || {};
    
    const nameDisplay = document.getElementById('crypto-name-display');
    const tickerBadge = document.getElementById('crypto-ticker-badge');
    const rankBadge = document.getElementById('crypto-rank-badge');
    const iconDisplay = document.getElementById('crypto-icon-display');
    const priceDisplay = document.getElementById('crypto-live-price-display');
    const changeDisplay = document.getElementById('crypto-live-change-display');

    if (nameDisplay) nameDisplay.textContent = crypto.name;
    if (tickerBadge) tickerBadge.textContent = (crypto.symbol || '').toUpperCase();
    if (rankBadge) rankBadge.textContent = `#${crypto.market_cap_rank || '--'}`;
    if (iconDisplay) {
        const iconUrl = crypto.image?.thumb || crypto.image?.small || crypto.image?.large || crypto.image;
        iconDisplay.innerHTML = iconUrl
            ? `<img src="${iconUrl}" alt="${crypto.name}">`
            : '💰';
    }
    
    const currentPrice = marketData.current_price?.usd || 0;
    const change24h = marketData.price_change_percentage_24h || 0;
    
    if (priceDisplay) priceDisplay.textContent = `$${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    if (changeDisplay) {
        changeDisplay.textContent = `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}% (24h)`;
        changeDisplay.style.color = change24h >= 0 ? '#10b981' : '#ef4444';
    }

    const metrics = {
        'crypto-metric-24h-high': marketData.high_24h?.usd,
        'crypto-metric-24h-low': marketData.low_24h?.usd,
        'crypto-metric-market-cap': marketData.market_cap?.usd,
        'crypto-metric-volume': marketData.total_volume?.usd,
        'crypto-metric-supply': crypto.market_data?.circulating_supply,
        'crypto-metric-total-supply': crypto.market_data?.total_supply,
        'crypto-metric-ath': marketData.ath?.usd,
        'crypto-metric-ath-date': marketData.ath_date?.usd,
    };

    Object.entries(metrics).forEach(([id, value]) => {
        const elem = document.getElementById(id);
        if (elem) {
            if (id.includes('supply')) {
                elem.textContent = value ? value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '--';
            } else if (id.includes('market-cap') || id.includes('volume')) {
                elem.textContent = formatLargeCurrency(value);
            } else if (id.includes('ath-date')) {
                elem.textContent = value ? new Date(value).toLocaleDateString() : '--';
            } else {
                elem.textContent = value ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '--';
            }
        }
    });

    const overviewBody = document.getElementById('crypto-overview-table-body');
    if (overviewBody) {
        overviewBody.innerHTML = `
            <tr><td>Market Cap Rank</td><td>#${crypto.market_cap_rank || '--'}</td></tr>
            <tr><td>Current Price (USD)</td><td>$${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td></tr>
            <tr><td>24h Change</td><td style="color: ${change24h >= 0 ? '#10b981' : '#ef4444'}">${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%</td></tr>
            <tr><td>7d Change</td><td style="color: ${(marketData.price_change_percentage_7d || 0) >= 0 ? '#10b981' : '#ef4444'}">${(marketData.price_change_percentage_7d || 0) >= 0 ? '+' : ''}${(marketData.price_change_percentage_7d || 0).toFixed(2)}%</td></tr>
            <tr><td>30d Change</td><td style="color: ${(marketData.price_change_percentage_30d || 0) >= 0 ? '#10b981' : '#ef4444'}">${(marketData.price_change_percentage_30d || 0) >= 0 ? '+' : ''}${(marketData.price_change_percentage_30d || 0).toFixed(2)}%</td></tr>
            <tr><td>Market Cap</td><td>${formatLargeCurrency(marketData.market_cap?.usd)}</td></tr>
            <tr><td>24h Trading Volume</td><td>${formatLargeCurrency(marketData.total_volume?.usd)}</td></tr>
            <tr><td>Fully Diluted Valuation</td><td>${formatLargeCurrency(marketData.fully_diluted_valuation?.usd)}</td></tr>
        `;
    }

    const statsBody = document.getElementById('crypto-stats-table-body');
    if (statsBody) {
        const athDate = marketData.ath_date?.usd ? new Date(marketData.ath_date.usd).toLocaleDateString() : '--';
        const atlDate = marketData.atl_date?.usd ? new Date(marketData.atl_date.usd).toLocaleDateString() : '--';
        
        statsBody.innerHTML = `
            <tr><td>All-Time High (USD)</td><td>$${(marketData.ath?.usd || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td></tr>
            <tr><td>ATH Date</td><td>${athDate}</td></tr>
            <tr><td>All-Time Low (USD)</td><td>$${(marketData.atl?.usd || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td></tr>
            <tr><td>ATL Date</td><td>${atlDate}</td></tr>
            <tr><td>Circulating Supply</td><td>${(crypto.market_data?.circulating_supply || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td></tr>
            <tr><td>Total Supply</td><td>${(crypto.market_data?.total_supply || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td></tr>
            <tr><td>Max Supply</td><td>${crypto.market_data?.max_supply ? crypto.market_data.max_supply.toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'Unlimited'}</td></tr>
            <tr><td>Market Cap / Fully Diluted</td><td>${((marketData.market_cap?.usd / marketData.fully_diluted_valuation?.usd) * 100 || 0).toFixed(2)}%</td></tr>
        `;
    }
}

function renderCryptoChart(history) {
    const prices = history?.prices || [];
    
    const labels = prices.map(([timestamp]) => {
        const date = new Date(timestamp);
        return (date.getMonth() + 1) + '/' + date.getDate();
    });

    const data = prices.map(([, price]) => price);

    const canvas = document.getElementById('cryptoHistoricalChart');
    if (!canvas) return;

    if (cryptoChartInstance) {
        cryptoChartInstance.data.labels = labels;
        cryptoChartInstance.data.datasets[0].data = data;
        cryptoChartInstance.update();
    } else {
        cryptoChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '1-Year Price',
                    data: data,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 0,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 8, right: 10, left: 6, bottom: 8 } },
                plugins: {
                    legend: { display: true },
                    title: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: { callback: (val) => '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
                    }
                }
            }
        });
    }
}
