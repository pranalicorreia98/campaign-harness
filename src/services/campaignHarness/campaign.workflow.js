/**
 * Campaign Harness Workflow
 *
 * Orchestrates the campaign generation and posting flow.
 * This is a state machine implementation (simpler than full LangGraph for Node.js).
 *
 * States:
 * - generating: Creating campaign image
 * - awaiting_approval: Waiting for agency to approve/decline
 * - awaiting_platforms: Waiting for platform selection
 * - confirming_platforms: Waiting for platform confirmation
 * - posting: Posting to platforms
 * - completed: All done
 * - cancelled: Agency declined
 * - failed: Error occurred
 */
const logger = require('../../utils/logger');
const geminiService = require('./gemini.service');
const nangoService = require('./nango.service');
const whatsappService = require('./whatsapp.service');
const campaignDb = require('./campaign.database');

class CampaignWorkflow {
  constructor() {
    this.STATES = {
      GENERATING: 'generating',
      AWAITING_APPROVAL: 'awaiting_approval',
      AWAITING_PLATFORMS: 'awaiting_platforms',
      CONFIRMING_PLATFORMS: 'confirming_platforms',
      POSTING: 'posting',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      FAILED: 'failed',
    };
  }

  /**
   * Start a new campaign workflow
   * @param {Object} params
   * @param {string} params.agencyId
   * @param {string} params.jobId
   * @param {Object} params.job - Job posting data
   * @param {Object} params.branding - Agency branding data
   * @param {string} params.agencyPhone - Agency's WhatsApp number
   * @returns {Promise<Object>} Campaign case
   */
  async startCampaign(params) {
    const { agencyId, jobId, job, branding, agencyPhone } = params;

    logger.info('Starting campaign workflow', { agencyId, jobId, jobTitle: job.title });

    // Create campaign case
    const campaignCase = await campaignDb.createCampaignCase({
      agencyId,
      jobId,
      jobData: job,
      brandingData: branding,
    });

    // Update with phone number
    await campaignDb.updateCaseStatus(campaignCase.id, 'generating', {
      agency_phone: agencyPhone,
    });

    // Generate image
    try {
      await this._generateAndSendImage(campaignCase.id, job, branding, agencyPhone);
    } catch (error) {
      logger.error('Failed to generate campaign image', { caseId: campaignCase.id, error: error.message });
      await campaignDb.updateCaseStatus(campaignCase.id, 'failed', { error: error.message });
      throw error;
    }

    return campaignCase;
  }

  /**
   * Generate image and send to agency for approval
   * @private
   */
  async _generateAndSendImage(caseId, job, branding, agencyPhone) {
    // Generate background with Gemini
    let imagePath;

    if (geminiService.isConfigured()) {
      try {
        const imageBuffer = await geminiService.generateBackground({
          category: job.category,
          title: job.title,
          location: job.location,
        });

        // Save to temp file
        const filename = `campaign_${caseId}_${Date.now()}.png`;
        imagePath = await geminiService.saveToTemp(imageBuffer, filename);

        logger.info('Generated campaign image with Gemini', { caseId, imagePath });
      } catch (error) {
        logger.warn('Gemini generation failed, using fallback', { error: error.message });
        // Could use a fallback static image here
        imagePath = await this._getFallbackImage(job.category);
      }
    } else {
      // Use fallback static image
      imagePath = await this._getFallbackImage(job.category);
    }

    // Save image path to case
    await campaignDb.saveImagePath(caseId, imagePath);

    // For now, we'll use the local path. In production, upload to S3/Supabase Storage
    // and get a public URL
    const imageUrl = await this._getPublicImageUrl(imagePath);

    // Send WhatsApp message with approval buttons
    if (whatsappService.isConfigured()) {
      const result = await whatsappService.sendCampaignApproval({
        to: agencyPhone,
        imageUrl,
        jobTitle: job.title,
        location: job.location,
        payRate: job.pay_rate || job.payRate,
      });

      if (result.success) {
        await campaignDb.updateCaseStatus(caseId, 'awaiting_approval', {
          last_message_id: result.messageId,
        });
      } else {
        throw new Error(`Failed to send WhatsApp message: ${result.error}`);
      }
    } else {
      logger.warn('WhatsApp not configured, skipping message send');
      await campaignDb.updateCaseStatus(caseId, 'awaiting_approval');
    }
  }

  /**
   * Handle incoming WhatsApp webhook message
   * @param {Object} message - Incoming message data
   * @returns {Promise<void>}
   */
  async handleWebhookMessage(message) {
    const { from, text, buttonReplyId, messageId } = message;

    // Find the pending case for this phone number
    const campaignCase = await campaignDb.findPendingCaseByPhone(from);

    if (!campaignCase) {
      logger.info('No pending campaign for phone', { from });
      return;
    }

    const caseId = campaignCase.id;
    const status = campaignCase.status;

    logger.info('Processing webhook for campaign', { caseId, status, from });

    switch (status) {
      case this.STATES.AWAITING_APPROVAL:
        await this._handleApprovalResponse(caseId, campaignCase, from, buttonReplyId);
        break;

      case this.STATES.AWAITING_PLATFORMS:
        await this._handlePlatformSelection(caseId, campaignCase, from, text);
        break;

      case this.STATES.CONFIRMING_PLATFORMS:
        await this._handlePlatformConfirmation(caseId, campaignCase, from, buttonReplyId);
        break;

      default:
        logger.info('Ignoring message for campaign in state', { caseId, status });
    }
  }

  /**
   * Handle approval/decline response
   * @private
   */
  async _handleApprovalResponse(caseId, campaignCase, from, buttonReplyId) {
    if (buttonReplyId === 'approve') {
      // Move to platform selection
      await campaignDb.updateCaseStatus(caseId, 'awaiting_platforms');

      if (whatsappService.isConfigured()) {
        await whatsappService.sendPlatformSelection(from);
      }

      logger.info('Campaign approved, awaiting platform selection', { caseId });
    } else if (buttonReplyId === 'decline') {
      await campaignDb.updateCaseStatus(caseId, 'cancelled');
      logger.info('Campaign declined by agency', { caseId });
    }
  }

  /**
   * Handle platform selection free-text response
   * @private
   */
  async _handlePlatformSelection(caseId, campaignCase, from, text) {
    // Parse platforms from text
    const platforms = whatsappService.parsePlatformSelection(text);

    if (platforms.length === 0) {
      // Ask again
      if (whatsappService.isConfigured()) {
        await whatsappService.sendPlatformSelection(from);
      }
      return;
    }

    // Save platforms and ask for confirmation
    await campaignDb.savePlatforms(caseId, platforms);

    if (whatsappService.isConfigured()) {
      await whatsappService.sendPlatformConfirmation(from, platforms);
    }

    logger.info('Platforms selected, awaiting confirmation', { caseId, platforms });
  }

  /**
   * Handle platform confirmation response
   * @private
   */
  async _handlePlatformConfirmation(caseId, campaignCase, from, buttonReplyId) {
    if (buttonReplyId === 'confirm_platforms') {
      // Start posting
      await this._postToPlatforms(caseId, campaignCase, from);
    } else if (buttonReplyId === 'change_platforms') {
      // Go back to platform selection
      await campaignDb.updateCaseStatus(caseId, 'awaiting_platforms');

      if (whatsappService.isConfigured()) {
        await whatsappService.sendPlatformSelection(from);
      }
    }
  }

  /**
   * Post to selected platforms
   * @private
   */
  async _postToPlatforms(caseId, campaignCase, agencyPhone) {
    await campaignDb.updateCaseStatus(caseId, 'posting');

    const platforms = campaignCase.selected_platforms || [];
    const imageUrl = await this._getPublicImageUrl(campaignCase.image_path);
    const jobData = campaignCase.job_data;
    const agencyId = campaignCase.agency_id;

    // Get tracking link (stubbed for now)
    const trackingLink = await this._getTrackingLink(campaignCase.job_id, agencyId);

    // Build caption
    const caption = this._buildCaption(jobData, trackingLink);

    // Get platform config from agency connections
    const platformConfig = await this._getPlatformConfig(agencyId);

    // Post to all platforms
    let results = [];

    if (nangoService.isConfigured()) {
      results = await nangoService.postToMultiplePlatforms(
        agencyId,
        platforms,
        {
          imageUrl,
          caption,
          platformConfig,
        }
      );
    } else {
      // Mock results for testing
      results = platforms.map(p => ({
        platform: p,
        success: false,
        error: 'Nango not configured',
      }));
    }

    // Record results
    await campaignDb.recordPostingResults(caseId, results);

    // Send summary to agency
    if (whatsappService.isConfigured()) {
      await whatsappService.sendPostingSummary(agencyPhone, results, trackingLink);
    }

    logger.info('Campaign posting completed', { caseId, results });
  }

  /**
   * Build post caption
   * @private
   */
  _buildCaption(jobData, trackingLink) {
    const { title, location, pay_rate, payRate, job_type, jobType } = jobData;
    const pay = pay_rate || payRate || '';
    const type = job_type || jobType || 'Full-Time';

    let caption = `🏗️ NOW HIRING: ${title}\n\n`;
    caption += `📍 ${location}\n`;
    caption += `💰 ${pay}\n`;
    caption += `⏰ ${type}\n\n`;
    caption += `Apply now! 👇\n${trackingLink}`;

    return caption;
  }

  /**
   * Get tracking link from ClikHire API (stubbed)
   * @private
   */
  async _getTrackingLink(jobId, agencyId) {
    // In production, call ClikHire API:
    // GET /internal/campaigns/{jobId}/apply-link?agency_id={agencyId}
    return `https://clikhire.ai/a/${jobId.substr(0, 8)}`;
  }

  /**
   * Get platform-specific config from agency connections
   * @private
   */
  async _getPlatformConfig(agencyId) {
    const connections = await campaignDb.getAgencyConnections(agencyId);

    const config = {};

    for (const conn of connections) {
      switch (conn.platform) {
        case 'facebook':
          config.facebookPageId = conn.external_account_id;
          break;
        case 'instagram':
          config.instagramUserId = conn.external_account_id;
          break;
        case 'linkedin':
          config.linkedinAuthorUrn = conn.external_account_id;
          break;
      }
    }

    return config;
  }

  /**
   * Get public URL for image (upload to S3/Supabase if needed)
   * @private
   */
  async _getPublicImageUrl(imagePath) {
    // In production, upload to S3 or Supabase Storage and return public URL
    // For now, assume we have a configured public URL base
    const publicBase = process.env.CAMPAIGN_IMAGES_PUBLIC_URL || 'https://your-bucket.s3.amazonaws.com';
    const filename = imagePath.split('/').pop();
    return `${publicBase}/${filename}`;
  }

  /**
   * Get fallback static image for category
   * @private
   */
  async _getFallbackImage(category) {
    // Use static fallback images from campaign-artifact-engine templates
    const fallbacks = {
      warehouse: 'warehouse_clean_bg.png',
      construction: 'construction_bold_bg.png',
      driver: 'driver_highlight_bg.png',
      default: 'general_bg.png',
    };

    const filename = fallbacks[category?.toLowerCase()] || fallbacks.default;
    return `/app/templates/assets/backgrounds/${filename}`;
  }
}

module.exports = new CampaignWorkflow();
