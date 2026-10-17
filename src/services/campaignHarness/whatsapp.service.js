/**
 * WhatsApp Business API Service
 *
 * Handles sending campaign images and interactive messages to agencies.
 * Uses WhatsApp Cloud API for business messaging.
 */
const logger = require('../../utils/logger');

class WhatsAppService {
  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    this.baseUrl = 'https://graph.facebook.com/v18.0';

    if (this.accessToken && this.phoneNumberId) {
      logger.info('WhatsApp Service initialized');
    } else {
      logger.warn('WhatsApp credentials not configured - messaging disabled');
    }
  }

  isConfigured() {
    return !!(this.accessToken && this.phoneNumberId);
  }

  /**
   * Send campaign image with approval buttons
   * @param {Object} params
   * @param {string} params.to - Recipient phone number (with country code)
   * @param {string} params.imageUrl - Public URL to campaign image
   * @param {string} params.jobTitle - Job title for caption
   * @param {string} params.location - Job location
   * @param {string} params.payRate - Pay rate
   * @returns {Promise<Object>} { success, messageId, error }
   */
  async sendCampaignApproval(params) {
    const { to, imageUrl, jobTitle, location, payRate } = params;

    if (!this.isConfigured()) {
      throw new Error('WhatsApp not configured');
    }

    const caption = `🏗️ Here's your campaign image for "${jobTitle}" — ${location}, ${payRate}.\n\nReady to post this?`;

    try {
      // Send image with interactive buttons
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'interactive',
          interactive: {
            type: 'button',
            header: {
              type: 'image',
              image: {
                link: imageUrl,
              },
            },
            body: {
              text: caption,
            },
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: {
                    id: 'approve',
                    title: '✅ Approve',
                  },
                },
                {
                  type: 'reply',
                  reply: {
                    id: 'decline',
                    title: '❌ Decline',
                  },
                },
              ],
            },
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(JSON.stringify(error));
      }

      const data = await response.json();
      const messageId = data.messages?.[0]?.id;

      logger.info('Campaign approval message sent', { to, messageId });
      return { success: true, messageId };
    } catch (error) {
      logger.error('Failed to send WhatsApp message', { to, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send platform selection message
   * @param {string} to - Recipient phone number
   * @returns {Promise<Object>}
   */
  async sendPlatformSelection(to) {
    if (!this.isConfigured()) {
      throw new Error('WhatsApp not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'text',
          text: {
            body: 'Which platforms should this go out to? (Instagram, Facebook, LinkedIn, X — reply with any combination)',
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(JSON.stringify(error));
      }

      const data = await response.json();
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      logger.error('Failed to send platform selection message', { to, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send platform confirmation with buttons
   * @param {string} to - Recipient phone number
   * @param {Array<string>} platforms - Parsed platforms
   * @returns {Promise<Object>}
   */
  async sendPlatformConfirmation(to, platforms) {
    if (!this.isConfigured()) {
      throw new Error('WhatsApp not configured');
    }

    const platformList = platforms.join(', ');

    try {
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: `Posting to: ${platformList}. Confirm?`,
            },
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: {
                    id: 'confirm_platforms',
                    title: '✅ Yes',
                  },
                },
                {
                  type: 'reply',
                  reply: {
                    id: 'change_platforms',
                    title: '✏️ Change',
                  },
                },
              ],
            },
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(JSON.stringify(error));
      }

      const data = await response.json();
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      logger.error('Failed to send platform confirmation', { to, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send posting summary
   * @param {string} to - Recipient phone number
   * @param {Array<Object>} results - Posting results per platform
   * @param {string} trackingLink - ClikHire tracking link
   * @returns {Promise<Object>}
   */
  async sendPostingSummary(to, results, trackingLink) {
    if (!this.isConfigured()) {
      throw new Error('WhatsApp not configured');
    }

    const successPlatforms = results.filter(r => r.success).map(r => r.platform);
    const failedPlatforms = results.filter(r => !r.success);

    let message = '';

    if (successPlatforms.length > 0) {
      message += `✅ Posted to ${successPlatforms.join(' and ')}.\n`;
    }

    for (const failed of failedPlatforms) {
      message += `⚠️ ${failed.platform} failed: ${failed.error}\n`;
    }

    if (trackingLink) {
      message += `\nYour tracking link is live: ${trackingLink}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'text',
          text: {
            body: message.trim(),
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(JSON.stringify(error));
      }

      const data = await response.json();
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      logger.error('Failed to send posting summary', { to, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send template message (for outside 24-hour window)
   * @param {Object} params
   * @param {string} params.to - Recipient phone number
   * @param {string} params.templateName - Pre-approved template name
   * @param {string} params.imageUrl - Image URL for header
   * @param {Object} params.variables - Template variables
   * @returns {Promise<Object>}
   */
  async sendTemplate(params) {
    const { to, templateName, imageUrl, variables } = params;

    if (!this.isConfigured()) {
      throw new Error('WhatsApp not configured');
    }

    const components = [];

    if (imageUrl) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: { link: imageUrl },
          },
        ],
      });
    }

    if (variables) {
      components.push({
        type: 'body',
        parameters: Object.values(variables).map(value => ({
          type: 'text',
          text: value,
        })),
      });
    }

    try {
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: components,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(JSON.stringify(error));
      }

      const data = await response.json();
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      logger.error('Failed to send template message', { to, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse platform selection from user message
   * @param {string} message - User's free-text response
   * @returns {Array<string>} Parsed platforms
   */
  parsePlatformSelection(message) {
    const platforms = [];
    const text = message.toLowerCase();

    if (text.includes('instagram') || text.includes('insta') || text.includes('ig')) {
      platforms.push('instagram');
    }
    if (text.includes('facebook') || text.includes('fb')) {
      platforms.push('facebook');
    }
    if (text.includes('linkedin') || text.includes('li')) {
      platforms.push('linkedin');
    }
    if (text.includes('twitter') || text.includes('x') || text.match(/\bx\b/)) {
      platforms.push('x');
    }

    // Handle "all" or "everything"
    if (text.includes('all') || text.includes('everything') || text.includes('every')) {
      return ['instagram', 'facebook', 'linkedin', 'x'];
    }

    return platforms;
  }
}

module.exports = new WhatsAppService();
