/**
 * Backpack Exchange adapter. Implements the unified exchange interface by
 * wrapping services/backpackApi.js and normalizing request/response shapes.
 * Canonical symbol format is already ETH_USDC_PERP (Backpack native).
 */

const backpackApi = require('../backpackApi');

/**
 * Normalize ticker response to unified shape { last, lastPrice }.
 */
function normalizeTicker(data) {
  const last = parseFloat(data.lastPrice || data.price || data.close || data.last || 0);
  return {
    last,
    lastPrice: last,
    ...data
  };
}

/**
 * Normalize market info to include filters.quantity.stepSize and filters.price.tickSize
 * for route compatibility.
 */
function normalizeMarketInfo(data) {
  const stepSize = data?.filters?.quantity?.stepSize ?? data?.stepSize ?? data?.quantityStepSize ?? null;
  const tickSize = data?.filters?.price?.tickSize ?? data?.tickSize ?? data?.priceTickSize ?? null;
  return {
    ...data,
    stepSize,
    tickSize,
    filters: {
      quantity: { stepSize },
      price: { tickSize }
    }
  };
}

/**
 * Normalize position to unified shape { symbol, netQuantity } with optional raw fields.
 */
function normalizePosition(p) {
  const symbol = p.symbol || p.market;
  const netQuantity = parseFloat(p.netQuantity ?? p.netExposureQuantity ?? 0);
  return {
    symbol,
    netQuantity,
    netExposureQuantity: netQuantity,
    ...p
  };
}

/**
 * Normalize order to unified shape { id, orderId }.
 */
function normalizeOrder(o) {
  const id = o.id ?? o.orderId ?? o.order_id ?? '';
  return {
    ...o,
    id,
    orderId: id,
    order_id: id
  };
}

async function fetchBalance() {
  return backpackApi.fetchBackpackBalances();
}

async function fetchCollateralInfo() {
  return backpackApi.fetchCollateralInfo();
}

async function getTicker(symbol) {
  const data = await backpackApi.getFuturesTicker(symbol);
  return normalizeTicker(data);
}

async function getMarkets() {
  const markets = await backpackApi.getFuturesMarkets();
  return (markets || []).map(m => ({
    symbol: m.symbol,
    marketType: m.marketType,
    visible: m.visible,
    ...m
  }));
}

async function getMarketInfo(symbol) {
  const data = await backpackApi.getMarketInfo(symbol);
  return normalizeMarketInfo(data);
}

async function fetchPositions() {
  const positions = await backpackApi.fetchOpenPositions();
  return (positions || []).map(normalizePosition);
}

async function fetchOpenOrders(symbol = null) {
  const orders = await backpackApi.fetchOpenOrders(symbol);
  return (orders || []).map(normalizeOrder);
}

async function placeOrder(symbol, side, orderType, quantity, price = null, conditionalOrders = null, reduceOnly = false) {
  const result = await backpackApi.placeFuturesOrder(symbol, side, orderType, quantity, price, conditionalOrders, reduceOnly);
  return normalizeOrder(result);
}

async function placeTriggerOrder(symbol, side, quantity, triggerPrice, triggerBy = 'MarkPrice', reduceOnly = true) {
  const result = await backpackApi.placeFuturesTriggerOrder(symbol, side, quantity, triggerPrice, triggerBy, reduceOnly);
  return normalizeOrder(result);
}

async function cancelOrder(orderId, symbol) {
  return backpackApi.cancelOrder(orderId, symbol);
}

async function cancelAllOrders(symbol) {
  return backpackApi.cancelAllOrdersForSymbol(symbol);
}

/** No-op for Backpack; markets are fetched on demand. */
async function warmUp() {}

module.exports = {
  fetchBalance,
  fetchCollateralInfo,
  getTicker,
  getMarkets,
  getMarketInfo,
  fetchPositions,
  fetchOpenOrders,
  placeOrder,
  placeTriggerOrder,
  cancelOrder,
  cancelAllOrders,
  warmUp
};
