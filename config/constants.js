require('dotenv').config();

// Backpack Exchange API configuration
const BACKPACK_API_URL = 'https://api.backpack.exchange';
const BACKPACK_API_KEY = process.env.BACKPACK_API_KEY; // Base64 encoded public key
const BACKPACK_SECRET_KEY = process.env.BACKPACK_SECRET_KEY; // Base64 encoded private key (seed)

// Server configuration
const PORT = process.env.PORT || 3000;

// Signature configuration
const DEFAULT_SIGNATURE_WINDOW = 5000;

// Leverage options
const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 50, 100];

// Position types
const POSITION_TYPES = {
  LONG: 'LONG',
  SHORT: 'SHORT'
};

// Order types
const ORDER_TYPES = {
  MARKET: 'Market',
  LIMIT: 'Limit'
};

// API instruction strings
const API_INSTRUCTIONS = {
  BALANCE_QUERY: 'balanceQuery',
  COLLATERAL_QUERY: 'collateralQuery',
  ORDER_EXECUTE: 'orderExecute',
  POSITIONS_QUERY: 'positionQuery'
};

// Side mappings
const SIDE_MAPPING = {
  LONG: 'Bid',
  SHORT: 'Ask'
};

module.exports = {
  BACKPACK_API_URL,
  BACKPACK_API_KEY,
  BACKPACK_SECRET_KEY,
  PORT,
  DEFAULT_SIGNATURE_WINDOW,
  LEVERAGE_OPTIONS,
  POSITION_TYPES,
  ORDER_TYPES,
  API_INSTRUCTIONS,
  SIDE_MAPPING
};
