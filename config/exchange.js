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

function getCredentials(exchangeId) {
  const config = getExchangeConfig(exchangeId);
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
  getCredentials
};
