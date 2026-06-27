const express = require('express');
const router = express.Router();
const { getAiProvider, generateAiAnalysis } = require('../utils/aiProviders');

router.post('/analyze', async (req, res) => {
    try {
        const aiProvider = getAiProvider();
        if (!aiProvider) {
            return res.json({ analysis: null, error: 'No AI provider configured' });
        }

        const { scenario, totalDrawdown, stressedValue, capital, allocations, riskMetrics } = req.body;

        const prompt = `You are a Chief Risk Officer at an institutional investment firm. Write a professional, concise (5–7 sentences) risk assessment based on the following portfolio stress test results. Use a formal, Bloomberg-terminal style tone. Do NOT use markdown headings.

STRESS TEST RESULTS:
- Scenario: ${scenario || 'N/A'}
- Portfolio Capital: $${Number(capital || 0).toLocaleString()}
- Total Drawdown: ${Number(totalDrawdown || 0).toFixed(2)}%
- Stressed Portfolio Value: $${Number(stressedValue || 0).toLocaleString()}
- Value at Risk (95%): ${Number(riskMetrics?.var95 || 0).toFixed(2)}%
- Conditional VaR: ${Number(riskMetrics?.cvar || 0).toFixed(2)}%
- Max Drawdown: ${Number(riskMetrics?.maxDrawdown || 0).toFixed(2)}%
- Sharpe Ratio: ${Number(riskMetrics?.sharpe || 0).toFixed(3)}
- Sortino Ratio: ${Number(riskMetrics?.sortino || 0).toFixed(3)}
- Probability of Loss: ${Number(riskMetrics?.probLoss || 0).toFixed(1)}%
- Expected Annual Return: ${Number(riskMetrics?.meanReturn || 0).toFixed(2)}%
- Portfolio Allocation: ${JSON.stringify(allocations || {})}

INSTRUCTIONS:
1. Assess whether the portfolio's risk profile is appropriate given the drawdown exposure.
2. Comment on the VaR and CVaR levels relative to the portfolio's expected return (risk-reward tradeoff).
3. Suggest ONE specific, actionable rebalancing recommendation to improve resilience.
4. Do NOT include conversational filler, disclaimers, or "I'd recommend" phrasing. Write as if this is a risk report excerpt.
5. Keep it under 150 words.`;

        const aiResponse = await generateAiAnalysis(prompt);
        res.json({ analysis: aiResponse.analysis });

    } catch (err) {
        console.error('Stress AI Error:', err);
        res.json({ analysis: null, error: err.message });
    }
});

module.exports = router;
