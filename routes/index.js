const express = require('express');
const path = require('path');
const router = express.Router();
const balanceRoutes = require('./balance');
const futuresRoutes = require('./futures');
const webhookRoutes = require('./webhook');

/**
 * Serve the main HTML page
 */
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/index.html'));
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount all route modules
router.use(balanceRoutes);
router.use(futuresRoutes);
router.use(webhookRoutes);

module.exports = router;
