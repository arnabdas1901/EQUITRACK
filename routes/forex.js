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

    // Try Alpha Vantage First
    const avData = await fetchAlphaVantageForexDaily(fromSymbol, toSymbol);
    if (!avData.error) {
        payload = avData;
    } else {
        console.warn(`Alpha Vantage failed for ${fromSymbol}/${toSymbol}: ${avData.error}. Falling back to Frankfurter.`);
        usingFallback = true;
        
        try {
            // Calculate 1 year ago date
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            const startDateStr = oneYearAgo.toISOString().split('T')[0];

            const response = await fetch(`https://api.frankfurter.app/${startDateStr}..?from=${fromSymbol}&to=${toSymbol}`);
            if (!response.ok) throw new Error('Frankfurter historical API error');
            const data = await response.json();

            const dates = Object.keys(data.rates).sort((a, b) => new Date(a) - new Date(b));
            if (dates.length < 2) throw new Error('Insufficient fallback data');

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
                fallback: true
            };
        } catch (fbError) {
            console.error('Frankfurter Fallback Error:', fbError);
            return res.status(500).json({ error: `Failed to fetch data for ${fromSymbol}/${toSymbol}` });
        }
    }

    // Generate AI Macro Analysis
    try {
        const aiProvider = getAiProvider();
        let description = 'AI Profile not available.';
        
        if (aiProvider) {
            const prompt = `You are a Chief FX Strategist. Write a professional, concise (3-4 sentences) macroeconomic analysis for the currency pair ${fromSymbol}/${toSymbol}. The current exchange rate is ${payload.price.toFixed(4)}.
Assess the general monetary policy divergence or economic drivers impacting this pair. Do not include conversational filler or disclaimers. Make it sound like a premium Bloomberg terminal insight.`;

            const aiResponse = await generateAiAnalysis(prompt);
            description = aiResponse.analysis;
        }
        
        payload.description = description;
        payload.fromSymbol = fromSymbol;
        payload.toSymbol = toSymbol;
        
        res.json(payload);
    } catch (aiError) {
        console.error('Forex AI Analysis Error:', aiError);
        payload.description = 'Failed to generate AI macro profile.';
        res.json(payload);
    }
});

module.exports = router;
