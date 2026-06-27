const express = require('express');
const router = express.Router();
const { fetchAlphaVantageForexDaily } = require('../utils/equityProviders');
const { getAiProvider, generateAiAnalysis } = require('../utils/aiProviders');

router.get('/latest', async (req, res) => {
    try {
        const response = await fetch('https://api.frankfurter.app/latest?from=USD');
        if (!response.ok) throw new Error('Frankfurter API error');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Forex Latest Error:', error);
        res.status(500).json({ error: 'Failed to fetch latest exchange rates' });
    }
});

router.get('/search', async (req, res) => {
    const { pair } = req.query; // format expected: "EUR/USD" or "EURUSD"
    if (!pair) return res.status(400).json({ error: 'Pair required' });

    let fromSymbol, toSymbol;
    if (pair.includes('/')) {
        [fromSymbol, toSymbol] = pair.toUpperCase().split('/');
    } else if (pair.length === 6) {
        fromSymbol = pair.substring(0, 3).toUpperCase();
        toSymbol = pair.substring(3, 6).toUpperCase();
    } else {
        return res.status(400).json({ error: 'Invalid pair format. Use XXX/YYY.' });
    }

    let payload = null;
    let usingFallback = false;

    // Try Frankfurter First (Free, no API key needed)
    try {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const startDateStr = oneYearAgo.toISOString().split('T')[0];

        const response = await fetch(`https://api.frankfurter.app/${startDateStr}..?from=${fromSymbol}&to=${toSymbol}`);
        if (!response.ok) throw new Error('Frankfurter historical API error');
        const data = await response.json();

        const dates = Object.keys(data.rates).sort((a, b) => new Date(a) - new Date(b));
        if (dates.length < 2) throw new Error('Insufficient Frankfurter data');

        const latestDate = dates[dates.length - 1];
        const previousDate = dates[dates.length - 2];
        const currentPrice = data.rates[latestDate][toSymbol];
        const previousPrice = data.rates[previousDate][toSymbol];
        const change = currentPrice - previousPrice;
        const changePercent = (change / previousPrice) * 100;

        const chartData = dates.map(date => ({
            time: new Date(date).getTime() / 1000,
            close: data.rates[date][toSymbol]
        }));

        payload = {
            price: currentPrice,
            change: change,
            changePercent: changePercent,
            chartData: chartData,
            provider: 'Frankfurter (ECB)'
        };
    } catch (fbError) {
        console.warn(`Frankfurter failed for ${fromSymbol}/${toSymbol}: ${fbError.message}. Falling back to Alpha Vantage.`);
        usingFallback = true;
        
        // Try Alpha Vantage Fallback
        const avData = await fetchAlphaVantageForexDaily(fromSymbol, toSymbol);
        if (!avData.error) {
            payload = avData;
            payload.provider = 'Alpha Vantage';
        } else {
            console.error('Alpha Vantage Fallback Error:', avData.error);
            return res.status(500).json({ error: `Failed to fetch data for ${fromSymbol}/${toSymbol}` });
        }
    }

    payload.fromSymbol = fromSymbol;
    payload.toSymbol = toSymbol;
    payload.description = null; // Removed automatic AI generation

    res.json(payload);
});

// New on-demand AI macro analysis endpoint
router.post('/analyze', async (req, res) => {
    try {
        const aiProvider = getAiProvider();
        if (!aiProvider) {
            return res.json({ analysis: 'AI Profile not available (No provider).' });
        }

        const { fromSymbol, toSymbol, price } = req.body;
        if (!fromSymbol || !toSymbol || !price) {
            return res.status(400).json({ error: 'Missing pair data' });
        }
        
        const prompt = `You are a Chief FX Strategist. Write a professional, concise (3-4 sentences) macroeconomic analysis for the currency pair ${fromSymbol}/${toSymbol}. The current exchange rate is ${Number(price).toFixed(4)}.
Assess the general monetary policy divergence or economic drivers impacting this pair. Do not include conversational filler or disclaimers. Make it sound like a premium Bloomberg terminal insight.`;

        const aiResponse = await generateAiAnalysis(prompt);
        res.json({ analysis: aiResponse.analysis });

    } catch (aiError) {
        console.error('Forex AI Analysis Error:', aiError);
        res.status(500).json({ error: 'Failed to generate AI macro profile.' });
    }
});

module.exports = router;
