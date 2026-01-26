const express = require('express');
const router = express.Router();
const { getFuturesMarkets, getFuturesTicker, getMarketInfo, placeFuturesOrder, fetchOpenPositions } = require('../services/backpackApi');
const { validateFuturesOrder, normalizeSide, roundQuantity } = require('../utils/validation');
const { ORDER_TYPES } = require('../config/constants');
const Operation = require('../models/Operation');

/**
 * GET /api/futures/tickers
 * Get list of available futures markets
 */
router.get('/api/futures/tickers', async (req, res) => {
  try {
    const markets = await getFuturesMarkets();
    
    // Format futures markets
    // Extract base symbol from futures symbol (e.g., ETH_USDC_PERP -> ETH)
    const tickers = markets.map(market => {
      // Extract base symbol from symbol like ETH_USDC_PERP
      const baseSymbol = market.symbol.split('_')[0];
      return {
        symbol: market.symbol,
        baseSymbol: baseSymbol,
        displayName: `${baseSymbol} - ${market.symbol}`
      };
    }).sort((a, b) => a.baseSymbol.localeCompare(b.baseSymbol));
    
    res.json({
      success: true,
      tickers: tickers
    });
  } catch (error) {
    console.error('Error in /api/futures/tickers:', error);
    res.status(500).json({
      error: 'Failed to fetch futures tickers',
      message: error.message,
      tickers: [] // Return empty array on error
    });
  }
});

/**
 * POST /api/futures/order
 * Place a futures order
 */
router.post('/api/futures/order', async (req, res) => {
  try {
    // Validate and normalize input
    const { ticker, position, leverage, quantity: inputQuantity } = validateFuturesOrder(req.body);
    
    // Convert ticker to futures symbol format
    // If user provides full symbol (e.g., BNB_USDC_PERP), use it as is
    // Otherwise, add _USDC_PERP suffix (e.g., BNB -> BNB_USDC_PERP)
    let futuresSymbol = ticker;
    if (!futuresSymbol.includes('_USDC_PERP') && !futuresSymbol.includes('_USDT_PERP')) {
      futuresSymbol = `${futuresSymbol}_USDC_PERP`;
    }
    
    // Convert position to side: LONG = Bid (buy), SHORT = Ask (sell)
    const side = normalizeSide(position);
    
    // Get current ticker price and market info for quantity precision
    let currentPrice;
    let stepSize = null;
    try {
      // Get ticker price (for display/calculation purposes)
      const tickerData = await getFuturesTicker(futuresSymbol);
      // Ticker response format may vary, try common fields
      currentPrice = parseFloat(tickerData.lastPrice || tickerData.price || tickerData.close || tickerData.last || tickerData.lastPrice);
      
      if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
        console.error('Ticker data received:', tickerData);
        throw new Error('Unable to get valid price from ticker data');
      }
      
      // Get market info to determine stepSize for quantity precision
      try {
        const marketInfo = await getMarketInfo(futuresSymbol);
        stepSize = marketInfo?.filters?.quantity?.stepSize || null;
        console.log('Market stepSize:', stepSize);
      } catch (marketError) {
        console.warn('Could not fetch market info, using default precision:', marketError.message);
        // Continue with default precision
      }
    } catch (error) {
      console.error('Error fetching ticker price:', error);
      return res.status(500).json({
        error: 'Failed to fetch current price',
        message: `Could not get current price for ${futuresSymbol}. Please verify the ticker symbol is correct. Error: ${error.message}`
      });
    }
    
    // Round quantity to appropriate precision based on stepSize
    let quantity = roundQuantity(inputQuantity, stepSize);
    
    if (quantity <= 0) {
      return res.status(400).json({
        error: 'Invalid quantity',
        message: `Quantity is too small. Quantity: ${inputQuantity}, Price: $${currentPrice}`
      });
    }
    
    // Calculate total position size in USD for display purposes
    const totalPositionSize = quantity * currentPrice;
    
    console.log('Placing futures order:', {
      symbol: futuresSymbol,
      side,
      leverage,
      quantity,
      currentPrice,
      totalPositionSize,
      orderType: ORDER_TYPES.MARKET
    });
    
    // Place the market order
    let orderResult;
    try {
      orderResult = await placeFuturesOrder(
        futuresSymbol,
        side,
        ORDER_TYPES.MARKET,
        quantity,
        null // No price for market orders
      );
      
      console.log('Order placed successfully:', orderResult);
      
      // Save operation to MongoDB
      try {
        const operation = new Operation({
          symbol: futuresSymbol,
          side: side,
          direction: position, // LONG or SHORT
          quantity: quantity,
          entryPrice: currentPrice,
          leverage: parseInt(leverage),
          orderType: ORDER_TYPES.MARKET,
          orderId: orderResult.id || orderResult.orderId || orderResult.order_id || orderResult.clientId || orderResult.client_id,
          orderCategory: 'MAIN',
          takeProfitPrice: null,
          stopLossPrice: null,
          source: 'MANUAL',
          orderResponse: orderResult
        });
        await operation.save();
        console.log('Operation saved to database');
      } catch (dbError) {
        console.error('Failed to save operation to database:', dbError);
        // Continue even if DB save fails
      }
    } catch (orderError) {
      console.error('Failed to place order:', orderError);
      throw orderError;
    }
    
    // Extract order ID from various possible response formats
    const orderId = orderResult.id || orderResult.orderId || orderResult.order_id || orderResult.clientId || orderResult.client_id;
    
    res.json({
      success: true,
      order: {
        orderId,
        ticker: ticker,
        symbol: futuresSymbol,
        position,
        side,
        leverage,
        quantity,
        currentPrice,
        totalPositionSize,
        orderType: ORDER_TYPES.MARKET,
        type: 'FUTURES',
        timestamp: new Date().toISOString(),
        rawResponse: orderResult
      },
      message: 'Futures order placed successfully'
    });
  } catch (error) {
    console.error('Error in /api/futures/order:', error);
    // Validation errors should return 400, other errors return 500
    const statusCode = error.message && (
      error.message.includes('Missing required fields') ||
      error.message.includes('Invalid position') ||
      error.message.includes('Invalid leverage') ||
      error.message.includes('Invalid quantity')
    ) ? 400 : (error.status || error.statusCode || 500);
    
    res.status(statusCode).json({
      error: 'Failed to process futures order',
      message: error.message,
      details: error.response?.data || error.message
    });
  }
});

/**
 * GET /api/futures/positions
 * Get all open positions from Backpack Exchange
 */
router.get('/api/futures/positions', async (req, res) => {
  try {
    const positions = await fetchOpenPositions();
    
    // Transform API response to match frontend expectations
    // API returns: { symbol, netQuantity, entryPrice, markPrice, pnlUnrealized, netExposureNotional, ... }
    // Frontend expects: { symbol, side, size, entryPrice, markPrice, unrealizedPnl, leverage }
    const transformedPositions = positions
      .map(position => {
        const netQuantity = parseFloat(position.netQuantity || position.netExposureQuantity || 0);
        const isLong = netQuantity > 0;
        const size = Math.abs(netQuantity);
        
        // Skip positions with zero size
        if (size === 0) {
          return null;
        }
        
        // Calculate leverage: leverage = notional / margin
        // We can approximate using netExposureNotional and netCost
        let leverage = 'N/A';
        if (position.netExposureNotional && position.netCost) {
          const notional = parseFloat(position.netExposureNotional);
          const cost = parseFloat(position.netCost);
          if (cost > 0) {
            leverage = (notional / cost).toFixed(2);
          }
        }
        
        return {
          symbol: position.symbol || 'N/A',
          side: isLong ? 'LONG' : 'SHORT',
          size: size.toString(),
          entryPrice: position.entryPrice || 'N/A',
          markPrice: position.markPrice || 'N/A',
          unrealizedPnl: position.pnlUnrealized || '0',
          leverage: leverage,
          // Include raw data for debugging
          raw: position
        };
      })
      .filter(position => position !== null); // Remove null entries
    
    res.json({
      success: true,
      positions: transformedPositions
    });
  } catch (error) {
    console.error('Error in /api/futures/positions:', error);
    res.status(500).json({
      error: 'Failed to fetch open positions',
      message: error.message,
      positions: [] // Return empty array on error
    });
  }
});

module.exports = router;
