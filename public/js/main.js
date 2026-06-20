import { loadDashboard } from './modules/equity.js';
import { setupCryptoTracker } from './modules/crypto.js';
import { setupInflationTracker } from './modules/macro.js';
import { setupAiAdvisor } from './modules/ai.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Core Equity Dashboard
    loadDashboard();

    // 2. Crypto Tracker
    setupCryptoTracker();

    // 3. Macro & Inflation
    setupInflationTracker();

    // 4. AI Advisor
    setupAiAdvisor();
});
