const express = require('express');
const router = express.Router();

const { requireTicker } = require('../utils/api');
const { fetchFmpMetrics, fetchFinnhubHistory } = require('../utils/equityProviders');

// Company Profile Endpoint
router.get('/finnhub/profile', async (req, res) => {
    const symbol = requireTicker(req, res);
    if (!symbol) return;

    try {
        const response = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${process.env.FINNHUB_API_KEY}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Finnhub Profile Error:", error);
        res.status(500).json({ error: "Failed to fetch company profile" });
    }
});

// Key Financial Metrics Endpoint
router.get('/finnhub/metrics', async (req, res) => {
    const symbol = requireTicker(req, res);
    if (!symbol) return;

    try {
        const response = await fetch(
            `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${process.env.FINNHUB_API_KEY}`
        );
        const data = await response.json();

        const needsFallback = !data?.metric ||
            data.metric.returnOnEquityTTM == null ||
            data.metric.totalDebtTotalEquityAnnual == null ||
            (data.metric.enterpriseValueTTM == null && data.metric.evToEbitda == null && data.metric.evEbitda == null);

        if (needsFallback && (process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY || process.env.FINANCIALMODELINGPREP_API_KEY)) {
            try {
                const fallback = await fetchFmpMetrics(symbol);
                if (!fallback.error) {
                    data.fmpMetrics = fallback;
                }
            } catch (fallbackError) {
                console.warn('FMP metrics fallback failed:', fallbackError);
            }
        }

        res.json(data);
    } catch (error) {
        console.error("Finnhub Metrics Error:", error);
        res.status(500).json({ error: "Failed to fetch financial metrics" });
    }
});

// Real-Time Quote Endpoint
router.get('/finnhub/quote', async (req, res) => {
    const symbol = requireTicker(req, res);
    if (!symbol) return;

    try {
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${process.env.FINNHUB_API_KEY}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Finnhub Quote Error:", error);
        res.status(500).json({ error: "Failed to fetch real-time quote" });
    }
});

async function tryFinnhubFallback(symbol, timeframe) {
    if (!process.env.FINNHUB_API_KEY) {
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    let resolution = 'D';
    let days = 365;

    if (timeframe === '1M') {
        resolution = 'D';
        days = 30;
    } else if (timeframe === '1Y') {
        resolution = 'D';
        days = 365;
    } else if (timeframe === '5Y') {
        resolution = 'W';
        days = 365 * 5;
    } else if (timeframe === 'MAX') {
        resolution = 'M';
        days = 365 * 10;
    }

    const from = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
    const fh = await fetchFinnhubHistory(symbol, from, now, resolution);
    if (fh?.error || !Array.isArray(fh?.t) || fh.t.length === 0) {
        console.warn('Finnhub fallback did not return usable data:', fh);
        return null;
    }

    const values = fh.t.map((timestamp, index) => ({
        datetime: new Date(timestamp * 1000).toISOString().slice(0, 10),
        open: fh.o[index],
        high: fh.h[index],
        low: fh.l[index],
        close: fh.c[index],
        volume: fh.v[index]
    })).reverse();

    return { values };
}

// Historical Time-Series (Charts)
router.get('/twelvedata/time_series', async (req, res) => {
    const symbol = requireTicker(req, res);
    if (!symbol) return;
    const timeframe = String(req.query.timeframe || '1Y').toUpperCase();

    const timeframeConfig = {
        '1M': { interval: '1day', outputsize: 30 },
        '1Y': { interval: '1day', outputsize: 252 },
        '5Y': { interval: '1week', outputsize: 260 },
        'MAX': { interval: '1month', outputsize: 120 }
    };

    const config = timeframeConfig[timeframe];
    if (!config) {
        return res.status(400).json({ error: 'Valid timeframe is required' });
    }

    try {
        const response = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${config.interval}&outputsize=${config.outputsize}&apikey=${process.env.TWELVEDATA_API_KEY}`);
        const data = await response.json();

        if (data?.status === 'error' || !Array.isArray(data?.values)) {
            console.warn('TwelveData time series fallback triggered:', data);
            const fallback = await tryFinnhubFallback(symbol, timeframe);
            if (fallback) return res.json(fallback);
            return res.status(500).json({ error: 'No time series values returned', raw: data });
        }

        if (timeframe === '1Y' && Array.isArray(data.values) && data.values.length < 180) {
            console.warn(`TwelveData 1Y values too short (${data.values.length}), using Finnhub fallback`);
            const fallback = await tryFinnhubFallback(symbol, timeframe);
            if (fallback) return res.json(fallback);
        }

        res.json(data);
    } catch (error) {
        console.error("TwelveData Time Series Error:", error);
        const fallback = await tryFinnhubFallback(symbol, timeframe);
        if (fallback) return res.json(fallback);
        res.status(500).json({ error: "Failed to fetch historical data" });
    }
});

// Financial Statements (Balance Sheet / Cash Flow)
router.get('/twelvedata/statements', async (req, res) => {
    const symbol = requireTicker(req, res);
    if (!symbol) return;
    const type = String(req.query.type || '').trim();
    const allowedStatementTypes = new Set(['balance_sheet', 'cash_flow']);
    if (!allowedStatementTypes.has(type)) {
        return res.status(400).json({ error: 'Valid statement type is required' });
    }

    try {
        let twelvedataFailed = false;
        let data = null;

        if (process.env.TWELVEDATA_API_KEY) {
            const response = await fetch(`https://api.twelvedata.com/${type}?symbol=${encodeURIComponent(symbol)}&apikey=${process.env.TWELVEDATA_API_KEY}`);
            data = await response.json();
            if (data?.status === 'error') {
                twelvedataFailed = true;
            }
        } else {
            twelvedataFailed = true;
        }

        if (twelvedataFailed) {
            const fmpKey = process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY || process.env.FINANCIALMODELINGPREP_API_KEY;
            if (fmpKey) {
                const fmpType = type === 'balance_sheet' ? 'balance-sheet-statement' : 'cash-flow-statement';
                const fmpUrl = `https://financialmodelingprep.com/api/v3/${fmpType}/${encodeURIComponent(symbol)}?limit=1&apikey=${fmpKey}`;
                const fmpResponse = await fetch(fmpUrl);
                const fmpData = await fmpResponse.json();

                if (Array.isArray(fmpData) && fmpData.length > 0) {
                    const stmt = fmpData[0];
                    if (type === 'balance_sheet') {
                        return res.json({ balance_sheet: [{ total_assets: stmt.totalAssets, total_liabilities: stmt.totalLiabilities, total_shareholders_equity: stmt.totalStockholdersEquity || stmt.totalEquity }] });
                    } else {
                        return res.json({ cash_flow: [{ operating_cash_flow: stmt.operatingCashFlow, investing_cash_flow: stmt.netCashUsedForInvestingActivites || stmt.netCashUsedForInvestingActivities, financing_cash_flow: stmt.netCashUsedProvidedByFinancingActivities, net_change_in_cash: stmt.netChangeInCash }] });
                    }
                }
            }
        }

        res.json(data || { error: 'No data available' });
    } catch (error) {
        console.error(`Statements Error:`, error);
        res.status(500).json({ error: `Failed to fetch ${type}` });
    }
});

module.exports = router;
