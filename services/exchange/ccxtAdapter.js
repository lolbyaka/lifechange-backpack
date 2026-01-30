/**
 * CCXT-based exchange adapter. Implements the unified exchange interface for
 * CCXT-supported exchanges (e.g. Binance, Bybit). Converts between canonical
 * symbol format (ETH_USDC_PERP) and CCXT format (ETH/USDC:USDC).
 */

const ccxt = require('ccxt');

/**
 * Convert canonical symbol (ETH_USDC_PERP) to CCXT unified symbol (ETH/USDC:USDC).
 */
function toCcxtSymbol(canonical) {
  if (!canonical || typeof canonical !== 'string') return canonical;
  const parts = canonical.split('_');
  if (parts.length >= 3 && (parts[2] === 'PERP' || parts[2].startsWith('PERP'))) {
    const base = parts[0];
    const quote = parts[1];
    return `${base}/${quote}:${quote}`;
  }
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}:${parts[1]}`;
  }
  return canonical;
}

/**
 * Convert CCXT symbol (ETH/USDC:USDC) to canonical (ETH_USDC_PERP).
 */
function toCanonicalSymbol(ccxtSymbol) {
  if (!ccxtSymbol || typeof ccxtSymbol !== 'string') return ccxtSymbol;
  const slash = ccxtSymbol.indexOf('/');
  const colon = ccxtSymbol.indexOf(':');
  if (slash !== -1 && colon !== -1) {
    const base = ccxtSymbol.slice(0, slash);
    const quote = ccxtSymbol.slice(slash + 1, colon);
    return `${base}_${quote}_PERP`;
  }
  if (slash !== -1) {
    const base = ccxtSymbol.slice(0, slash);
    const quote = ccxtSymbol.slice(slash + 1);
    return `${base}_${quote}_PERP`;
  }
  return ccxtSymbol;
}

/**
 * Create CCXT exchange instance and ensure markets are loaded.
 * @param {string} exchangeId - e.g. 'binance', 'bybit'
 * @param {object} credentials - { apiKey, secret }
 * @param {object} options - { sandbox?: boolean }
 */
function createCcxtExchange(exchangeId, credentials, options = {}) {
  const ExchangeClass = ccxt[exchangeId];
  if (!ExchangeClass) {
    throw new Error(`CCXT does not support exchange: ${exchangeId}`);
  }
  // Hyperliquid uses walletAddress + privateKey instead of apiKey/secret
  const isHyperliquid = exchangeId === 'hyperliquid';
  // Backpack uses 'swap' for perpetuals; others use 'future'
  const defaultType = exchangeId === 'backpack' ? 'swap' : 'future';
  const config = isHyperliquid
    ? {
        walletAddress: credentials.apiKey,
        privateKey: credentials.secret,
        enableRateLimit: true,
        options: {
          defaultType: 'future',
          ...(options.exchangeOptions || {})
        }
      }
    : {
        apiKey: credentials.apiKey,
        secret: credentials.secret,
        enableRateLimit: true,
        options: {
          defaultType,
          ...(options.exchangeOptions || {})
        }
      };
  if (!isHyperliquid && credentials.password) {
    config.password = credentials.password;
  }
  if (options.sandbox) {
    config.sandbox = true;
  }
  return new ExchangeClass(config);
}

/**
 * Build CCXT adapter. Call with (exchangeId, credentials, options) to get adapter instance.
 * @param {string} exchangeId - e.g. 'binance', 'bybit'
 * @param {object} credentials - { apiKey, secret }
 * @param {object} options - { sandbox?: boolean }
 */
function createCcxtAdapter(exchangeId, credentials, options = {}) {
  const exchange = createCcxtExchange(exchangeId, credentials, options);
  let marketsLoaded = false;

  async function loadMarketsOnce() {
    if (!marketsLoaded) {
      await exchange.loadMarkets();
      marketsLoaded = true;
    }
  }

  function normalizeTicker(data) {
    const last = parseFloat(data.last ?? data.close ?? 0);
    return { last, lastPrice: last, ...data };
  }

  function precisionToStepSize(precision) {
    if (precision == null) return null;
    const n = typeof precision === 'number' ? precision : parseFloat(precision);
    if (isNaN(n)) return String(precision);
    if (n >= 1) return '1';
    return (1 / Math.pow(10, n)).toFixed(n);
  }

  function normalizeMarketInfo(market) {
    const info = market?.info || market;
    let stepSize = market?.precision?.amount ?? info?.quantityPrecision ?? info?.lotSize ?? null;
    let tickSize = market?.precision?.price ?? info?.pricePrecision ?? info?.tickSize ?? null;
    if (typeof stepSize === 'number' && stepSize <= 1 && stepSize > 0) {
      stepSize = stepSize.toString();
    } else if (typeof stepSize === 'number' && stepSize > 1) {
      stepSize = '1';
    } else if (typeof stepSize === 'number' && stepSize >= 0 && stepSize < 1) {
      stepSize = precisionToStepSize(Math.round(-Math.log10(stepSize)));
    } else if (typeof stepSize === 'number' && Number.isInteger(stepSize)) {
      stepSize = precisionToStepSize(stepSize);
    }
    if (typeof tickSize === 'number' && tickSize <= 1 && tickSize > 0) {
      tickSize = tickSize.toString();
    } else if (typeof tickSize === 'number' && tickSize > 1) {
      tickSize = '1';
    } else if (typeof tickSize === 'number' && Number.isInteger(tickSize)) {
      tickSize = precisionToStepSize(tickSize);
    }
    const stepStr = stepSize != null ? String(stepSize) : null;
    const tickStr = tickSize != null ? String(tickSize) : null;
    return {
      stepSize: stepStr,
      tickSize: tickStr,
      filters: {
        quantity: { stepSize: stepStr },
        price: { tickSize: tickStr }
      },
      ...market
    };
  }

  function normalizePosition(p) {
    // Derive symbol: use canonical from CCXT symbol, or from Hyperliquid raw position.coin (e.g. "ETH" -> ETH_USDC_PERP)
    let symbol = toCanonicalSymbol(p.symbol || p.info?.symbol);
    if ((!symbol || symbol === p.symbol) && exchangeId === 'hyperliquid' && p.info?.position?.coin) {
      const coin = p.info.position.coin;
      symbol = toCanonicalSymbol(coin.indexOf('/') >= 0 ? coin : `${coin}/USDC:USDC`);
    }
    const contracts = p.contracts ?? p.contractSize ?? 1;
    const side = p.side === 'long' ? 1 : -1;
    const amount = Math.abs(parseFloat(p.contracts ?? p.amount ?? 0)) * (p.side === 'short' ? -1 : 1);
    const netQuantity = parseFloat(p.contracts ?? p.amount ?? p.netQuantity ?? 0);
    const q = p.side === 'short' ? -Math.abs(netQuantity) : Math.abs(netQuantity);
    return {
      symbol,
      netQuantity: q,
      netExposureQuantity: q,
      market: symbol,
      ...p,
      entryPrice: p.entryPrice ?? p.averagePrice,
      markPrice: p.markPrice ?? p.markPrice
    };
  }

  function normalizeOrder(o) {
    const id = o.id ?? o.orderId ?? o.order_id ?? '';
    return { ...o, id, orderId: id, order_id: id };
  }

  async function fetchBalance() {
    await loadMarketsOnce();
    const balance = await exchange.fetchBalance();
    const result = {};
    if (balance.total) {
      for (const [currency, total] of Object.entries(balance.total)) {
        if (total && parseFloat(total) > 0) {
          result[currency] = {
            available: String(balance.free?.[currency] ?? 0),
            locked: String(balance.used?.[currency] ?? 0),
            staked: '0'
          };
        }
      }
    }
    return result;
  }

  async function fetchCollateralInfo() {
    await loadMarketsOnce();
    try {
      const balance = await exchange.fetchBalance();
      const total = balance.total?.USDT ?? balance.total?.USDC ?? balance.total?.USD;
      const free = balance.free?.USDT ?? balance.free?.USDC ?? balance.free?.USD;
      return {
        netEquityAvailable: total != null ? String(total) : (free != null ? String(free) : '0')
      };
    } catch (e) {
      return { netEquityAvailable: '0' };
    }
  }

  async function getTicker(symbol) {
    await loadMarketsOnce();
    const ccxtSymbol = toCcxtSymbol(symbol);
    const data = await exchange.fetchTicker(ccxtSymbol);
    return normalizeTicker(data);
  }

  async function getMarkets() {
    await loadMarketsOnce();
    const markets = exchange.markets || {};
    const futures = Object.values(markets).filter(
      m => m.type === 'future' || m.type === 'swap' || m.swap === true || (m.symbol && m.symbol.includes(':'))
    );
    return futures.map(m => ({
      symbol: toCanonicalSymbol(m.symbol),
      marketType: 'PERP',
      visible: m.active !== false,
      ...m
    }));
  }

  async function getMarketInfo(symbol) {
    await loadMarketsOnce();
    const ccxtSymbol = toCcxtSymbol(symbol);
    const market = exchange.market(ccxtSymbol);
    return normalizeMarketInfo(market);
  }

  async function fetchPositions() {
    await loadMarketsOnce();
    const positions = await exchange.fetchPositions();
    return (positions || [])
      .filter(p => {
        const q = parseFloat(p.contracts ?? p.amount ?? 0);
        return q !== 0;
      })
      .map(normalizePosition);
  }

  async function fetchOpenOrders(symbol = null) {
    await loadMarketsOnce();
    const ccxtSymbol = symbol ? toCcxtSymbol(symbol) : undefined;
    const orders = await exchange.fetchOpenOrders(ccxtSymbol);
    return (orders || []).map(normalizeOrder);
  }

  async function placeOrder(symbol, side, orderType, quantity, price = null, conditionalOrders = null, reduceOnly = false) {
    await loadMarketsOnce();
    const ccxtSymbol = toCcxtSymbol(symbol);
    const ccxtSide = side && side.toLowerCase() === 'ask' ? 'sell' : 'buy';
    const type = (orderType || 'market').toLowerCase();
    let orderPrice = price;
    // Hyperliquid market orders require a reference price for max slippage calculation
    if (exchangeId === 'hyperliquid' && type === 'market' && (orderPrice == null || orderPrice === '')) {
      const ticker = await exchange.fetchTicker(ccxtSymbol);
      orderPrice = ticker.last ?? ticker.close;
      if (orderPrice == null) {
        throw new Error('Could not get current price for Hyperliquid market order');
      }
    }
    const params = {};
    if (reduceOnly) params.reduceOnly = true;
    if (conditionalOrders?.takeProfitTriggerPrice) {
      params.takeProfit = { triggerPrice: conditionalOrders.takeProfitTriggerPrice };
    }
    if (conditionalOrders?.stopLossTriggerPrice) {
      params.stopLoss = { triggerPrice: conditionalOrders.stopLossTriggerPrice };
    }
    const order = await exchange.createOrder(ccxtSymbol, type, ccxtSide, quantity, orderPrice, params);
    return normalizeOrder(order);
  }

  /**
   * Place a trigger (TP or SL) order. For Hyperliquid and exchanges that distinguish TP vs SL,
   * pass isTakeProfit so the correct trigger type is used (TP triggers when price reaches profit
   * level; SL triggers when price reaches loss level). Otherwise both can be sent as stop-loss
   * and the "TP" order may trigger immediately.
   * @param {boolean} [isTakeProfit] - true for take-profit, false for stop-loss (default false for backward compat)
   */
  async function placeTriggerOrder(symbol, side, quantity, triggerPrice, triggerBy = 'MarkPrice', reduceOnly = true, isTakeProfit = false) {
    await loadMarketsOnce();
    const ccxtSymbol = toCcxtSymbol(symbol);
    const ccxtSide = side && side.toLowerCase() === 'ask' ? 'sell' : 'buy';
    const params = {
      reduceOnly: reduceOnly !== false
    };
    // Backpack: use triggerPrice so CCXT sets request.triggerPrice + request.triggerQuantity (Backpack API shape).
    // Passing takeProfitPrice/stopLossPrice would get merged into body and cause "Invalid signature".
    if (exchangeId === 'backpack') {
      params.triggerPrice = triggerPrice;
    } else if (exchangeId === 'hyperliquid') {
      if (isTakeProfit) {
        params.takeProfitPrice = triggerPrice;
      } else {
        params.stopLossPrice = triggerPrice;
      }
    } else {
      params.stopPrice = triggerPrice;
    }
    // Hyperliquid market orders require a reference price for slippage; use trigger price
    const orderPrice = exchangeId === 'hyperliquid' ? triggerPrice : undefined;
    const order = await exchange.createOrder(ccxtSymbol, 'market', ccxtSide, quantity, orderPrice, params);
    return normalizeOrder(order);
  }

  async function cancelOrder(orderId, symbol) {
    await loadMarketsOnce();
    const ccxtSymbol = toCcxtSymbol(symbol);
    return exchange.cancelOrder(orderId, ccxtSymbol);
  }

  async function cancelAllOrders(symbol) {
    await loadMarketsOnce();
    const ccxtSymbol = toCcxtSymbol(symbol);
    const orders = await exchange.fetchOpenOrders(ccxtSymbol);
    const results = [];
    for (const order of orders) {
      const id = order.id ?? order.orderId;
      try {
        await exchange.cancelOrder(id, ccxtSymbol);
        results.push({ orderId: id, success: true });
      } catch (e) {
        results.push({ orderId: id, success: false, error: e.message });
      }
    }
    return results;
  }

  /**
   * Preload markets (e.g. at app start). Call once so later requests don't trigger slow loadMarkets().
   */
  async function warmUp() {
    await loadMarketsOnce();
  }

  return {
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
}

module.exports = {
  createCcxtAdapter,
  toCcxtSymbol,
  toCanonicalSymbol
};
