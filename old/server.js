const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON and text
app.use(express.json());
app.use(express.text());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for webhook data
let alerts = [];

// Webhook endpoint for both GET and POST
app.get('/webhook', (req, res) => {
  res.json(alerts);
});

app.post('/webhook', (req, res) => {
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  let alertData = req.body;
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
  alerts.push({
    ...alertData,
    timestamp: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0]
  });
  res.status(200).send('OK');
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
