/**
 * Exchange factory. Returns the appropriate adapter instance based on EXCHANGE env var.
 * All exchanges (including Backpack) use the CCXT adapter.
 * For Backpack with BACKPACK_ACCOUNTS set, adapters are cached per account name.
 */

const { getExchangeId, getExchangeConfig, getCredentials, getBackpackAccountList } = require('../../config/exchange');
const { createCcxtAdapter } = require('./ccxtAdapter');

/** Cache key: '' for single-account exchanges; account name for Backpack multi-account */
const cachedAdapters = {};

/**
 * Resolve which account to use for the current exchange (Backpack multi-account only).
 * @returns {string|null} Account name or null if single-account
 */
function resolveAccountKey(accountName) {
  const exchangeId = getExchangeId();
  if (exchangeId !== 'backpack') return '';
  const accounts = getBackpackAccountList();
  if (accounts.length === 0) return '';
  return accountName != null ? String(accountName).trim() : accounts[0];
}

/**
 * Get the configured exchange adapter. For Backpack with multiple accounts, pass
 * accountName to get the adapter for that account; otherwise uses first account or single adapter.
 * @param {string} [accountName] - For Backpack multi-account: 'main', 'sub', etc. Ignored for other exchanges.
 * @returns {object} Adapter implementing the unified interface
 * @throws {Error} If EXCHANGE is unsupported or credentials are missing
 */
function getExchange(accountName) {
  const cacheKey = resolveAccountKey(accountName);
  if (cachedAdapters[cacheKey]) {
    return cachedAdapters[cacheKey];
  }
  const exchangeId = getExchangeId();
  const config = getExchangeConfig(exchangeId);

  if (config.adapter === 'ccxt') {
    const credentials = getCredentials(exchangeId, cacheKey || undefined);
    const options = {};
    if (process.env.CCXT_SANDBOX === 'true') {
      options.sandbox = true;
    }
    const adapter = createCcxtAdapter(exchangeId, credentials, options);
    cachedAdapters[cacheKey] = adapter;
    return adapter;
  }

  throw new Error(`Unknown adapter type: ${config.adapter} for exchange: ${exchangeId}`);
}

/**
 * Reset cached adapters (e.g. for tests or config change).
 */
function resetExchange() {
  Object.keys(cachedAdapters).forEach(k => delete cachedAdapters[k]);
}

/**
 * Initialize exchange on app start: get adapter(s) and call warmUp() so markets
 * are loaded (CCXT) before first request. For Backpack multi-account, warms up all accounts.
 */
async function initExchange() {
  const exchangeId = getExchangeId();
  const accounts = getBackpackAccountList();
  if (exchangeId === 'backpack' && accounts.length > 0) {
    for (const account of accounts) {
      const adapter = getExchange(account);
      if (adapter.warmUp) {
        await adapter.warmUp();
      }
      console.log('[Exchange] Markets preloaded for account:', account);
    }
  } else {
    const adapter = getExchange();
    if (adapter.warmUp) {
      await adapter.warmUp();
      console.log('[Exchange] Markets preloaded');
    }
  }
}

module.exports = {
  getExchange,
  resetExchange,
  initExchange
};
