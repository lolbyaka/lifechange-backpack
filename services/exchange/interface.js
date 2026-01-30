/**
 * Unified exchange adapter interface and normalized types.
 * All adapters (Backpack, CCXT-based) must implement this contract so routes
 * can stay exchange-agnostic. Symbols are in canonical format: BASE_QUOTE_PERP (e.g. ETH_USDC_PERP).
 */

/**
 * Normalized ticker response.
 * @typedef {Object} NormalizedTicker
 * @property {number} last - Last trade price
 * @property {number} [lastPrice] - Alias for compatibility
 */

/**
 * Normalized market info for precision.
 * @typedef {Object} NormalizedMarketInfo
 * @property {string|null} stepSize - Quantity step size (e.g. "0.001")
 * @property {string|null} tickSize - Price tick size (e.g. "0.01")
 * @property {Object} [filters] - Optional; for compatibility with routes that use filters.quantity.stepSize
 * @property {Object} [filters.quantity]
 * @property {string|null} [filters.quantity.stepSize]
 * @property {Object} [filters.price]
 * @property {string|null} [filters.price.tickSize]
 */

/**
 * Normalized position.
 * @typedef {Object} NormalizedPosition
 * @property {string} symbol - Canonical symbol (e.g. ETH_USDC_PERP)
 * @property {number} netQuantity - Net position size (positive = long, negative = short)
 * @property {string} [market] - Optional alias for symbol
 * @property {number} [netExposureQuantity] - Optional alias for netQuantity
 * @property {*} [raw] - Exchange-specific fields (entryPrice, markPrice, etc.) preserved for routes that need them
 */

/**
 * Normalized order.
 * @typedef {Object} NormalizedOrder
 * @property {string} id - Order ID
 * @property {string} [orderId] - Alias for compatibility
 * @property {string} [order_id] - Alias for compatibility
 * @property {*} [raw] - Exchange-specific fields
 */

/**
 * Normalized market (for list of futures).
 * @typedef {Object} NormalizedMarket
 * @property {string} symbol - Canonical symbol (e.g. ETH_USDC_PERP)
 * @property {string} [marketType] - e.g. "PERP"
 * @property {boolean} [visible]
 */

/**
 * Balance response - adapter may return exchange-native shape; balance route
 * expects keys like USDC: { available, locked, staked }.
 * @typedef {Object} BalanceResponse
 * @property {Object.<string, {available?: string, locked?: string, staked?: string}>} [currency codes]
 */

/**
 * Collateral/margin response - adapter may return exchange-native shape.
 * Balance route expects netEquityAvailable or equivalent.
 * @typedef {Object} CollateralResponse
 * @property {string|number} [netEquityAvailable]
 */

/**
 * Exchange adapter contract. All adapters must implement these methods with
 * normalized request/response shapes where specified.
 * @interface ExchangeAdapter
 *
 * @method fetchBalance - () => Promise<BalanceResponse>
 * @method fetchCollateralInfo - () => Promise<CollateralResponse>
 * @method getTicker - (symbol: string) => Promise<NormalizedTicker>  // symbol in canonical form
 * @method getMarkets - () => Promise<NormalizedMarket[]>
 * @method getMarketInfo - (symbol: string) => Promise<NormalizedMarketInfo>  // symbol canonical
 * @method fetchPositions - () => Promise<NormalizedPosition[]>
 * @method fetchOpenOrders - (symbol?: string) => Promise<NormalizedOrder[]>
 * @method placeOrder - (symbol, side, orderType, quantity, price?, conditionalOrders?, reduceOnly?) => Promise<NormalizedOrder>
 * @method placeTriggerOrder - (symbol, side, quantity, triggerPrice, triggerBy?, reduceOnly?) => Promise<NormalizedOrder>
 * @method cancelOrder - (orderId: string, symbol: string) => Promise<object>
 * @method cancelAllOrders - (symbol: string) => Promise<Array<{orderId, success, result?|error?}>>
 */

// No default export; this file is for documentation and shared types.
// Adapters are concrete implementations.

module.exports = {};
