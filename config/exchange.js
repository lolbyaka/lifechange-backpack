require('dotenv').config();

/**
 * Supported exchange IDs and their env var names for API credentials.
 * Used by the exchange factory to instantiate the correct adapter.
 */
const EXCHANGE_ENV = {
  backpack: {
    apiKey: 'BACKPACK_API_KEY',
    secret: 'BACKPACK_SECRET_KEY',
    adapter: 'ccxt'
  },
  binance: {
    apiKey: 'BINANCE_APIKEY',
    secret: 'BINANCE_SECRET',
    adapter: 'ccxt'
  },
  bybit: {
    apiKey: 'BYBIT_APIKEY',
    secret: 'BYBIT_SECRET',
    adapter: 'ccxt'
  },
  okx: {
    apiKey: 'OKX_APIKEY',
    secret: 'OKX_SECRET',
    passphrase: 'OKX_PASSPHRASE',
    adapter: 'ccxt'
  },
  kraken: {
    apiKey: 'KRAKEN_API_KEY',
    secret: 'KRAKEN_SECRET',
    adapter: 'ccxt'
  },
  hyperliquid: {
    apiKey: 'HYPERLIQUID_APIKEY',
    secret: 'HYPERLIQUID_SECRET',
    adapter: 'ccxt'
  }
};

const DEFAULT_EXCHANGE = 'backpack';

function getExchangeId() {
  return (process.env.EXCHANGE || DEFAULT_EXCHANGE).toLowerCase().trim();
}

function getExchangeConfig(exchangeId) {
  const id = (exchangeId || getExchangeId()).toLowerCase();
  const config = EXCHANGE_ENV[id];
  if (!config) {
    throw new Error(
      `Unsupported exchange: ${id}. Supported: ${Object.keys(EXCHANGE_ENV).join(', ')}. Set EXCHANGE env var.`
    );
  }
  return { exchangeId: id, ...config };
}

/**
 * Parse BACKPACK_ACCOUNTS env (e.g. "main,sub" -> ['main','sub']).
 * Used for Backpack multi-account; other exchanges are single-account.
 * @returns {string[]} Account names or empty array if not set
 */
function getBackpackAccountList() {
  const raw = process.env.BACKPACK_ACCOUNTS;
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Get credentials for the exchange. For Backpack with BACKPACK_ACCOUNTS set,
 * pass accountName to use per-account keys (BACKPACK_<NAME>_API_KEY / _SECRET_KEY).
 * @param {string} exchangeId - e.g. 'backpack', 'binance'
 * @param {string} [accountName] - For Backpack multi-account only; e.g. 'main', 'sub'
 * @returns {{ apiKey: string, secret: string, password?: string }}
 */
function getCredentials(exchangeId, accountName) {
  const config = getExchangeConfig(exchangeId);

  // Backpack multi-account: BACKPACK_ACCOUNTS=main,sub and BACKPACK_MAIN_*, BACKPACK_SUB_*
  if (exchangeId === 'backpack') {
    const accounts = getBackpackAccountList();
    if (accounts.length > 0) {
      const name = accountName != null ? String(accountName).trim() : accounts[0];
      if (!accounts.includes(name)) {
        throw new Error(
          `Unknown Backpack account "${name}". Allowed: ${accounts.join(', ')}.`
        );
      }
      const envKey = 'BACKPACK_' + name.toUpperCase().replace(/-/g, '_');
      const apiKey = process.env[envKey + '_API_KEY'];
      const secret = process.env[envKey + '_SECRET_KEY'];
      if (!apiKey || !secret) {
        throw new Error(
          `Missing credentials for Backpack account "${name}". Set ${envKey}_API_KEY and ${envKey}_SECRET_KEY in .env.`
        );
      }
      return { apiKey, secret };
    }
    // Backpack single-account (legacy): BACKPACK_API_KEY / BACKPACK_SECRET_KEY
    const apiKey = process.env[config.apiKey];
    const secret = process.env[config.secret];
    if (!apiKey || !secret) {
      throw new Error(
        `Missing credentials for exchange "${config.exchangeId}". Set ${config.apiKey} and ${config.secret} in .env.`
      );
    }
    return { apiKey, secret };
  }

  // Other exchanges: single-account, ignore accountName
  const apiKey = process.env[config.apiKey];
  const secret = process.env[config.secret];
  if (!apiKey || !secret) {
    throw new Error(
      `Missing credentials for exchange "${config.exchangeId}". Set ${config.apiKey} and ${config.secret} (and ${config.passphrase || 'PASSPHRASE'} if required) in .env.`
    );
  }
  const credentials = { apiKey, secret };
  if (config.passphrase && process.env[config.passphrase]) {
    credentials.password = process.env[config.passphrase];
  }
  return credentials;
}

module.exports = {
  EXCHANGE_ENV,
  DEFAULT_EXCHANGE,
  getExchangeId,
  getExchangeConfig,
  getCredentials,
  getBackpackAccountList
};
