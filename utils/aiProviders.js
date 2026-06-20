const pickMetricsForAi = (metric) => {
    if (!metric) return {};
    return {
        peTTM: metric.peTTM,
        pbAnnual: metric.pbAnnual,
        psTTM: metric.psTTM,
        roeTTM: metric.roeTTM,
        roaTTM: metric.roaTTM,
        netProfitMarginTTM: metric.netProfitMarginTTM,
        currentRatioAnnual: metric.currentRatioAnnual,
        debtToEquityAnnual: metric.debtToEquityAnnual,
        revenueGrowth5Y: metric.revenueGrowth5Y,
        epsGrowth5Y: metric.epsGrowth5Y,
        dividendYieldIndicatedAnnual: metric.dividendYieldIndicatedAnnual,
    };
};

const AI_FRAME_INSTRUCTIONS = {
    dupont:
        'Perform a 3-stage DuPont ROE decomposition (net profit margin × asset turnover × equity multiplier). Explain drivers using the metrics provided.',
    redflags:
        'Run an automated financial red flags scan: valuation stretch, leverage, liquidity, growth quality, and macro/sector risks.',
    dcf:
        'Explain a discounted cash flow (DCF) framework for this company: key assumptions, FCFF vs FCFE, WACC inputs, and terminal value—educational only, no fabricated precise intrinsic price.',
    benchmarking:
        'Provide qualitative peer-group / sector benchmarking: how valuation and profitability likely compare to sector norms.',
};

const buildAiPrompt = (symbol, frameKey, profile, quote, metricsPayload) => {
    const context = {
        symbol,
        company: profile.name,
        industry: profile.finnhubIndustry,
        exchange: profile.exchange,
        marketCap: profile.marketCapitalization,
        price: quote.c,
        change: quote.d,
        changePercent: quote.dp,
        week52High: quote.h,
        week52Low: quote.l,
        metrics: pickMetricsForAi(metricsPayload?.metric),
    };

    return `You are EQUITRACK, an educational equity research assistant.

RULES:
- Not financial advice; include a one-sentence disclaimer at the end.
- Use short headings and bullet points; stay under 450 words.
- Use only the JSON data below; if missing, write "data unavailable".
- Do not invent exact price targets or fabricated financial statement line items.

TASK: ${AI_FRAME_INSTRUCTIONS[frameKey]}

DATA:
${JSON.stringify(context, null, 2)}

Write the analysis for ${symbol}.`;
};

const getAiProvider = () => {
    if (process.env.GROQ_API_KEY) return 'groq';
    if (process.env.GEMINI_API_KEY) return 'gemini';
    return null;
};

async function generateWithGroq(prompt) {
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.6,
            max_tokens: 1024,
        }),
    });

    const data = await response.json();
    if (!response.ok) {
        const message = data?.error?.message || 'Groq API request failed';
        console.error('Groq API Error:', data);
        const err = new Error(message);
        err.statusCode = 502;
        throw err;
    }

    const text = data?.choices?.[0]?.message?.content || '';
    if (!text.trim()) {
        const err = new Error('Empty response from AI model.');
        err.statusCode = 502;
        throw err;
    }
    return text.trim();
}

async function generateWithGemini(prompt) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const geminiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 1024,
            },
        }),
    });

    const data = await response.json();
    if (!response.ok) {
        let message = data?.error?.message || 'Gemini API request failed';
        if (message.includes('limit: 0')) {
            message =
                'Gemini free tier is not active on your Google project. Use Groq instead: add GROQ_API_KEY from console.groq.com (free, no card).';
        }
        console.error('Gemini API Error:', data);
        const err = new Error(message);
        err.statusCode = 502;
        throw err;
    }

    const text =
        data?.candidates?.[0]?.content?.parts
            ?.map((part) => part.text)
            .filter(Boolean)
            .join('') || '';

    if (!text.trim()) {
        const err = new Error('Empty response from AI model.');
        err.statusCode = 502;
        throw err;
    }
    return text.trim();
}

async function generateAiAnalysis(prompt) {
    const provider = getAiProvider();
    if (provider === 'groq') return { analysis: await generateWithGroq(prompt), provider: 'groq' };
    if (provider === 'gemini') return { analysis: await generateWithGemini(prompt), provider: 'gemini' };
    const err = new Error(
        'No AI API key configured. Add GROQ_API_KEY (free at console.groq.com, no credit card) or GEMINI_API_KEY to .env'
    );
    err.statusCode = 503;
    throw err;
}

module.exports = {
    AI_FRAME_INSTRUCTIONS,
    buildAiPrompt,
    getAiProvider,
    generateAiAnalysis
};
