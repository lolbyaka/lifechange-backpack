// In-memory storage for webhook alerts
let alerts = [];

/**
 * Add a new alert to storage
 * @param {object} alertData - Alert data from webhook
 * @returns {object} - Alert with timestamp added
 */
function addAlert(alertData) {
  const alert = {
    ...alertData,
    timestamp: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0]
  };
  alerts.push(alert);
  return alert;
}

/**
 * Get all alerts
 * @returns {Array} - Array of all stored alerts
 */
function getAlerts() {
  return alerts;
}

/**
 * Clear all alerts
 */
function clearAlerts() {
  alerts = [];
}

module.exports = {
  addAlert,
  getAlerts,
  clearAlerts
};
