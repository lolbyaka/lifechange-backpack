const Webhook = require('../models/Webhook');

/**
 * Add a new alert to storage (MongoDB)
 * @param {object} alertData - Alert data from webhook
 * @returns {Promise<object>} - Alert with timestamp added
 */
async function addAlert(alertData) {
  try {
    // Extract common fields
    const webhook = new Webhook({
      symbol: alertData.symbol || alertData.ticker || alertData.tickerSymbol,
      ticker: alertData.ticker,
      tickerSymbol: alertData.tickerSymbol,
      message: alertData.message || alertData.text || alertData.alertMessage,
      text: alertData.text,
      alertMessage: alertData.alertMessage,
      price: alertData.price ? parseFloat(alertData.price) : null,
      data: alertData // Store full webhook data
    });
    
    const savedWebhook = await webhook.save();
    
    // Format for backward compatibility with frontend
    return {
      ...savedWebhook.toObject(),
      timestamp: savedWebhook.timestamp.toISOString().replace('T', ' ').replace('Z', '').split('.')[0]
    };
  } catch (error) {
    console.error('Error saving webhook to database:', error);
    throw error;
  }
}

/**
 * Get all alerts from MongoDB
 * @param {number} limit - Optional limit for number of alerts to return
 * @returns {Promise<Array>} - Array of all stored alerts
 */
async function getAlerts(limit = null) {
  try {
    let query = Webhook.find().sort({ timestamp: -1 });
    
    if (limit) {
      query = query.limit(limit);
    }
    
    const webhooks = await query.exec();
    
    // Format for backward compatibility with frontend
    return webhooks.map(webhook => {
      const webhookObj = webhook.toObject();
      return {
        ...webhookObj,
        symbol: webhookObj.symbol || webhookObj.ticker || webhookObj.tickerSymbol,
        message: webhookObj.message || webhookObj.text || webhookObj.alertMessage,
        price: webhookObj.price,
        timestamp: webhookObj.timestamp.toISOString().replace('T', ' ').replace('Z', '').split('.')[0]
      };
    });
  } catch (error) {
    console.error('Error fetching webhooks from database:', error);
    throw error;
  }
}

/**
 * Clear all alerts (for testing/cleanup)
 */
async function clearAlerts() {
  try {
    await Webhook.deleteMany({});
    console.log('All webhooks cleared from database');
  } catch (error) {
    console.error('Error clearing webhooks from database:', error);
    throw error;
  }
}

module.exports = {
  addAlert,
  getAlerts,
  clearAlerts
};
