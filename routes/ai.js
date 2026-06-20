const express = require('express');
const router = express.Router();
const { requireTicker } = require('../utils/api');
const { AI_FRAME_INSTRUCTIONS, buildAiPrompt, getAiProvider, generateAiAnalysis } = require('../utils/aiProviders');

router.post('/analyze', async (req, res) => {
    const { frame } = req.body || {};
    const symbol = requireTicker(req, res);
    if (!symbol) return;
    const frameKey = AI_FRAME_INSTRUCTIONS[frame] ? frame : 'dupont';

    if (!getAiProvider()) {
        return res.status(503).json({
            error: 'No AI API key configured. Add GROQ_API_KEY (free at console.groq.com) to .env',
        });
    }

    try {
        const finnhubToken = process.env.FINNHUB_API_KEY;
        const [profileRes, quoteRes, metricsRes] = await Promise.all([
            fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${finnhubToken}`),
            fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubToken}`),
            fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${finnhubToken}`),
        ]);

        const profile = await profileRes.json();
        const quote = await quoteRes.json();
        const metricsPayload = await metricsRes.json();

        if (!profile?.name || typeof quote?.c !== 'number') {
            return res.status(404).json({ error: 'Ticker not found or market data unavailable.' });
        }

        const prompt = buildAiPrompt(symbol, frameKey, profile, quote, metricsPayload);
        const { analysis, provider } = await generateAiAnalysis(prompt);

        res.json({
            analysis,
            symbol,
            frame: frameKey,
            provider,
            model: provider === 'groq'
                ? (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile')
                : (process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
        });
    } catch (error) {
        console.error('AI Analyze Error:', error);
        const status = error.statusCode || 500;
        const message =
            status === 500 ? 'Failed to generate AI analysis.' : error.message;
        res.status(status).json({ error: message });
    }
});

module.exports = router;
