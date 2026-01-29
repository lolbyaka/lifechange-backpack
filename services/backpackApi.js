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
 * Fetch open orders from Backpack Exchange
 * @param {string} symbol - Futures symbol (optional, if not provided fetches all orders)
 * @returns {Promise<Array>} - Array of open order objects
 */
async function fetchOpenOrders(symbol = null) {
  try {
    const params = {};
    if (symbol) {
      params.symbol = symbol;
    }
    
    const { signature, timestamp, window, apiKey } = await signRequest(API_INSTRUCTIONS.ORDER_QUERY, params);
    
    const response = await axios.get(`${BACKPACK_API_URL}/api/v1/orders`, {
      params,
      headers: {
        'X-API-KEY': apiKey,
        'X-SIGNATURE': signature,
        'X-TIMESTAMP': timestamp.toString(),
        'X-WINDOW': window.toString()
      }
    });
    
    // API returns an array of orders
    return response.data || [];
  } catch (error) {
    console.error('Error fetching open orders from Backpack Exchange:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Cancel a specific order on Backpack Exchange
 * @param {string} orderId - Order ID to cancel
 * @param {string} symbol - Futures symbol
 * @returns {Promise<object>} - Cancellation response
 */
async function cancelOrder(orderId, symbol) {
  try {
    if (!orderId || !symbol) {
      throw new Error('orderId and symbol are required to cancel an order');
    }
    
    const cancelParams = {
      orderId: orderId.toString(),
      symbol: symbol
    };
    
    const { signature, timestamp, window, apiKey } = await signRequest(API_INSTRUCTIONS.ORDER_CANCEL, cancelParams);
    
    const response = await axios.delete(`${BACKPACK_API_URL}/api/v1/order`, {
      params: cancelParams,
      headers: {
        'X-API-KEY': apiKey,
        'X-SIGNATURE': signature,
        'X-TIMESTAMP': timestamp.toString(),
        'X-WINDOW': window.toString()
      }
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error cancelling order ${orderId} for ${symbol}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Cancel all open orders for a specific symbol
 * @param {string} symbol - Futures symbol
 * @returns {Promise<Array>} - Array of cancellation results
 */
async function cancelAllOrdersForSymbol(symbol) {
  try {
    // Fetch all open orders for the symbol
    const openOrders = await fetchOpenOrders(symbol);
    
    if (!openOrders || openOrders.length === 0) {
      console.log(`[Cancel Orders] No open orders found for ${symbol}`);
      return [];
    }
    
    console.log(`[Cancel Orders] Found ${openOrders.length} open order(s) for ${symbol}`);
    
    // Cancel each order
    const cancelResults = [];
    for (const order of openOrders) {
      const orderId = order.id || order.orderId || order.order_id;
      if (!orderId) {
        console.warn(`[Cancel Orders] Order missing ID, skipping:`, order);
        continue;
      }
      
      try {
        const result = await cancelOrder(orderId, symbol);
        cancelResults.push({ orderId, success: true, result });
        console.log(`[Cancel Orders] Successfully cancelled order ${orderId} for ${symbol}`);
      } catch (error) {
        cancelResults.push({ orderId, success: false, error: error.message });
        console.error(`[Cancel Orders] Failed to cancel order ${orderId}:`, error.message);
        // Continue cancelling other orders even if one fails
      }
    }
    
    return cancelResults;
  } catch (error) {
    console.error(`Error cancelling all orders for ${symbol}:`, error.message);
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
 * @param {object|null} conditionalOrders - Optional conditional orders (TP/SL)
 * @param {string|null} conditionalOrders.takeProfitTriggerPrice - TP trigger price
 * @param {string|null} conditionalOrders.takeProfitLimitPrice - TP limit price (optional, if not set will be market)
 * @param {string|null} conditionalOrders.takeProfitTriggerBy - TP trigger by (LastPrice, MarkPrice, IndexPrice)
 * @param {string|null} conditionalOrders.stopLossTriggerPrice - SL trigger price
 * @param {string|null} conditionalOrders.stopLossLimitPrice - SL limit price (optional, if not set will be market)
 * @param {string|null} conditionalOrders.stopLossTriggerBy - SL trigger by (LastPrice, MarkPrice, IndexPrice)
 * @param {boolean} reduceOnly - If true, order can only reduce position (futures). Use for TP/SL to avoid opening opposite.
 * @returns {Promise<object>} - Order response
 */
async function placeFuturesOrder(symbol, side, orderType, quantity, price = null, conditionalOrders = null, reduceOnly = false) {
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

    // Reduce-only: order can only close/reduce position, never open opposite (required for TP/SL closing orders)
    if (reduceOnly) {
      orderParams.reduceOnly = true;
    }

    // Add conditional orders (TP/SL) if provided
    if (conditionalOrders) {
      if (conditionalOrders.takeProfitTriggerPrice) {
        orderParams.takeProfitTriggerPrice = conditionalOrders.takeProfitTriggerPrice.toString();
        if (conditionalOrders.takeProfitLimitPrice) {
          orderParams.takeProfitLimitPrice = conditionalOrders.takeProfitLimitPrice.toString();
        }
        if (conditionalOrders.takeProfitTriggerBy) {
          orderParams.takeProfitTriggerBy = conditionalOrders.takeProfitTriggerBy;
        }
      }
      if (conditionalOrders.stopLossTriggerPrice) {
        orderParams.stopLossTriggerPrice = conditionalOrders.stopLossTriggerPrice.toString();
        if (conditionalOrders.stopLossLimitPrice) {
          orderParams.stopLossLimitPrice = conditionalOrders.stopLossLimitPrice.toString();
        }
        if (conditionalOrders.stopLossTriggerBy) {
          orderParams.stopLossTriggerBy = conditionalOrders.stopLossTriggerBy;
        }
      }
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

/**
 * Place a conditional (trigger) futures order - executes as Market when trigger price is hit.
 * Used for TP/SL on an existing position (reduce-only).
 * @param {string} symbol - Futures symbol
 * @param {string} side - Order side (Bid or Ask) - use opposite of position to close (Ask for LONG, Bid for SHORT)
 * @param {number|string} quantity - Order quantity (position size to close)
 * @param {number|string} triggerPrice - Price at which the order triggers
 * @param {string} triggerBy - Reference price: LastPrice, MarkPrice, or IndexPrice
 * @param {boolean} reduceOnly - If true, order can only reduce position (default true for TP/SL)
 * @returns {Promise<object>} - Order response
 */
async function placeFuturesTriggerOrder(symbol, side, quantity, triggerPrice, triggerBy = 'MarkPrice', reduceOnly = true) {
  try {
    const normalizedSide = side.charAt(0).toUpperCase() + side.slice(1).toLowerCase();
    if (normalizedSide !== 'Bid' && normalizedSide !== 'Ask') {
      throw new Error(`side must be "Bid" or "Ask". Received: ${side}`);
    }

    const orderParams = {
      symbol,
      side: normalizedSide,
      orderType: 'Market',
      quantity: quantity.toString(),
      triggerPrice: triggerPrice.toString(),
      triggerQuantity: quantity.toString(),
      triggerBy: triggerBy || 'MarkPrice',
      reduceOnly: reduceOnly !== false
    };

    const signingParams = { ...orderParams };
    const { signature, timestamp, window, apiKey } = await signRequest(API_INSTRUCTIONS.ORDER_EXECUTE, signingParams);

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
    console.error('Error placing futures trigger order:', error.message);
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
  placeFuturesTriggerOrder,
  fetchOpenPositions,
  fetchOpenOrders,
  cancelOrder,
  cancelAllOrdersForSymbol
};
