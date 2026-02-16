const express = require('express');
const router = express.Router();
const { addAlert, getAlerts } = require('../services/webhookStorage');
const { getExchange } = require('../services/exchange/factory');
const { getExchangeId, getBackpackAccountList } = require('../config/exchange');
const { normalizeSide, roundQuantity, roundPrice } = require('../utils/validation');
const { ORDER_TYPES } = require('../config/constants');
const Operation = require('../models/Operation');

const webhookTypes = {
  SIGNAL: 'signal',
  LINE_CHANGE: 'lineChange'
}
const lastDirectionByTicker = {

}

const momentumLineByTicker = {}
// Constants for auto-trading
const LEVERAGE = 20;
// ROI-based TP/SL (e.g. 20 = 20% ROI for TP, 10 = 10% ROI for SL)
const TP_ROI_PERCENT = 20;
const SL_ROI_PERCENT = 10;

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
  console.log('findExistingPosition', positions, symbol);
  return positions.find(p => {
    const posSymbol = p.market || p.symbol;
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
  const webhookType = alertData.webhookType || webhookTypes.SIGNAL;
  const futuresSymbol = alertData.symbol;
  // const message = alertData.message;
  const alertSL_ROI_PERCENT = alertData.slROI ? parseFloat(alertData.slROI) : SL_ROI_PERCENT;
  const alertTP_ROI_PERCENT = alertData.tpROI ? parseFloat(alertData.tpROI) : TP_ROI_PERCENT;
  const longMALine = alertData.longMALine ? parseFloat(alertData.longMALine) : null;
  const crossMASignalDown = alertData.crossMASignalDown ? parseFloat(alertData.crossMASignalDown) : null;
  const crossMASignalUp = alertData.crossMASignalUp ? parseFloat(alertData.crossMASignalUp) : null;
  const momentumLine = alertData.momentumLine ? parseFloat(alertData.momentumLine) : null;
  const MALine = alertData.MALine ? parseFloat(alertData.MALine) : null;
  const positionSize = alertData.positionSize ? parseFloat(alertData.positionSize) : null;
  const leverage = alertData.leverageSize ? parseInt(alertData.leverageSize) : LEVERAGE;
  const accountName = alertData.name || alertData.account || null;

  if(!longMALine || !crossMASignalDown || !crossMASignalUp || !momentumLine || !MALine) {
    console.error('[Webhook Auto-Trade] Missing long MALine or cross MASignal in webhook data');
    return;
  }

  console.log('longMALine', longMALine);
  console.log('crossMASignalDown', crossMASignalDown);
  console.log('crossMASignalUp', crossMASignalUp);
  console.log('momentumLine', momentumLine);
  console.log('MALine', MALine);

  let message = null;

  if(Number(momentumLine) > Number(longMALine) && crossMASignalUp === 1) {
    message = 'LONG';
  } else if(Number(momentumLine) < Number(longMALine) && crossMASignalDown === 1) {
    message = 'SHORT';
  }
  
  if(!positionSize) {
    console.error('[Webhook Auto-Trade] Missing position size in webhook data');
    return;
  }


  // Resolve account for multi-account (Backpack only)
  const exchangeId = getExchangeId();
  const backpackAccounts = getBackpackAccountList();
  const isBackpackMultiAccount = exchangeId === 'backpack' && backpackAccounts.length > 0;
  if (isBackpackMultiAccount && accountName != null && String(accountName).trim() !== '') {
    const trimmed = String(accountName).trim();
    if (!backpackAccounts.includes(trimmed)) {
      res.status(400).json({
        error: `Unknown account '${accountName}'. Allowed: ${backpackAccounts.join(', ')}.`
      });
      return;
    }
  }
  const effectiveAccount = isBackpackMultiAccount
    ? (accountName && backpackAccounts.includes(String(accountName).trim()) ? String(accountName).trim() : backpackAccounts[0])
    : undefined;

  // Add alert with timestamp (async, don't wait)
  addAlert(alertData).catch(err => {
    console.error('Error saving webhook to database:', err);
  });
  
  // Auto-trade logic (runs asynchronously, doesn't block webhook response)
  (async () => {
    try {
      const direction = determineDirection(message);
      if (!direction) {
        console.warn('[Webhook Auto-Trade] Message does not contain LONG or SHORT. Message:', message);
        return;
      }
      
      console.log('[Webhook Auto-Trade] Processing signal:', { futuresSymbol, direction, message });
      
      // Get current price if not provided
      let entryPrice;

      try {
        const exchange = getExchange(effectiveAccount);
        const tickerData = await exchange.getTicker(futuresSymbol);
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
      
      
      // Get market info for stepSize and tickSize precision
      let stepSize = null;
      let tickSize = null;
      try {
        const exchange = getExchange(effectiveAccount);
        const marketInfo = await exchange.getMarketInfo(futuresSymbol);
        stepSize = marketInfo?.filters?.quantity?.stepSize || null;
        tickSize = marketInfo?.filters?.price?.tickSize || null;
        console.log('[Webhook Auto-Trade] Market stepSize:', stepSize, 'tickSize:', tickSize);
      } catch (marketError) {
        console.warn('[Webhook Auto-Trade] Could not fetch market info, using default precision:', marketError.message);
      }
      
      // Calculate quantity: positionValue / price
      const quantity = positionSize;
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
        const exchange = getExchange(effectiveAccount);
        const positions = await exchange.fetchPositions();
        existingPosition = findExistingPosition(positions, futuresSymbol);

        if(lastDirectionByTicker[futuresSymbol] === direction) {
          return;
        }
        
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
            return; // Do nothing, skip the signal
          }
          
          // Check if opposite direction
          if (isOppositePosition(existingPosition, direction)) {            
            try {
              console.log('[Webhook Auto-Trade] Cancelling existing TP/SL orders...');
              const exchange = getExchange(effectiveAccount);
              await exchange.cancelAllOrders(futuresSymbol);
              console.log('[Webhook Auto-Trade] Successfully cancelled TP/SL orders');
            } catch (cancelError) {
              console.error('[Webhook Auto-Trade] Failed to cancel TP/SL orders:', cancelError.message);
              // Continue anyway - old TP/SL won't conflict if position is closed
            }
            
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
                  const exchange = getExchange(effectiveAccount);
                  const marketInfo = await exchange.getMarketInfo(futuresSymbol);
                  closeStepSize = marketInfo?.filters?.quantity?.stepSize || null;
                } catch (e) {
                  // Use existing stepSize or default
                }
              }
              
              const roundedCloseQuantity = roundQuantity(existingSize, closeStepSize);
              
              const exchange = getExchange(effectiveAccount);
              const closeOrderResult = await exchange.placeOrder(
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
                const exchange = getExchange(effectiveAccount);
                const updatedPositions = await exchange.fetchPositions();
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
        }
      } catch (positionCheckError) {
        console.error('[Webhook Auto-Trade] Error checking existing positions:', positionCheckError.message);
      }
      
      // Step 1: Open position only (no TP/SL in same request)
      console.log('[Webhook Auto-Trade] Placing market order to open position (no TP/SL):', {
        symbol: futuresSymbol,
        quantity: roundedQuantity,
        side
      });

      let mainOrderResult;
      try {
        const exchange = getExchange(effectiveAccount);
        mainOrderResult = await exchange.placeOrder(
          futuresSymbol,
          side,
          ORDER_TYPES.MARKET,
          roundedQuantity,
          null
        );
        console.log('[Webhook Auto-Trade] Position opened successfully:', mainOrderResult);
        lastDirectionByTicker[futuresSymbol] = direction;
      } catch (mainOrderError) {
        console.error('[Webhook Auto-Trade] Failed to place main order:', mainOrderError.message);
        if (mainOrderError.response) {
          console.error('[Webhook Auto-Trade] Main order error response:', mainOrderError.response.data);
        }
        return;
      }

      // Step 2: Wait for position to be reflected, then get REAL entry price from position
      // Retry a few times (some exchanges e.g. Hyperliquid can take a moment to update)
      const positionRetryDelays = [800, 1500, 2500];
      let openedPosition = null;
      for (const delayMs of positionRetryDelays) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        try {
          const exchange = getExchange(effectiveAccount);
          const positions = await exchange.fetchPositions();
          openedPosition = findExistingPosition(positions, futuresSymbol);
          if (openedPosition) break;
        } catch (posError) {
          console.warn('[Webhook Auto-Trade] Fetch positions attempt failed:', posError.message);
        }
      }
      if (!openedPosition) {
        console.error('[Webhook Auto-Trade] Could not find opened position for', futuresSymbol);
        return;
      }

      const realEntryPrice = parseFloat(openedPosition.entryPrice || openedPosition.entry_price);
      const openedPositionSize = Math.abs(parseFloat(openedPosition.netQuantity || openedPosition.netExposureQuantity || 0));
      if (!realEntryPrice || isNaN(realEntryPrice) || realEntryPrice <= 0 || !openedPositionSize || openedPositionSize <= 0) {
        console.error('[Webhook Auto-Trade] Invalid position data:', { realEntryPrice, openedPositionSize, openedPosition });
        return;
      }

      console.log('[Webhook Auto-Trade] Position details:', { realEntryPrice, openedPositionSize, direction });

      // Step 3: Calculate TP/SL from REAL entry price and place conditional (market) orders
      // LONG: TP = Entry × (1 + TP_ROI/(100×Leverage)), SL = Entry × (1 − SL_ROI/(100×Leverage))
      // SHORT: TP = Entry × (1 − TP_ROI/(100×Leverage)), SL = Entry × (1 + SL_ROI/(100×Leverage))
      let tpTriggerPrice, slTriggerPrice;
      if (direction === 'LONG') {
        tpTriggerPrice = realEntryPrice * (1 + alertTP_ROI_PERCENT / (100 * leverage));
        slTriggerPrice = realEntryPrice * (1 - alertSL_ROI_PERCENT / (100 * leverage));
      } else {
        tpTriggerPrice = realEntryPrice * (1 - alertTP_ROI_PERCENT / (100 * leverage));
        slTriggerPrice = realEntryPrice * (1 + alertSL_ROI_PERCENT / (100 * leverage));
      }
      tpTriggerPrice = roundPrice(tpTriggerPrice, tickSize);
      slTriggerPrice = roundPrice(slTriggerPrice, tickSize);

      const closeSide = direction === 'LONG' ? 'Ask' : 'Bid';
      const roundedPositionSize = roundQuantity(openedPositionSize, stepSize);

      console.log('[Webhook Auto-Trade] Placing conditional TP/SL orders (market type) from real entry:', {
        symbol: futuresSymbol,
        realEntryPrice,
        tpTriggerPrice,
        slTriggerPrice,
        quantity: roundedPositionSize
      });

      try {
        const exchange = getExchange(effectiveAccount);
        await exchange.placeTriggerOrder(
          futuresSymbol,
          closeSide,
          roundedPositionSize,
          tpTriggerPrice,
          'MarkPrice',
          true,
          true // isTakeProfit – so exchange uses TP trigger (e.g. Hyperliquid tpsl: 'tp')
        );
        console.log('[Webhook Auto-Trade] Take-profit conditional order placed');
      } catch (tpError) {
        console.error('[Webhook Auto-Trade] Failed to place TP order:', tpError.message);
        if (tpError.response) console.error('[Webhook Auto-Trade] TP error response:', tpError.response.data);
      }

      try {
        const exchange = getExchange(effectiveAccount);
        await exchange.placeTriggerOrder(
          futuresSymbol,
          closeSide,
          roundedPositionSize,
          slTriggerPrice,
          'MarkPrice',
          true,
          false // isTakeProfit = false for stop-loss
        );
        console.log('[Webhook Auto-Trade] Stop-loss conditional order placed');
      } catch (slError) {
        console.error('[Webhook Auto-Trade] Failed to place SL order:', slError.message);
        if (slError.response) console.error('[Webhook Auto-Trade] SL error response:', slError.response.data);
      }
    } catch (error) {
      console.error('[Webhook Auto-Trade] Unexpected error in auto-trading logic:', error.message);
      console.error('[Webhook Auto-Trade] Error stack:', error.stack);
      // Don't throw - we want to return 200 OK to webhook sender
    }
  })();
  
  res.status(200).send('OK');
});

module.exports = router;
