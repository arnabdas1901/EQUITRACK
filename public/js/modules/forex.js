import { BACKEND_URL, safeJsonParse, showToast } from '../utils.js';

let forexChartInstance = null;

export async function setupForexTracker() {
    const searchBtn = document.getElementById('forex-search-btn');
    const searchInput = document.getElementById('forex-search-input');
    const backBtn = document.getElementById('forex-back-btn');

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim();
            if (query) executeForexSearch(query);
            else showToast('Please enter a currency pair (e.g. GBP/USD)');
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) executeForexSearch(query);
                else showToast('Please enter a currency pair (e.g. GBP/USD)');
            }
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('forex-results-container').classList.add('hidden-element');
            document.getElementById('forex-landing-view').classList.remove('hidden-element');
            if (searchInput) searchInput.value = '';
        });
    }

    const cards = document.querySelectorAll('#forex-brackets-grid .crypto-bracket-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const symbol = card.querySelector('.bracket-symbol').innerText;
            if (searchInput) searchInput.value = symbol;
            executeForexSearch(symbol);
        });
        card.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                const symbol = card.querySelector('.bracket-symbol').innerText;
                if (searchInput) searchInput.value = symbol;
                executeForexSearch(symbol);
            }
        });
    });

    loadLatestForexRates();
}

async function loadLatestForexRates() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/forex/latest`);
        const data = await safeJsonParse(res);
        if (!data || !data.rates) return;

        const cards = document.querySelectorAll('#forex-brackets-grid .crypto-bracket-card');
        cards.forEach(card => {
            const symbol = card.querySelector('.bracket-symbol').innerText;
            let toCurrency;
            if (symbol.includes('/')) {
                toCurrency = symbol.split('/')[1];
                if (symbol.split('/')[0] !== 'USD') {
                    toCurrency = symbol.split('/')[0];
                    if (data.rates[toCurrency]) {
                        const price = 1 / data.rates[toCurrency];
                        card.querySelector('.bracket-price').innerText = price.toFixed(4);
                    }
                } else {
                    if (data.rates[toCurrency]) {
                        card.querySelector('.bracket-price').innerText = data.rates[toCurrency].toFixed(4);
                    }
                }
            }
        });
    } catch (err) {
        console.warn('Could not load latest forex rates', err);
    }
}

async function executeForexSearch(pairQuery) {
    const loader = document.getElementById('forex-loader');
    const results = document.getElementById('forex-results-container');
    const landing = document.getElementById('forex-landing-view');

    if (loader) loader.classList.remove('hidden-element');
    if (results) results.classList.add('hidden-element');
    if (landing) landing.classList.add('hidden-element');

    try {
        const res = await fetch(`${BACKEND_URL}/api/forex/search?pair=${encodeURIComponent(pairQuery)}`);
        const data = await safeJsonParse(res);

        if (data.error) {
            throw new Error(data.error);
        }

        const isPositive = data.change >= 0;
        const colorClass = isPositive ? 'positive' : 'negative';
        const sign = isPositive ? '+' : '';

        document.getElementById('forex-name-display').innerText = `${data.fromSymbol} / ${data.toSymbol}`;
        document.getElementById('forex-symbol-badge').innerText = `${data.fromSymbol}${data.toSymbol}`;
        document.getElementById('forex-live-price').innerText = data.price.toFixed(4);
        
        const changeEl = document.getElementById('forex-change-display');
        changeEl.innerText = `${sign}${data.change.toFixed(4)} (${sign}${data.changePercent.toFixed(2)}%)`;
        changeEl.className = `price-change-percent ${colorClass}`;

        document.getElementById('forex-description-display').innerText = data.description || 'No analysis available.';

        if (data.chartData && data.chartData.length > 0) {
            renderForexChart(data.chartData, `${data.fromSymbol}/${data.toSymbol}`, isPositive);
        }

        if (loader) loader.classList.add('hidden-element');
        if (results) results.classList.remove('hidden-element');

    } catch (err) {
        console.error("Forex Search Error:", err);
        showToast(err.message || "Failed to load forex data.");
        if (loader) loader.classList.add('hidden-element');
        if (landing) landing.classList.remove('hidden-element');
    }
}

function renderForexChart(chartData, pairName, isPositive) {
    const canvas = document.getElementById('forexHistoricalChart');
    if (!canvas) return;

    if (forexChartInstance) {
        forexChartInstance.destroy();
    }

    const labels = chartData.map(d => {
        const date = new Date(d.time * 1000);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    });
    const dataPoints = chartData.map(d => d.close);

    const gradient = canvas.getContext('2d').createLinearGradient(0, 0, 0, 400);
    if (isPositive) {
        gradient.addColorStop(0, 'rgba(0, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
    } else {
        gradient.addColorStop(0, 'rgba(255, 0, 85, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 0, 85, 0)');
    }

    const lineColor = isPositive ? '#00ffff' : '#ff0055';

    forexChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${pairName} Close Price`,
                data: dataPoints,
                borderColor: lineColor,
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1a1f2e',
                    titleColor: '#8f9bb3',
                    bodyColor: '#ffffff',
                    borderColor: '#2e3852',
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => `Price: ${ctx.parsed.y.toFixed(4)}`
                    }
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    display: true,
                    position: 'right',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#8f9bb3',
                        callback: (val) => val.toFixed(4)
                    }
                }
            }
        }
    });
}
