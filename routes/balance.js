const express = require('express');
const router = express.Router();
const { getExchange } = require('../services/exchange/factory');

/**
 * GET /api/balance
 * Fetch account balance from configured exchange
 */
router.get('/api/balance', async (req, res) => {
  try {
    const exchange = getExchange();
    const balances = await exchange.fetchBalance();
    
    // Calculate total USDC balance (or USD equivalent)
    // The API returns balances in format: { "USDC": { available: "...", locked: "...", staked: "..." }, ... }
    let totalBalance = '0';
    let currency = 'usd';
    
    // Try to find USDC or USDT first, then sum all balances
    if (balances.USDC) {
      const available = parseFloat(balances.USDC.available || '0');
      const locked = parseFloat(balances.USDC.locked || '0');
      const staked = parseFloat(balances.USDC.staked || '0');
      totalBalance = (available + locked + staked).toFixed(2);
      currency = 'usdc';
    } else if (balances.USDT) {
      const available = parseFloat(balances.USDT.available || '0');
      const locked = parseFloat(balances.USDT.locked || '0');
      const staked = parseFloat(balances.USDT.staked || '0');
      totalBalance = (available + locked + staked).toFixed(2);
      currency = 'usdt';
    } else {
      // If no stablecoin found, sum all available balances
      let total = 0;
      Object.keys(balances).forEach(symbol => {
        const available = parseFloat(balances[symbol].available || '0');
        const locked = parseFloat(balances[symbol].locked || '0');
        total += available + locked;
      });
      totalBalance = total.toFixed(2);
    }
    
    // Try to get collateral/margin info for available margin
    let availableMargin = null;
    try {
      const collateralInfo = await exchange.fetchCollateralInfo();
      availableMargin = parseFloat(collateralInfo.netEquityAvailable || '0');
    } catch (marginError) {
      console.warn('Could not fetch margin info:', marginError.message);
      // Continue without margin info
    }
    
    res.json({
      balance: totalBalance,
      currency: currency,
      availableMargin: availableMargin !== null ? availableMargin.toFixed(2) : null,
      rawBalances: balances // Include raw data for debugging
    });
  } catch (error) {
    console.error('Error in /api/balance:', error);
    res.status(500).json({
      error: 'Failed to fetch balance from exchange',
      message: error.message,
      // Fallback to mock data if API fails (remove in production)
      balance: Math.floor(Math.random() * 9000 + 1000).toString(),
      currency: 'usd',
      fallback: true
    });
  }
});

module.exports = router;
