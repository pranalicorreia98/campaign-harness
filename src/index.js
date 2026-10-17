require('dotenv').config();
const express = require('express');
const logger = require('./utils/logger');
const campaignHarnessRoutes = require('./campaignHarness.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'campaign-harness',
    timestamp: new Date().toISOString()
  });
});

// Campaign Harness API routes
app.use('/api/campaign-harness', campaignHarnessRoutes);

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Campaign Harness service started on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Campaign API: http://localhost:${PORT}/api/campaign-harness`);
});
