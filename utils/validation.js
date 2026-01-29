const { POSITION_TYPES, ORDER_TYPES, SIDE_MAPPING } = require('../config/constants');

/**
 * Normalize side value (LONG/SHORT to Bid/Ask)
 * @param {string} position - Position type (LONG or SHORT)
 * @returns {string} - Normalized side (Bid or Ask)
 */
function normalizeSide(position) {
  return SIDE_MAPPING[position];
}

/**
 * Normalize order type string
 * @param {string} orderType - Order type string
 * @returns {string} - Normalized order type (Market or Limit)
 */
function normalizeOrderType(orderType) {
  if (!orderType || typeof orderType !== 'string') {
    throw new Error(`orderType is required and must be a string. Received: ${orderType}`);
  }
  
  // Normalize orderType: capitalize first letter, lowercase rest
  const normalizedOrderType = orderType.charAt(0).toUpperCase() + orderType.slice(1).toLowerCase();
  
  if (normalizedOrderType !== ORDER_TYPES.MARKET && normalizedOrderType !== ORDER_TYPES.LIMIT) {
    throw new Error(`orderType must be "${ORDER_TYPES.MARKET}" or "${ORDER_TYPES.LIMIT}". Received: ${orderType}`);
  }
  
  return normalizedOrderType;
}

/**
 * Round quantity to appropriate precision based on stepSize
 * @param {number} quantity - Quantity to round
 * @param {string|null} stepSize - Step size from market info (e.g., "0.001")
 * @returns {number} - Rounded quantity
 */
function roundQuantity(quantity, stepSize) {
  if (!stepSize || stepSize === '0' || stepSize === '0.0') {
    // If no stepSize, use conservative rounding (6 decimal places)
    return Math.floor(quantity * 1000000) / 1000000;
  }
  
  const stepSizeNum = parseFloat(stepSize);
  if (isNaN(stepSizeNum) || stepSizeNum <= 0) {
    // Fallback to 6 decimal places
    return Math.floor(quantity * 1000000) / 1000000;
  }
  
  // Calculate number of decimal places from stepSize
  // e.g., stepSize "0.001" means 3 decimal places, "0.00001" means 5 decimal places
  const stepSizeStr = stepSize.toString();
  if (stepSizeStr.includes('.')) {
    const decimals = stepSizeStr.split('.')[1].length;
    const multiplier = Math.pow(10, decimals);
    return Math.floor(quantity * multiplier) / multiplier;
  } else {
    // If stepSize is >= 1, round to integer
    return Math.floor(quantity);
  }
}

/**
 * Validate futures order parameters
 * @param {object} params - Order parameters
 * @param {string} params.ticker - Ticker symbol
 * @param {string} params.position - Position type (LONG/SHORT)
 * @param {string|number} params.leverage - Leverage value
 * @param {string|number} params.quantity - Quantity in ticker units
 * @returns {object} - Normalized and validated parameters
 * @throws {Error} - If validation fails
 */
function validateFuturesOrder({ ticker, position, leverage, quantity }) {
  // Validate required fields
  if (!ticker || !position || leverage === undefined || quantity === undefined) {
    throw new Error('Missing required fields: ticker, position, leverage, and quantity are required');
  }
  
  // Validate position type
  if (![POSITION_TYPES.LONG, POSITION_TYPES.SHORT].includes(position.toUpperCase())) {
    throw new Error(`Invalid position type. Position must be either ${POSITION_TYPES.LONG} or ${POSITION_TYPES.SHORT}`);
  }
  
  // Validate leverage
  const leverageNum = parseInt(leverage);
  if (isNaN(leverageNum) || leverageNum < 1 || leverageNum > 100) {
    throw new Error('Invalid leverage. Leverage must be between 1x and 100x');
  }
  
  // Validate quantity
  const quantityNum = parseFloat(quantity);
  if (isNaN(quantityNum) || quantityNum <= 0) {
    throw new Error('Invalid quantity. Quantity must be a positive number greater than 0');
  }
  
  return {
    ticker: ticker.toUpperCase(),
    position: position.toUpperCase(),
    leverage: leverageNum,
    quantity: quantityNum
  };
}

module.exports = {
  normalizeSide,
  normalizeOrderType,
  roundQuantity,
  validateFuturesOrder
};
