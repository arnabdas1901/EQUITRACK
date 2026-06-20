let portfolioChartInstance = null;

export function setupPortfolioBuilder() {
    const generateBtn = document.getElementById('generate-portfolio-btn');
    const riskInput = document.getElementById('portfolio-risk-input');
    const ageInput = document.getElementById('portfolio-age-input');

    if (generateBtn) {
        generateBtn.addEventListener('click', generatePortfolio);
    }
    
    if (riskInput) {
        riskInput.addEventListener('change', generatePortfolio);
    }
    
    if (ageInput) {
        ageInput.addEventListener('change', generatePortfolio);
    }

    // Generate initial
    generatePortfolio();
}

function generatePortfolio() {
    const age = parseInt(document.getElementById('portfolio-age-input')?.value) || 30;
    const risk = document.getElementById('portfolio-risk-input')?.value || 'moderate';

    // Basic rule of thumb: 100 - age = equity %, adjust by risk profile
    let baseEquity = Math.max(0, Math.min(100, 110 - age));
    let equity = baseEquity;
    let fixedIncome = 100 - baseEquity;
    let metals = 0;

    if (risk === 'aggressive') {
        equity = Math.min(100, baseEquity + 15);
        fixedIncome = 100 - equity;
    } else if (risk === 'conservative') {
        equity = Math.max(0, baseEquity - 15);
        fixedIncome = 100 - equity;
    }

    // Allocate 5-10% to metals as a hedge depending on risk
    if (risk === 'conservative') {
        metals = 10;
        fixedIncome -= 10;
    } else if (risk === 'moderate') {
        metals = 5;
        fixedIncome -= 5;
    } else {
        metals = 0; // Aggressive goes full equity/fixed
    }

    // Ensure no negative values
    if (fixedIncome < 0) fixedIncome = 0;
    
    const total = equity + fixedIncome + metals;
    // Normalize to 100%
    equity = Math.round((equity / total) * 100);
    metals = Math.round((metals / total) * 100);
    fixedIncome = 100 - equity - metals;

    renderPortfolioPieChart([equity, fixedIncome, metals]);
}

function renderPortfolioPieChart(dataArr) {
    const colors = ['#2563eb', '#64748b', '#f59e0b'];
    const canvas = document.getElementById('portfolioPieChart');
    if (!canvas) return;

    if (portfolioChartInstance) portfolioChartInstance.destroy();
    portfolioChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'pie',
        data: { 
            labels: ['Equity', 'Fixed Income', 'Metals'], 
            datasets: [{ data: dataArr, backgroundColor: colors, borderWidth: 0 }] 
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const legendTarget = document.getElementById('portfolio-legend-target');
    if(legendTarget) {
        legendTarget.innerHTML = `
            <div class="legend-node">
                <div class="legend-meta"><div class="legend-color-dot" style="background:${colors[0]}"></div><span>Equity / Alpha Assets</span></div>
                <span class="legend-value">${dataArr[0]}%</span>
            </div>
            <div class="legend-node">
                <div class="legend-meta"><div class="legend-color-dot" style="background:${colors[1]}"></div><span>Fixed Income / Debt</span></div>
                <span class="legend-value">${dataArr[1]}%</span>
            </div>
            <div class="legend-node">
                <div class="legend-meta"><div class="legend-color-dot" style="background:${colors[2]}"></div><span>Precious Metals / Hedge</span></div>
                <span class="legend-value">${dataArr[2]}%</span>
            </div>
        `;
    }
}
