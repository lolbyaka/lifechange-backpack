const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
  symbol: String,
  ticker: String,
  tickerSymbol: String,
  message: String,
  text: String,
  alertMessage: String,
  price: Number,
  timestamp: {
    type: Date,
    default: Date.now
  },
  // Store the full webhook data as JSON
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Index for faster queries
webhookSchema.index({ timestamp: -1 });
webhookSchema.index({ symbol: 1 });

const Webhook = mongoose.model('Webhook', webhookSchema);

module.exports = Webhook;
