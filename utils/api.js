const normalizeTicker = (value) => {
    const ticker = String(value || '').trim().toUpperCase();
    return /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) ? ticker : null;
};

const normalizeCryptoQuery = (value) => {
    const query = String(value || '').trim();
    return /^[A-Za-z0-9 ._-]{1,64}$/.test(query) ? query : null;
};

const requireTicker = (req, res) => {
    const symbol = normalizeTicker(req.query.symbol ?? req.body?.ticker ?? req.body?.symbol);
    if (!symbol) {
        res.status(400).json({ error: 'Valid ticker symbol is required' });
        return null;
    }
    return symbol;
};

const parseMarketNumber = (value) => {
    if (value == null || value === '') return null;
    const parsed = Number(String(value).replace(/[%,$]/g, '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
};

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.text();
    try {
        return { response, data: JSON.parse(data) };
    } catch (error) {
        return { response, data: null };
    }
}

module.exports = {
    normalizeTicker,
    normalizeCryptoQuery,
    requireTicker,
    parseMarketNumber,
    fetchJson
};
