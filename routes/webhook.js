const express = require('express');
const router = express.Router();
const { addAlert, getAlerts } = require('../services/webhookStorage');
const { getFuturesTicker, getMarketInfo, placeFuturesOrder, fetchOpenPositions, fetchOpenOrders, cancelAllOrdersForSymbol } = require('../services/backpackApi');
const { normalizeSide, roundQuantity } = require('../utils/validation');
const { ORDER_TYPES } = require('../config/constants');
const Operation = require('../models/Operation');

// Constants for auto-trading
const POSITION_VALUE = 0.008; // token qty
const LEVERAGE = 20;
const TAKE_PROFIT_PERCENT = 0.0014;
const STOP_LOSS_PERCENT = 0.01;

/**
 * Determine trading direction from message
 * @param {string} message - Message text
 * @returns {string|null} - 'LONG' or 'SHORT' or null if not found
 */
function determineDirection(message) {
  if (!message || typeof message !== 'string') {
    return null;
  }
  
  const upperMessage = message.toUpperCase();
  if (upperMessage.includes('LONG')) {
    return 'LONG';
  } else if (upperMessage.includes('SHORT')) {
    return 'SHORT';
  }
  
  return null;
}

/**
 * Find existing position for a symbol
 * @param {Array} positions - Array of position objects
 * @param {string} symbol - Symbol to find
 * @returns {object|null} - Existing position or null
 */
function findExistingPosition(positions, symbol) {
  return positions.find(p => {
    const posSymbol = p.symbol || p.market;
    const netQuantity = parseFloat(p.netQuantity || p.netExposureQuantity || 0);
    return posSymbol === symbol && Math.abs(netQuantity) > 0;
  });
}

/**
 * Get position side (LONG or SHORT) from position object
 * @param {object} position - Position object
 * @returns {string} - 'LONG' or 'SHORT'
 */
function getPositionSide(position) {
  const netQuantity = parseFloat(position.netQuantity || position.netExposureQuantity || 0);
  return netQuantity > 0 ? 'LONG' : 'SHORT';
}

/**
 * Check if existing position is opposite to new direction
 * @param {object} existingPosition - Existing position object
 * @param {string} newDirection - New direction ('LONG' or 'SHORT')
 * @returns {boolean} - True if opposite
 */
function isOppositePosition(existingPosition, newDirection) {
  const existingSide = getPositionSide(existingPosition);
  return existingSide !== newDirection;
}

/**
 * Check if existing position is same direction as new direction
 * @param {object} existingPosition - Existing position object
 * @param {string} newDirection - New direction ('LONG' or 'SHORT')
 * @returns {boolean} - True if same direction
 */
function isSameDirectionPosition(existingPosition, newDirection) {
  const existingSide = getPositionSide(existingPosition);
  return existingSide === newDirection;
}

/**
 * GET /webhook
 * Retrieve all stored alerts
 */
router.get('/webhook', async (req, res) => {
  try {
    const alerts = await getAlerts();
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    res.status(500).json({ error: 'Failed to fetch webhooks' });
  }
});

/**
 * POST /webhook
 * Receive TradingView webhook alerts
 */
router.post('/webhook', (req, res) => {
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  let alertData = req.body;
  
  // Handle different body formats
  if (typeof alertData === 'string') {
    try {
      // Try to parse as JSON
      alertData = JSON.parse(alertData);
    } catch (e) {
      // If not JSON, try to wrap in {} if it looks like key-value pairs
      if (alertData.includes(':')) {
        try {
          alertData = JSON.parse('{' + alertData + '}');
        } catch (e2) {
          console.error('Failed to parse body:', alertData);
          alertData = {};
        }
      } else {
        alertData = {};
      }
    }
  }
  
  console.log('Received webhook:', alertData);
  
  // Extract trading parameters from webhook data
  const symbol = alertData.symbol || alertData.ticker || alertData.tickerSymbol;
  const message = alertData.message || alertData.text || alertData.alertMessage || '';
  const price = alertData.price ? parseFloat(alertData.price) : null;
  const positionSize = alertData.positionSize ? parseFloat(alertData.positionSize) : null;
  const leverage = alertData.leverageSize ? parseInt(alertData.leverageSize) : LEVERAGE;
  
  if(!positionSize) {
    console.error('[Webhook Auto-Trade] Missing position size in webhook data');
    return;
  }
  // Add alert with timestamp (async, don't wait)
  addAlert(alertData).catch(err => {
    console.error('Error saving webhook to database:', err);
  });
  
  // Auto-trade logic (runs asynchronously, doesn't block webhook response)
  (async () => {
    try {
      // Validate required fields
      if (!symbol) {
        console.error('[Webhook Auto-Trade] Missing symbol/ticker in webhook data');
        return;
      }
      
      // Determine direction from message
      const direction = determineDirection(message);
      if (!direction) {
        console.warn('[Webhook Auto-Trade] Message does not contain LONG or SHORT. Message:', message);
        return;
      }
      
      console.log('[Webhook Auto-Trade] Processing signal:', { symbol, direction, message, price });
      
      // Convert ticker to futures symbol format
      let futuresSymbol = symbol.toUpperCase();
      if (!futuresSymbol.includes('_USDC_PERP') && !futuresSymbol.includes('_USDT_PERP')) {
        futuresSymbol = `${futuresSymbol}_USDC_PERP`;
      }
      
      // Get current price if not provided
      let entryPrice = price;
      if (!entryPrice || isNaN(entryPrice) || entryPrice <= 0) {
        try {
          const tickerData = await getFuturesTicker(futuresSymbol);
          entryPrice = parseFloat(tickerData.lastPrice || tickerData.price || tickerData.close || tickerData.last);
          
          if (!entryPrice || isNaN(entryPrice) || entryPrice <= 0) {
            console.error('[Webhook Auto-Trade] Failed to get valid price from ticker data:', tickerData);
            return;
          }
          
          console.log('[Webhook Auto-Trade] Fetched current price:', entryPrice);
        } catch (priceError) {
          console.error('[Webhook Auto-Trade] Failed to fetch current price:', priceError.message);
          return;
        }
      }
      
      // Get market info for stepSize precision
      let stepSize = null;
      try {
        const marketInfo = await getMarketInfo(futuresSymbol);
        stepSize = marketInfo?.filters?.quantity?.stepSize || null;
        console.log('[Webhook Auto-Trade] Market stepSize:', stepSize);
      } catch (marketError) {
        console.warn('[Webhook Auto-Trade] Could not fetch market info, using default precision:', marketError.message);
      }
      
      // Calculate quantity: positionValue / price
      const quantity = positionSize || POSITION_VALUE;
      const roundedQuantity = roundQuantity(quantity, stepSize);
      
      if (roundedQuantity <= 0) {
        console.error('[Webhook Auto-Trade] Calculated quantity is too small:', { quantity, roundedQuantity, entryPrice });
        return;
      }
      
      // Determine side: LONG = Bid (buy), SHORT = Ask (sell)
      const side = normalizeSide(direction);
      
      // Check for existing positions before placing order
      let existingPosition = null;
      try {
        const positions = await fetchOpenPositions();
        existingPosition = findExistingPosition(positions, futuresSymbol);
        
        if (existingPosition) {
          const existingSide = getPositionSide(existingPosition);
          console.log('[Webhook Auto-Trade] Found existing position:', {
            symbol: futuresSymbol,
            existingSide,
            newDirection: direction,
            positionSize: Math.abs(parseFloat(existingPosition.netQuantity || existingPosition.netExposureQuantity || 0))
          });
          
          // Check if same direction
          if (isSameDirectionPosition(existingPosition, direction)) {
            console.log('[Webhook Auto-Trade] Position already exists in same direction. Skipping signal.');
            return; // Do nothing, skip the signal
          }
          
          // Check if opposite direction
          if (isOppositePosition(existingPosition, direction)) {
            console.log('[Webhook Auto-Trade] Opposite position detected. Closing existing position first...');
            
            // Step 1: Cancel all TP/SL orders for the symbol
            try {
              console.log('[Webhook Auto-Trade] Cancelling existing TP/SL orders...');
              await cancelAllOrdersForSymbol(futuresSymbol);
              console.log('[Webhook Auto-Trade] Successfully cancelled TP/SL orders');
            } catch (cancelError) {
              console.error('[Webhook Auto-Trade] Failed to cancel TP/SL orders:', cancelError.message);
              // Continue anyway - old TP/SL won't conflict if position is closed
            }
            
            // Step 2: Close existing position
            try {
              const existingSize = Math.abs(parseFloat(existingPosition.netQuantity || existingPosition.netExposureQuantity || 0));
              const closeSide = existingSide === 'LONG' ? 'Ask' : 'Bid'; // Opposite side to close
              
              console.log('[Webhook Auto-Trade] Closing existing position:', {
                symbol: futuresSymbol,
                side: closeSide,
                size: existingSize,
                existingDirection: existingSide
              });
              
              // Get stepSize for closing order quantity precision
              let closeStepSize = stepSize;
              if (!closeStepSize) {
                try {
                  const marketInfo = await getMarketInfo(futuresSymbol);
                  closeStepSize = marketInfo?.filters?.quantity?.stepSize || null;
                } catch (e) {
                  // Use existing stepSize or default
                }
              }
              
              const roundedCloseQuantity = roundQuantity(existingSize, closeStepSize);
              
              const closeOrderResult = await placeFuturesOrder(
                futuresSymbol,
                closeSide,
                ORDER_TYPES.MARKET,
                roundedCloseQuantity,
                null
              );
              
              console.log('[Webhook Auto-Trade] Position closed successfully:', closeOrderResult);
              
              // Brief wait to ensure position is closed (optional but recommended)
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Verify position is closed (optional)
              try {
                const updatedPositions = await fetchOpenPositions();
                const stillOpen = findExistingPosition(updatedPositions, futuresSymbol);
                if (stillOpen) {
                  const stillOpenSize = Math.abs(parseFloat(stillOpen.netQuantity || stillOpen.netExposureQuantity || 0));
                  if (stillOpenSize > 0.000001) { // Small threshold for floating point
                    console.warn('[Webhook Auto-Trade] Position may not be fully closed. Remaining size:', stillOpenSize);
                  }
                }
              } catch (verifyError) {
                console.warn('[Webhook Auto-Trade] Could not verify position closure:', verifyError.message);
                // Continue anyway
              }
              
            } catch (closeError) {
              console.error('[Webhook Auto-Trade] Failed to close existing position:', closeError.message);
              if (closeError.response) {
                console.error('[Webhook Auto-Trade] Close position error response:', closeError.response.data);
              }
              // Abort - don't create conflicting positions
              return;
            }
          }
        } else {
          console.log('[Webhook Auto-Trade] No existing position found. Proceeding with new position.');
        }
      } catch (positionCheckError) {
        console.error('[Webhook Auto-Trade] Error checking existing positions:', positionCheckError.message);
        // Fail-safe: continue with normal flow if position check fails
        console.warn('[Webhook Auto-Trade] Continuing with order placement despite position check error');
      }
      
      // Calculate TP and SL prices
      let tpTriggerPrice, slTriggerPrice, tpLimitPrice, slLimitPrice;
      if (direction === 'LONG') {
        // For LONG: TP at +2%, SL at -1%
        tpTriggerPrice = entryPrice * (1 + TAKE_PROFIT_PERCENT);
        slTriggerPrice = entryPrice * (1 - STOP_LOSS_PERCENT);
        // For conditional orders, limit prices should be the same as trigger prices for limit orders
        tpLimitPrice = tpTriggerPrice;
        slLimitPrice = slTriggerPrice;
      } else {
        // For SHORT: TP at -2% (entryPrice * 0.98), SL at +1% (entryPrice * 1.01)
        tpTriggerPrice = entryPrice * (1 - TAKE_PROFIT_PERCENT);
        slTriggerPrice = entryPrice * (1 + STOP_LOSS_PERCENT);
        // For conditional orders, limit prices should be the same as trigger prices for limit orders
        tpLimitPrice = tpTriggerPrice;
        slLimitPrice = slTriggerPrice;
      }
      
      // Prepare conditional orders for TP/SL
      const conditionalOrders = {
        takeProfitTriggerPrice: tpTriggerPrice,
        takeProfitLimitPrice: tpLimitPrice,
        takeProfitTriggerBy: 'LastPrice', // Can be LastPrice, MarkPrice, or IndexPrice
        stopLossTriggerPrice: slTriggerPrice,
        stopLossLimitPrice: slLimitPrice,
        stopLossTriggerBy: 'LastPrice' // Can be LastPrice, MarkPrice, or IndexPrice
      };
      
      console.log('[Webhook Auto-Trade] Conditional orders (TP/SL) configured:', {
        takeProfitTriggerPrice: tpTriggerPrice,
        takeProfitLimitPrice: tpLimitPrice,
        stopLossTriggerPrice: slTriggerPrice,
        stopLossLimitPrice: slLimitPrice
      });
      
      console.log('[Webhook Auto-Trade] Placing main order with conditional TP/SL:', {
        symbol: futuresSymbol,
        side,
        direction,
        quantity: roundedQuantity,
        entryPrice,
        orderType: ORDER_TYPES.MARKET,
        takeProfitTriggerPrice: tpTriggerPrice,
        stopLossTriggerPrice: slTriggerPrice
      });
      
      // Place main market order with conditional TP/SL orders
      let mainOrderResult;
      try {
        mainOrderResult = await placeFuturesOrder(
          futuresSymbol,
          side,
          ORDER_TYPES.MARKET,
          roundedQuantity,
          null, // No price for market orders
          conditionalOrders // Include TP/SL as conditional orders
        );
        
        console.log('[Webhook Auto-Trade] Main order with TP/SL placed successfully:', mainOrderResult);
        
        // Save operation to MongoDB
        try {
          const operation = new Operation({
            symbol: futuresSymbol,
            side: side,
            direction: direction,
            quantity: roundedQuantity,
            entryPrice: entryPrice,
            leverage: leverage,
            orderType: ORDER_TYPES.MARKET,
            orderId: mainOrderResult.id || mainOrderResult.orderId || mainOrderResult.order_id,
            orderCategory: 'MAIN',
            takeProfitPrice: tpTriggerPrice,
            stopLossPrice: slTriggerPrice,
            source: 'WEBHOOK',
            orderResponse: mainOrderResult
          });
          await operation.save();
          console.log('[Webhook Auto-Trade] Main operation with TP/SL saved to database');
        } catch (dbError) {
          console.error('[Webhook Auto-Trade] Failed to save main operation to database:', dbError);
          // Continue even if DB save fails
        }
      } catch (mainOrderError) {
        console.error('[Webhook Auto-Trade] Failed to place main order with TP/SL:', mainOrderError.message);
        if (mainOrderError.response) {
          console.error('[Webhook Auto-Trade] Main order error response:', mainOrderError.response.data);
        }
        return; // Don't continue if main order failed
      }
      
      console.log('[Webhook Auto-Trade] Auto-trading completed successfully');
    } catch (error) {
      console.error('[Webhook Auto-Trade] Unexpected error in auto-trading logic:', error.message);
      console.error('[Webhook Auto-Trade] Error stack:', error.stack);
      // Don't throw - we want to return 200 OK to webhook sender
    }
  })();
  
  res.status(200).send('OK');
});

module.exports = router;
