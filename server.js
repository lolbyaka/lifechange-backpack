require('dotenv').config();
const express = require('express');
const { PORT } = require('./config/constants');
const { connectDB } = require('./config/database');
const { initExchange } = require('./services/exchange/factory');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text()); // For webhook text/plain requests

// Routes
app.use(routes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Init exchange and preload markets (CCXT) so first webhook isn't slow
    await initExchange();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
