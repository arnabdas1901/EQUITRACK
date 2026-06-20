import { BACKEND_URL, fetchWithTimeout, safeJsonParse, showToast, formatLargeCurrency, setupTabs } from '../utils.js';

let equityChartInstance = null;
let portfolioChartInstance = null;

export function loadDashboard() {
    setupTabs('.dashboard-header');
    setupTabs('#dashboard-equity');
    setupSearch();
    fetchMarketData('AAPL', '1Y');
}

function setupSearch() {
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('ticker-input');
    const timeframeSelect = document.getElementById('timeframe-select');

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const ticker = searchInput?.value.trim().toUpperCase() || 'AAPL';
            const tf = timeframeSelect?.value || '1Y';
            fetchMarketData(ticker, tf);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const ticker = searchInput.value.trim().toUpperCase() || 'AAPL';
                const tf = timeframeSelect?.value || '1Y';
                fetchMarketData(ticker, tf);
            }
        });
    }

    if (timeframeSelect) {
        timeframeSelect.addEventListener('change', () => {
            const ticker = searchInput?.value.trim().toUpperCase() || 'AAPL';
            const tf = timeframeSelect.value;
            fetchMarketData(ticker, tf);
        });
    }
}

async function fetchMarketData(ticker, timeframe = '1Y') {
    const loader = document.getElementById('global-loader');
    if (loader) loader.classList.remove('hidden-element');

    try {
        const [profileRes, quoteRes, metricsRes, chartRes, bsRes, cfRes] = await Promise.all([
            fetchWithTimeout(`${BACKEND_URL}/api/finnhub/profile?symbol=${ticker}`),
            fetchWithTimeout(`${BACKEND_URL}/api/finnhub/quote?symbol=${ticker}`),
            fetchWithTimeout(`${BACKEND_URL}/api/finnhub/metrics?symbol=${ticker}`),
            fetchWithTimeout(`${BACKEND_URL}/api/twelvedata/time_series?symbol=${ticker}&timeframe=${timeframe}`),
            fetchWithTimeout(`${BACKEND_URL}/api/twelvedata/statements?symbol=${ticker}&type=balance_sheet`),
            fetchWithTimeout(`${BACKEND_URL}/api/twelvedata/statements?symbol=${ticker}&type=cash_flow`)
        ].map(p => p.catch(() => null)));

        const profile = await safeJsonParse(profileRes);
        const quote = await safeJsonParse(quoteRes);
        const metrics = await safeJsonParse(metricsRes);
        const chartData = await safeJsonParse(chartRes);
        const balanceSheet = await safeJsonParse(bsRes);
        const cashFlow = await safeJsonParse(cfRes);

        if (profile?.error || quote?.error) {
            throw new Error(profile?.error || quote?.error || 'Invalid ticker symbol');
        }

        updateUI(profile, quote, metrics, balanceSheet, cashFlow);
        
        if (chartData && !chartData.error && chartData.values) {
            renderEquityChart(chartData.values);
        } else {
            console.warn('Chart data unavailable:', chartData);
        }

        calculatePortfolioAllocation(metrics, quote);
        
    } catch (error) {
        console.error("Market Data Fetch Error:", error);
        showToast(error.message || "Failed to load market data");
    } finally {
        if (loader) loader.classList.add('hidden-element');
    }
}

function updateUI(profile, quote, metrics, bs, cf) {
    const formatValue = (val, isCurrency = false) => {
        if (val == null) return '--';
        return isCurrency ? formatLargeCurrency(val * 1e6) : parseFloat(val).toFixed(2);
    };

    const metricData = metrics?.metric || {};

    const elements = {
        'company-name': profile?.name || 'Unknown',
        'ticker-symbol': profile?.ticker || '--',
        'current-price': quote?.c ? `$${quote.c.toFixed(2)}` : '--',
        'price-change': quote?.d ? `${quote.d > 0 ? '+' : ''}${quote.d.toFixed(2)} (${quote.dp?.toFixed(2)}%)` : '--',
        'metric-pe': formatValue(metricData.peTTM),
        'metric-pb': formatValue(metricData.pbAnnual),
        'metric-ps': formatValue(metricData.psTTM),
        'metric-roe': formatValue(metricData.roeTTM) + '%',
        'metric-roa': formatValue(metricData.roaTTM) + '%',
        'metric-margin': formatValue(metricData.netProfitMarginTTM) + '%',
        'metric-current-ratio': formatValue(metricData.currentRatioAnnual),
        'metric-debt-equity': formatValue(metricData.debtToEquityAnnual),
        'metric-quick-ratio': formatValue(metricData.quickRatioAnnual),
        'metric-revenue-growth': formatValue(metricData.revenueGrowth5Y) + '%',
        'metric-eps-growth': formatValue(metricData.epsGrowth5Y) + '%',
        'metric-dividend-yield': formatValue(metricData.dividendYieldIndicatedAnnual) + '%'
    };

    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
            if (id === 'price-change' && quote?.d) {
                el.style.color = quote.d >= 0 ? '#10b981' : '#ef4444';
            }
        }
    }

    const finTable = document.getElementById('financial-statements-body');
    if (finTable) {
        const bsData = bs?.balance_sheet?.[0] || {};
        const cfData = cf?.cash_flow?.[0] || {};
        
        finTable.innerHTML = `
            <tr><td>Total Assets</td><td>${formatLargeCurrency(bsData.total_assets || bsData.totalAssets)}</td></tr>
            <tr><td>Total Liabilities</td><td>${formatLargeCurrency(bsData.total_liabilities || bsData.totalLiabilities)}</td></tr>
            <tr><td>Total Equity</td><td>${formatLargeCurrency(bsData.total_shareholders_equity || bsData.totalEquity)}</td></tr>
            <tr><td>Operating Cash Flow</td><td>${formatLargeCurrency(cfData.operating_cash_flow || cfData.operatingCashFlow)}</td></tr>
            <tr><td>Investing Cash Flow</td><td>${formatLargeCurrency(cfData.investing_cash_flow || cfData.netCashUsedForInvestingActivites)}</td></tr>
            <tr><td>Financing Cash Flow</td><td>${formatLargeCurrency(cfData.financing_cash_flow || cfData.netCashUsedProvidedByFinancingActivities)}</td></tr>
            <tr><td>Net Change in Cash</td><td>${formatLargeCurrency(cfData.net_change_in_cash || cfData.netChangeInCash)}</td></tr>
        `;
    }
}

function renderEquityChart(values) {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;

    const data = [...values].reverse();
    const labels = data.map(v => v.datetime);
    const prices = data.map(v => parseFloat(v.close));

    const isPositive = prices[prices.length - 1] >= prices[0];
    const color = isPositive ? '#10b981' : '#ef4444';
    const bgColor = isPositive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

    if (equityChartInstance) {
        equityChartInstance.destroy();
    }

    equityChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Close Price',
                data: prices,
                borderColor: color,
                backgroundColor: bgColor,
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { position: 'right', border: { display: false } }
            },
            interaction: {
                intersect: false,
                mode: 'index',
            }
        }
    });
}

function calculatePortfolioAllocation(metrics, quote) {
    const beta = metrics?.metric?.beta || 1.0;
    const volatility = Math.min(Math.max(beta / 2, 0.1), 0.9);
    
    let equity = 60 * volatility;
    let fixedIncome = 40 * (1 - volatility);
    let metals = 100 - (equity + fixedIncome);
    
    if (quote?.d < 0) {
        fixedIncome += 5;
        equity -= 5;
    }

    renderPortfolioPieChart([equity, fixedIncome, metals]);
}

function renderPortfolioPieChart(dataArr) {
    const portfolioData = dataArr.map(v => Number(Math.max(0, v).toFixed(1)));
    const sum = portfolioData.reduce((a,b)=>a+b,0);
    if(sum !== 100) {
        portfolioData[0] += Number((100 - sum).toFixed(1));
    }
    
    const colors = ['#2563eb', '#64748b', '#f59e0b'];
    const canvas = document.getElementById('portfolioPieChart');
    if (!canvas) return;

    if (portfolioChartInstance) portfolioChartInstance.destroy();
    portfolioChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'pie',
        data: { 
            labels: ['Equity', 'Fixed Income', 'Metals'], 
            datasets: [{ data: portfolioData, backgroundColor: colors, borderWidth: 0 }] 
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const legendTarget = document.getElementById('portfolio-legend-target');
    if(legendTarget) {
        legendTarget.innerHTML = `
            <div class="legend-node">
                <div class="legend-meta"><div class="legend-color-dot" style="background:${colors[0]}"></div><span>Equity / Alpha Assets</span></div>
                <span class="legend-value">${portfolioData[0]}%</span>
            </div>
            <div class="legend-node">
                <div class="legend-meta"><div class="legend-color-dot" style="background:${colors[1]}"></div><span>Fixed Income / Debt</span></div>
                <span class="legend-value">${portfolioData[1]}%</span>
            </div>
            <div class="legend-node">
                <div class="legend-meta"><div class="legend-color-dot" style="background:${colors[2]}"></div><span>Precious Metals / Hedge</span></div>
                <span class="legend-value">${portfolioData[2]}%</span>
            </div>
        `;
    }
}
