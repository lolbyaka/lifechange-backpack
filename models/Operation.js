const mongoose = require('mongoose');

const operationSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true
  },
  side: {
    type: String,
    required: true,
    enum: ['LONG', 'SHORT', 'Bid', 'Ask']
  },
  direction: {
    type: String,
    enum: ['LONG', 'SHORT'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  entryPrice: Number,
  leverage: Number,
  orderType: String,
  orderId: String,
  // For TP/SL orders
  orderCategory: {
    type: String,
    enum: ['MAIN', 'TAKE_PROFIT', 'STOP_LOSS'],
    default: 'MAIN'
  },
  takeProfitPrice: Number,
  stopLossPrice: Number,
  // Source of the operation
  source: {
    type: String,
    enum: ['WEBHOOK', 'MANUAL'],
    default: 'MANUAL'
  },
  // Store the full order response
  orderResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Indexes for faster queries
operationSchema.index({ timestamp: -1 });
operationSchema.index({ symbol: 1 });
operationSchema.index({ direction: 1 });
operationSchema.index({ source: 1 });

const Operation = mongoose.model('Operation', operationSchema);

module.exports = Operation;
