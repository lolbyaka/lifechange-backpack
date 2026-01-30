/**
 * Exchange factory. Returns the appropriate adapter instance based on EXCHANGE env var.
 * Only the factory and adapters are used by routes; backpackApi is used only by the Backpack adapter.
 */

const { getExchangeId, getExchangeConfig, getCredentials } = require('../../config/exchange');
const backpackAdapter = require('./backpackAdapter');
const { createCcxtAdapter } = require('./ccxtAdapter');

let cachedAdapter = null;

/**
 * Get the configured exchange adapter (singleton per process).
 * @returns {object} Adapter implementing the unified interface
 * @throws {Error} If EXCHANGE is unsupported or credentials are missing
 */
function getExchange() {
  if (cachedAdapter) {
    return cachedAdapter;
  }
  const exchangeId = getExchangeId();
  const config = getExchangeConfig(exchangeId);

  if (config.adapter === 'backpack') {
    cachedAdapter = backpackAdapter;
    return cachedAdapter;
  }

  if (config.adapter === 'ccxt') {
    const credentials = getCredentials(exchangeId);
    const options = {};
    if (process.env.CCXT_SANDBOX === 'true') {
      options.sandbox = true;
    }
    cachedAdapter = createCcxtAdapter(exchangeId, credentials, options);
    return cachedAdapter;
  }

  throw new Error(`Unknown adapter type: ${config.adapter} for exchange: ${exchangeId}`);
}

/**
 * Reset cached adapter (e.g. for tests or config change).
 */
function resetExchange() {
  cachedAdapter = null;
}

/**
 * Initialize exchange on app start: get adapter and call warmUp() so markets
 * are loaded (CCXT) before first request. Call this after DB connect, before listen.
 */
async function initExchange() {
  const adapter = getExchange();
  if (adapter.warmUp) {
    await adapter.warmUp();
    console.log('[Exchange] Markets preloaded');
  }
}

module.exports = {
  getExchange,
  resetExchange,
  initExchange
};
