const express = require('express');
const router = express.Router();
const { fetchAlphaVantageCommodity, fetchTwelveDataQuote } = require('../utils/equityProviders');
const { getAiProvider, generateAiAnalysis } = require('../utils/aiProviders');

// Alpha Vantage Limit: 25 requests/day. We fetch 5 items.
// A 2-hour cache = 12 fetches/day * 5 items = 60 requests/day.
// Note: This exceeds the strict 25 req/day free limit if the server runs 24/7,
// but works fine for development/local sessions.
const AV_CACHE_TTL = 2 * 60 * 60 * 1000; 
const TD_CACHE_TTL = 5 * 60 * 1000; // Twelve Data limit: 800/day. We can cache for 5 mins.

const COMMODITIES_CACHE = {
    'XAU/USD': { data: null, lastFetched: 0 },
    'WTI': { data: null, lastFetched: 0 },
    'NATURAL_GAS': { data: null, lastFetched: 0 },
    'COPPER': { data: null, lastFetched: 0 },
    'ALUMINUM': { data: null, lastFetched: 0 },
    'WHEAT': { data: null, lastFetched: 0 }
};

const COMMODITY_CONFIGS = {
    'XAU/USD': { name: 'Gold', provider: 'TwelveData', symbol: 'XAU/USD', emoji: '🟡' },
    'WTI': { name: 'WTI Crude Oil', provider: 'AlphaVantage', symbol: 'WTI', interval: 'daily', emoji: '🛢️' },
    'NATURAL_GAS': { name: 'Natural Gas', provider: 'AlphaVantage', symbol: 'NATURAL_GAS', interval: 'daily', emoji: '🔥' },
    'COPPER': { name: 'Copper', provider: 'AlphaVantage', symbol: 'COPPER', interval: 'monthly', emoji: '🟠' },
    'ALUMINUM': { name: 'Aluminum', provider: 'AlphaVantage', symbol: 'ALUMINUM', interval: 'monthly', emoji: '⚙️' },
    'WHEAT': { name: 'Wheat', provider: 'AlphaVantage', symbol: 'WHEAT', interval: 'monthly', emoji: '🌾' }
};

const DESCRIPTION_CACHE = {};

// Helper to wait to avoid AV 1 req/sec limit burst
const delay = ms => new Promise(res => setTimeout(res, ms));

router.get('/', async (req, res) => {
    const now = Date.now();
    const results = [];
    
    // We will fetch sequentially to absolutely guarantee no burst limits are exceeded (AV is 1 req/sec)
    for (const [key, config] of Object.entries(COMMODITY_CONFIGS)) {
        const cacheEntry = COMMODITIES_CACHE[key];
        const ttl = config.provider === 'AlphaVantage' ? AV_CACHE_TTL : TD_CACHE_TTL;
        
        if (cacheEntry.data && (now - cacheEntry.lastFetched < ttl)) {
            results.push(cacheEntry.data);
            continue;
        }

        try {
            let data;
            if (config.provider === 'AlphaVantage') {
                await delay(1200); // Wait 1.2s to prevent 1req/sec AV limit
                const response = await fetchAlphaVantageCommodity(config.symbol, config.interval);
                if (response.error) throw new Error(response.error);
                
                data = {
                    id: key,
                    name: config.name,
                    symbol: config.symbol,
                    emoji: config.emoji,
                    price: response.price,
                    change: response.change,
                    changePercent: response.changePercent,
                    provider: 'AlphaVantage',
                    lastUpdated: response.lastUpdated
                };
            } else if (config.provider === 'TwelveData') {
                const response = await fetchTwelveDataQuote(config.symbol);
                if (response.error) throw new Error(response.error);
                
                data = {
                    id: key,
                    name: config.name,
                    symbol: config.symbol,
                    emoji: config.emoji,
                    price: response.price,
                    change: response.change,
                    changePercent: response.changePercent,
                    provider: 'TwelveData',
                    lastUpdated: new Date().toISOString()
                };
            }

            COMMODITIES_CACHE[key] = { data, lastFetched: Date.now() };
            results.push(data);
        } catch (error) {
            console.error(`Error fetching commodity ${key}:`, error.message);
            // Fallback to cached data if possible, even if expired
            if (cacheEntry.data) {
                results.push({ ...cacheEntry.data, stale: true });
            } else {
                results.push({
                    id: key,
                    name: config.name,
                    symbol: config.symbol,
                    emoji: config.emoji,
                    error: 'Data currently unavailable (API Rate limit or timeout)'
                });
            }
        }
    }

    res.json({ commodities: results });
});

router.get('/description', async (req, res) => {
    const { symbol, name } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Symbol required' });

    // Cache permanently to never fry Groq API limits
    if (DESCRIPTION_CACHE[symbol]) {
        return res.json({ description: DESCRIPTION_CACHE[symbol] });
    }

    try {
        const aiProvider = getAiProvider();
        const prompt = `Write a professional, 2-3 sentence market profile and description for the commodity "${name || symbol}" (Symbol: ${symbol}). Describe what it is used for globally and what macroeconomic factors typically drive its price. Do not include any current live prices or timestamps. Make it sound like a Bloomberg terminal summary.`;
        
        let description = '';
        if (aiProvider) {
            const { analysis } = await generateAiAnalysis(prompt);
            description = analysis;
        } else {
            // Fallback
            description = `${name || symbol} is a globally traded macroeconomic asset. Its price is influenced by supply chains, geopolitical events, and global inflation trends.`;
        }

        DESCRIPTION_CACHE[symbol] = description;
        res.json({ description });
    } catch (error) {
        console.error(`AI Description error for ${symbol}:`, error.message);
        res.status(500).json({ error: 'Failed to generate description' });
    }
});

module.exports = router;
