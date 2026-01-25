const express = require('express');
const router = express.Router();
const { addAlert, getAlerts } = require('../services/webhookStorage');

/**
 * GET /webhook
 * Retrieve all stored alerts
 */
router.get('/webhook', (req, res) => {
  res.json(getAlerts());
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
  
  // Add alert with timestamp
  addAlert(alertData);
  
  res.status(200).send('OK');
});

module.exports = router;
