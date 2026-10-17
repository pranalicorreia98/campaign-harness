/**
 * Campaign Harness API Routes
 *
 * WhatsApp-native campaign approval and social posting workflow.
 */
const express = require('express');
const router = express.Router();
const logger = require('./utils/logger');
const {
  campaignWorkflow,
  nangoService,
  campaignDatabase,
} = require('./services/campaignHarness');

/**
 * Start a new campaign for an agency
 * POST /api/campaign-harness/start
 */
router.post('/start', async (req, res) => {
  const { agencyId, jobId, job, branding, agencyPhone } = req.body;
  logger.info('Campaign harness start request', { agencyId, jobId });

  try {
    if (!agencyId || !jobId || !job || !agencyPhone) {
      return res.status(400).json({
        error: 'Missing required fields: agencyId, jobId, job, agencyPhone'
      });
    }

    const result = await campaignWorkflow.startCampaign({
      agencyId,
      jobId,
      job,
      branding: branding || {},
      agencyPhone,
    });

    res.json({
      success: true,
      caseId: result.caseId,
      status: result.status,
      message: 'Campaign started, image generation in progress'
    });
  } catch (error) {
    logger.error('Failed to start campaign', { agencyId, jobId, error: error.message });
    res.status(500).json({ error: 'Failed to start campaign', message: error.message });
  }
});

/**
 * WhatsApp webhook for campaign responses
 * POST /api/campaign-harness/webhook
 */
router.post('/webhook', async (req, res) => {
  // Acknowledge webhook immediately
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const value = body.entry?.[0]?.changes?.[0]?.value;
    if (!value?.messages) return;

    for (const message of value.messages) {
      const from = message.from;
      let messageContent = null;

      if (message.type === 'interactive') {
        messageContent = {
          type: 'button',
          buttonId: message.interactive?.button_reply?.id,
          buttonTitle: message.interactive?.button_reply?.title,
        };
      } else if (message.type === 'text') {
        messageContent = { type: 'text', text: message.text?.body };
      }

      if (messageContent) {
        logger.info('Processing campaign webhook', { from, messageContent });
        await campaignWorkflow.handleWebhookMessage({
          from,
          ...messageContent,
          messageId: message.id,
        });
      }
    }
  } catch (error) {
    logger.error('Error processing campaign webhook', { error: error.message });
  }
});

/**
 * WhatsApp webhook verification
 * GET /api/campaign-harness/webhook
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.warn('WhatsApp webhook verification failed');
    res.sendStatus(403);
  }
});

/**
 * Get Nango connect URL for an agency
 * GET /api/campaign-harness/connect/:agencyId?platform=facebook
 */
router.get('/connect/:agencyId', async (req, res) => {
  const { agencyId } = req.params;
  const { platform } = req.query;

  logger.info('Nango connect session request', { agencyId, platform });

  try {
    if (!platform) {
      return res.status(400).json({ error: 'Missing platform query parameter' });
    }
    if (!nangoService.isConfigured()) {
      return res.status(503).json({ error: 'Nango not configured' });
    }

    const session = await nangoService.createConnectSession(agencyId, platform);
    res.json({
      success: true,
      connectUrl: session.url,
      sessionToken: session.sessionToken,
    });
  } catch (error) {
    logger.error('Failed to create Nango connect session', { agencyId, error: error.message });
    res.status(500).json({ error: 'Failed to create connect session', message: error.message });
  }
});

/**
 * List connected social accounts for an agency
 * GET /api/campaign-harness/connections/:agencyId
 */
router.get('/connections/:agencyId', async (req, res) => {
  const { agencyId } = req.params;

  try {
    if (!nangoService.isConfigured()) {
      return res.status(503).json({ error: 'Nango not configured' });
    }
    const connections = await nangoService.listConnections(agencyId);
    res.json({ success: true, connections });
  } catch (error) {
    logger.error('Failed to list connections', { agencyId, error: error.message });
    res.status(500).json({ error: 'Failed to list connections', message: error.message });
  }
});

/**
 * Get campaign case status
 * GET /api/campaign-harness/case/:caseId
 */
router.get('/case/:caseId', async (req, res) => {
  const { caseId } = req.params;

  try {
    const campaignCase = await campaignDatabase.getCaseById(caseId);
    if (!campaignCase) {
      return res.status(404).json({ error: 'Campaign case not found' });
    }
    res.json({ success: true, case: campaignCase });
  } catch (error) {
    logger.error('Failed to get campaign case', { caseId, error: error.message });
    res.status(500).json({ error: 'Failed to get campaign case', message: error.message });
  }
});

module.exports = router;
