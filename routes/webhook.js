const express = require('express');
const router = express.Router();
const { addAlert, getAlerts } = require('../services/webhookStorage');
const { getFuturesTicker, getMarketInfo, placeFuturesOrder } = require('../services/backpackApi');
const { normalizeSide, roundQuantity } = require('../utils/validation');
const { ORDER_TYPES } = require('../config/constants');
const Operation = require('../models/Operation');

// Constants for auto-trading
const POSITION_VALUE = 0.0034; // USD
const LEVERAGE = 20;
const TAKE_PROFIT_PERCENT = 0.02; // 2%
const STOP_LOSS_PERCENT = 0.06; // 6%

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
      
      console.log('[Webhook Auto-Trade] Placing main order:', {
        symbol: futuresSymbol,
        side,
        direction,
        quantity: roundedQuantity,
        entryPrice,
        orderType: ORDER_TYPES.MARKET
      });
      
      // Place main market order
      let mainOrderResult;
      try {
        mainOrderResult = await placeFuturesOrder(
          futuresSymbol,
          side,
          ORDER_TYPES.MARKET,
          roundedQuantity,
          null // No price for market orders
        );
        
        console.log('[Webhook Auto-Trade] Main order placed successfully:', mainOrderResult);
        
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
            takeProfitPrice: null,
            stopLossPrice: null,
            source: 'WEBHOOK',
            orderResponse: mainOrderResult
          });
          await operation.save();
          console.log('[Webhook Auto-Trade] Main operation saved to database');
        } catch (dbError) {
          console.error('[Webhook Auto-Trade] Failed to save main operation to database:', dbError);
          // Continue even if DB save fails
        }
      } catch (mainOrderError) {
        console.error('[Webhook Auto-Trade] Failed to place main order:', mainOrderError.message);
        if (mainOrderError.response) {
          console.error('[Webhook Auto-Trade] Main order error response:', mainOrderError.response.data);
        }
        return; // Don't continue with TP/SL if main order failed
      }
      
      // Calculate TP and SL prices
      let tpPrice, slPrice;
      if (direction === 'LONG') {
        // For LONG: TP at +2%, SL at -6%
        tpPrice = entryPrice * (1 + TAKE_PROFIT_PERCENT);
        slPrice = entryPrice * (1 - STOP_LOSS_PERCENT);
      } else {
        // For SHORT: TP at +2% (entryPrice * 0.98), SL at -6% (entryPrice * 1.06)
        tpPrice = entryPrice * (1 - TAKE_PROFIT_PERCENT);
        slPrice = entryPrice * (1 + STOP_LOSS_PERCENT);
      }
      
      // TP and SL use opposite side to close the position
      const tpSlSide = direction === 'LONG' ? 'Ask' : 'Bid';
      
      // Place Take Profit order
      try {
        console.log('[Webhook Auto-Trade] Placing Take Profit order:', {
          symbol: futuresSymbol,
          side: tpSlSide,
          price: tpPrice,
          quantity: roundedQuantity,
          orderType: ORDER_TYPES.LIMIT
        });
        
        const tpOrderResult = await placeFuturesOrder(
          futuresSymbol,
          tpSlSide,
          ORDER_TYPES.LIMIT,
          roundedQuantity,
          tpPrice
        );
        
        console.log('[Webhook Auto-Trade] Take Profit order placed successfully:', tpOrderResult);
        
        // Save TP operation to MongoDB
        try {
          const tpOperation = new Operation({
            symbol: futuresSymbol,
            side: tpSlSide,
            direction: direction,
            quantity: roundedQuantity,
            entryPrice: entryPrice,
            leverage: leverage,
            orderType: ORDER_TYPES.LIMIT,
            orderId: tpOrderResult.id || tpOrderResult.orderId || tpOrderResult.order_id,
            orderCategory: 'TAKE_PROFIT',
            takeProfitPrice: tpPrice,
            stopLossPrice: null,
            source: 'WEBHOOK',
            orderResponse: tpOrderResult
          });
          await tpOperation.save();
          console.log('[Webhook Auto-Trade] TP operation saved to database');
        } catch (dbError) {
          console.error('[Webhook Auto-Trade] Failed to save TP operation to database:', dbError);
        }
      } catch (tpError) {
        console.error('[Webhook Auto-Trade] Failed to place Take Profit order:', tpError.message);
        if (tpError.response) {
          console.error('[Webhook Auto-Trade] TP order error response:', tpError.response.data);
        }
        // Continue even if TP fails
      }
      
      // Place Stop Loss order
      try {
        console.log('[Webhook Auto-Trade] Placing Stop Loss order:', {
          symbol: futuresSymbol,
          side: tpSlSide,
          price: slPrice,
          quantity: roundedQuantity,
          orderType: ORDER_TYPES.LIMIT
        });
        
        const slOrderResult = await placeFuturesOrder(
          futuresSymbol,
          tpSlSide,
          ORDER_TYPES.LIMIT,
          roundedQuantity,
          slPrice
        );
        
        console.log('[Webhook Auto-Trade] Stop Loss order placed successfully:', slOrderResult);
        
        // Save SL operation to MongoDB
        try {
          const slOperation = new Operation({
            symbol: futuresSymbol,
            side: tpSlSide,
            direction: direction,
            quantity: roundedQuantity,
            entryPrice: entryPrice,
            leverage: leverage,
            orderType: ORDER_TYPES.LIMIT,
            orderId: slOrderResult.id || slOrderResult.orderId || slOrderResult.order_id,
            orderCategory: 'STOP_LOSS',
            takeProfitPrice: null,
            stopLossPrice: slPrice,
            source: 'WEBHOOK',
            orderResponse: slOrderResult
          });
          await slOperation.save();
          console.log('[Webhook Auto-Trade] SL operation saved to database');
        } catch (dbError) {
          console.error('[Webhook Auto-Trade] Failed to save SL operation to database:', dbError);
        }
      } catch (slError) {
        console.error('[Webhook Auto-Trade] Failed to place Stop Loss order:', slError.message);
        if (slError.response) {
          console.error('[Webhook Auto-Trade] SL order error response:', slError.response.data);
        }
        // Continue even if SL fails
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
