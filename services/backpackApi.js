const axios = require('axios');
const { BACKPACK_API_URL, API_INSTRUCTIONS } = require('../config/constants');
const { signRequest } = require('../utils/signature');
const { normalizeOrderType } = require('../utils/validation');

/**
 * Fetch balances from Backpack Exchange
 * @returns {Promise<object>} - Balance data
 */
async function fetchBackpackBalances() {
  try {
    const { signature, timestamp, window, apiKey } = await signRequest(API_INSTRUCTIONS.BALANCE_QUERY);
    
    const response = await axios.get(`${BACKPACK_API_URL}/api/v1/capital`, {
      headers: {
        'X-API-KEY': apiKey,
        'X-SIGNATURE': signature,
        'X-TIMESTAMP': timestamp.toString(),
        'X-WINDOW': window.toString()
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching balances from Backpack Exchange:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Fetch collateral/margin information
 * @returns {Promise<object>} - Collateral data
 */
async function fetchCollateralInfo() {
  try {
    const { signature, timestamp, window, apiKey } = await signRequest(API_INSTRUCTIONS.COLLATERAL_QUERY);
    
    const response = await axios.get(`${BACKPACK_API_URL}/api/v1/capital/collateral`, {
      headers: {
        'X-API-KEY': apiKey,
        'X-SIGNATURE': signature,
        'X-TIMESTAMP': timestamp.toString(),
        'X-WINDOW': window.toString()
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching collateral info:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Get ticker price for a futures symbol
 * @param {string} symbol - Futures symbol (e.g., ETH_USDC_PERP)
 * @returns {Promise<object>} - Ticker data
 */
async function getFuturesTicker(symbol) {
  try {
    const response = await axios.get(`${BACKPACK_API_URL}/api/v1/ticker`, {
      params: { symbol }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ticker for ${symbol}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Get list of available futures markets
 * @returns {Promise<Array>} - Array of futures market objects
 */
async function getFuturesMarkets() {
  try {
    // Request all markets, we'll filter for PERP (perpetual futures) in the response
    const response = await axios.get(`${BACKPACK_API_URL}/api/v1/markets`);
    
    // Filter for PERP (perpetual futures) markets that are visible
    const futuresMarkets = (response.data || []).filter(market => 
      market.marketType === 'PERP' && market.visible !== false
    );
    
    return futuresMarkets;
  } catch (error) {
    console.error('Error fetching futures markets:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Get market information including stepSize for quantity precision
 * @param {string} symbol - Futures symbol
 * @returns {Promise<object>} - Market information
 */
async function getMarketInfo(symbol) {
  try {
    const response = await axios.get(`${BACKPACK_API_URL}/api/v1/market`, {
      params: { symbol }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching market info for ${symbol}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Fetch open positions from Backpack Exchange
 * @returns {Promise<Array>} - Array of open position objects
 */
async function fetchOpenPositions() {
  try {
    const { signature, timestamp, window, apiKey } = await signRequest(API_INSTRUCTIONS.POSITIONS_QUERY);
    
    const response = await axios.get(`${BACKPACK_API_URL}/api/v1/position`, {
      headers: {
        'X-API-KEY': apiKey,
        'X-SIGNATURE': signature,
        'X-TIMESTAMP': timestamp.toString(),
        'X-WINDOW': window.toString()
      }
    });
    
    // API returns an array of positions
    return response.data || [];
  } catch (error) {
    console.error('Error fetching open positions from Backpack Exchange:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Place a futures order on Backpack Exchange
 * @param {string} symbol - Futures symbol
 * @param {string} side - Order side (Bid or Ask)
 * @param {string} orderType - Order type (Market or Limit)
 * @param {number|string} quantity - Order quantity
 * @param {number|string|null} price - Order price (required for Limit orders)
 * @returns {Promise<object>} - Order response
 */
async function placeFuturesOrder(symbol, side, orderType, quantity, price = null) {
  try {
    // Validate side - API expects "Bid" or "Ask" (not "Buy" or "Sell")
    if (!side || typeof side !== 'string') {
      throw new Error(`side is required and must be a string. Received: ${side}`);
    }
    
    // Ensure side is exactly "Bid" or "Ask"
    const normalizedSide = side.charAt(0).toUpperCase() + side.slice(1).toLowerCase();
    if (normalizedSide !== 'Bid' && normalizedSide !== 'Ask') {
      throw new Error(`side must be "Bid" or "Ask". Received: ${side}`);
    }
    
    // Build order parameters - ensure all values are strings for consistent signing
    const normalizedOrderType = normalizeOrderType(orderType);
    
    const orderParams = {
      symbol,
      side: normalizedSide, // "Bid" for LONG (buy), "Ask" for SHORT (sell)
      orderType: normalizedOrderType, // "Market" or "Limit" (capitalized)
      quantity: quantity.toString()
    };

    // Add price for limit orders
    if (normalizedOrderType === 'Limit' && price) {
      orderParams.price = price.toString();
    }
    
    console.log('Order params before signing:', JSON.stringify(orderParams, null, 2));

    // Use the same format for both signature and body (camelCase)
    const signingParams = { ...orderParams };
    
    // Sign the POST request
    const { signature, timestamp, window, apiKey } = await signRequest(API_INSTRUCTIONS.ORDER_EXECUTE, signingParams);
    
    console.log('Order params to send:', JSON.stringify(orderParams, null, 2));
    console.log('Signing params used:', JSON.stringify(signingParams, null, 2));
    console.log('Signature headers:', {
      'X-API-KEY': apiKey,
      'X-SIGNATURE': signature.substring(0, 20) + '...', // Log only first 20 chars for security
      'X-TIMESTAMP': timestamp.toString(),
      'X-WINDOW': window.toString()
    });
    
    // Place the order - send params as JSON body
    const response = await axios.post(`${BACKPACK_API_URL}/api/v1/order`, orderParams, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
        'X-SIGNATURE': signature,
        'X-TIMESTAMP': timestamp.toString(),
        'X-WINDOW': window.toString()
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error placing futures order:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

module.exports = {
  fetchBackpackBalances,
  fetchCollateralInfo,
  getFuturesTicker,
  getFuturesMarkets,
  getMarketInfo,
  placeFuturesOrder,
  fetchOpenPositions
};
