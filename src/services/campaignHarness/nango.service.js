/**
 * Nango Social Posting Service
 *
 * Handles OAuth connections and social media posting via Nango Cloud.
 * Supports: Instagram, Facebook, LinkedIn, X (Twitter)
 */
const logger = require('../../utils/logger');

class NangoService {
  constructor() {
    this.secretKey = process.env.NANGO_SECRET_KEY;
    this.baseUrl = process.env.NANGO_BASE_URL || 'https://api.nango.dev';

    if (this.secretKey) {
      logger.info('Nango Service initialized');
    } else {
      logger.warn('Nango secret key not configured - social posting disabled');
    }
  }

  isConfigured() {
    return !!this.secretKey;
  }

  /**
   * Get headers for Nango API requests
   * @private
   */
  _headers() {
    return {
      'Authorization': `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Generate a connect session URL for an agency to connect their social accounts
   * @param {string} agencyId - Agency identifier
   * @param {string} platform - Platform to connect (facebook, linkedin, twitter-v2)
   * @returns {Promise<Object>} { url, sessionToken }
   */
  async createConnectSession(agencyId, platform) {
    if (!this.isConfigured()) {
      throw new Error('Nango not configured');
    }

    const response = await fetch(`${this.baseUrl}/connect/sessions`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        end_user: {
          id: `agency_${agencyId}`,
          display_name: `Agency ${agencyId}`,
        },
        allowed_integrations: [platform],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create connect session: ${error}`);
    }

    const data = await response.json();
    logger.info('Connect session created', { agencyId, platform });

    return {
      url: data.url,
      sessionToken: data.token,
    };
  }

  /**
   * Check if an agency has a valid connection for a platform
   * @param {string} agencyId
   * @param {string} platform
   * @returns {Promise<Object|null>} Connection details or null
   */
  async getConnection(agencyId, platform) {
    if (!this.isConfigured()) {
      return null;
    }

    const connectionId = `agency_${agencyId}_${platform}`;

    try {
      const response = await fetch(
        `${this.baseUrl}/connection/${connectionId}?provider_config_key=${platform}`,
        { headers: this._headers() }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to get connection: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      logger.warn('Failed to get Nango connection', { agencyId, platform, error: error.message });
      return null;
    }
  }

  /**
   * List all connections for an agency
   * @param {string} agencyId
   * @returns {Promise<Array>}
   */
  async listConnections(agencyId) {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/connections?end_user_id=agency_${agencyId}`,
        { headers: this._headers() }
      );

      if (!response.ok) {
        throw new Error(`Failed to list connections: ${response.status}`);
      }

      const data = await response.json();
      return data.connections || [];
    } catch (error) {
      logger.error('Failed to list Nango connections', { agencyId, error: error.message });
      return [];
    }
  }

  /**
   * Post to Facebook Page
   * @param {string} agencyId
   * @param {Object} params
   * @param {string} params.pageId - Facebook Page ID
   * @param {string} params.imageUrl - Public URL to the image
   * @param {string} params.caption - Post caption
   * @returns {Promise<Object>} { success, postId, error }
   */
  async postToFacebook(agencyId, { pageId, imageUrl, caption }) {
    const connectionId = `agency_${agencyId}_facebook`;

    try {
      const response = await fetch(`${this.baseUrl}/proxy/facebook/${pageId}/photos`, {
        method: 'POST',
        headers: {
          ...this._headers(),
          'Connection-Id': connectionId,
          'Provider-Config-Key': 'facebook',
        },
        body: JSON.stringify({
          url: imageUrl,
          caption: caption,
          published: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const data = await response.json();
      logger.info('Posted to Facebook', { agencyId, postId: data.id });

      return { success: true, postId: data.id, platform: 'facebook' };
    } catch (error) {
      logger.error('Facebook post failed', { agencyId, error: error.message });
      return { success: false, error: error.message, platform: 'facebook' };
    }
  }

  /**
   * Post to Instagram (requires Business/Creator account)
   * Uses container-based publishing flow
   * @param {string} agencyId
   * @param {Object} params
   * @param {string} params.igUserId - Instagram Business Account ID
   * @param {string} params.imageUrl - Public HTTPS URL to JPEG image
   * @param {string} params.caption - Post caption
   * @returns {Promise<Object>} { success, postId, error }
   */
  async postToInstagram(agencyId, { igUserId, imageUrl, caption }) {
    const connectionId = `agency_${agencyId}_facebook`; // Instagram uses Facebook OAuth

    try {
      // Step 1: Create media container
      const containerResponse = await fetch(`${this.baseUrl}/proxy/facebook/${igUserId}/media`, {
        method: 'POST',
        headers: {
          ...this._headers(),
          'Connection-Id': connectionId,
          'Provider-Config-Key': 'facebook',
        },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: caption,
        }),
      });

      if (!containerResponse.ok) {
        const error = await containerResponse.text();
        throw new Error(`Container creation failed: ${error}`);
      }

      const container = await containerResponse.json();
      const containerId = container.id;

      // Step 2: Poll for container status (Instagram processes async)
      let status = 'IN_PROGRESS';
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max

      while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const statusResponse = await fetch(
          `${this.baseUrl}/proxy/facebook/${containerId}?fields=status_code`,
          {
            headers: {
              ...this._headers(),
              'Connection-Id': connectionId,
              'Provider-Config-Key': 'facebook',
            },
          }
        );

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          status = statusData.status_code || 'FINISHED';
        }
        attempts++;
      }

      if (status !== 'FINISHED') {
        throw new Error(`Container processing failed: ${status}`);
      }

      // Step 3: Publish the container
      const publishResponse = await fetch(`${this.baseUrl}/proxy/facebook/${igUserId}/media_publish`, {
        method: 'POST',
        headers: {
          ...this._headers(),
          'Connection-Id': connectionId,
          'Provider-Config-Key': 'facebook',
        },
        body: JSON.stringify({
          creation_id: containerId,
        }),
      });

      if (!publishResponse.ok) {
        const error = await publishResponse.text();
        throw new Error(`Publish failed: ${error}`);
      }

      const published = await publishResponse.json();
      logger.info('Posted to Instagram', { agencyId, postId: published.id });

      return { success: true, postId: published.id, platform: 'instagram' };
    } catch (error) {
      logger.error('Instagram post failed', { agencyId, error: error.message });
      return { success: false, error: error.message, platform: 'instagram' };
    }
  }

  /**
   * Post to LinkedIn (personal profile or organization)
   * @param {string} agencyId
   * @param {Object} params
   * @param {string} params.authorUrn - LinkedIn URN (urn:li:person:xxx or urn:li:organization:xxx)
   * @param {string} params.imageUrl - Public URL to image
   * @param {string} params.caption - Post text
   * @returns {Promise<Object>} { success, postId, error }
   */
  async postToLinkedIn(agencyId, { authorUrn, imageUrl, caption }) {
    const connectionId = `agency_${agencyId}_linkedin`;

    try {
      // Step 1: Register image upload
      const registerResponse = await fetch(`${this.baseUrl}/proxy/linkedin/rest/images?action=initializeUpload`, {
        method: 'POST',
        headers: {
          ...this._headers(),
          'Connection-Id': connectionId,
          'Provider-Config-Key': 'linkedin',
          'LinkedIn-Version': '202401',
        },
        body: JSON.stringify({
          initializeUploadRequest: {
            owner: authorUrn,
          },
        }),
      });

      if (!registerResponse.ok) {
        // Fallback: Post without image if image upload not supported
        logger.warn('LinkedIn image upload failed, posting text only');
        return await this._postLinkedInTextOnly(agencyId, authorUrn, caption);
      }

      const registerData = await registerResponse.json();
      const uploadUrl = registerData.value?.uploadUrl;
      const imageUrn = registerData.value?.image;

      if (uploadUrl && imageUrn) {
        // Upload the image
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();

        await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: Buffer.from(imageBuffer),
        });
      }

      // Step 2: Create post with image
      const postResponse = await fetch(`${this.baseUrl}/proxy/linkedin/rest/posts`, {
        method: 'POST',
        headers: {
          ...this._headers(),
          'Connection-Id': connectionId,
          'Provider-Config-Key': 'linkedin',
          'LinkedIn-Version': '202401',
        },
        body: JSON.stringify({
          author: authorUrn,
          commentary: caption,
          visibility: 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
          },
          content: imageUrn ? {
            media: {
              id: imageUrn,
            },
          } : undefined,
          lifecycleState: 'PUBLISHED',
        }),
      });

      if (!postResponse.ok) {
        const error = await postResponse.text();
        throw new Error(error);
      }

      const postId = postResponse.headers.get('x-restli-id') || 'unknown';
      logger.info('Posted to LinkedIn', { agencyId, postId });

      return { success: true, postId, platform: 'linkedin' };
    } catch (error) {
      logger.error('LinkedIn post failed', { agencyId, error: error.message });
      return { success: false, error: error.message, platform: 'linkedin' };
    }
  }

  /**
   * Post text-only to LinkedIn (fallback)
   * @private
   */
  async _postLinkedInTextOnly(agencyId, authorUrn, caption) {
    const connectionId = `agency_${agencyId}_linkedin`;

    const postResponse = await fetch(`${this.baseUrl}/proxy/linkedin/rest/posts`, {
      method: 'POST',
      headers: {
        ...this._headers(),
        'Connection-Id': connectionId,
        'Provider-Config-Key': 'linkedin',
        'LinkedIn-Version': '202401',
      },
      body: JSON.stringify({
        author: authorUrn,
        commentary: caption,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
        },
        lifecycleState: 'PUBLISHED',
      }),
    });

    if (!postResponse.ok) {
      const error = await postResponse.text();
      throw new Error(error);
    }

    const postId = postResponse.headers.get('x-restli-id') || 'unknown';
    return { success: true, postId, platform: 'linkedin' };
  }

  /**
   * Post to X (Twitter)
   * @param {string} agencyId
   * @param {Object} params
   * @param {string} params.text - Tweet text
   * @param {string} params.imageUrl - Optional image URL
   * @returns {Promise<Object>} { success, postId, error }
   */
  async postToX(agencyId, { text, imageUrl }) {
    const connectionId = `agency_${agencyId}_twitter-v2`;

    try {
      let mediaId = null;

      // Upload media if provided
      if (imageUrl) {
        mediaId = await this._uploadTwitterMedia(connectionId, imageUrl);
      }

      // Create tweet
      const tweetBody = {
        text: text,
      };

      if (mediaId) {
        tweetBody.media = { media_ids: [mediaId] };
      }

      const response = await fetch(`${this.baseUrl}/proxy/twitter-v2/2/tweets`, {
        method: 'POST',
        headers: {
          ...this._headers(),
          'Connection-Id': connectionId,
          'Provider-Config-Key': 'twitter-v2',
        },
        body: JSON.stringify(tweetBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const data = await response.json();
      logger.info('Posted to X', { agencyId, tweetId: data.data?.id });

      return { success: true, postId: data.data?.id, platform: 'x' };
    } catch (error) {
      logger.error('X post failed', { agencyId, error: error.message });
      return { success: false, error: error.message, platform: 'x' };
    }
  }

  /**
   * Upload media to Twitter
   * @private
   */
  async _uploadTwitterMedia(connectionId, imageUrl) {
    // Twitter media upload is complex (chunked), simplified version here
    // In production, use Twitter's chunked media upload

    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    const response = await fetch(`${this.baseUrl}/proxy/twitter-v2/1.1/media/upload.json`, {
      method: 'POST',
      headers: {
        ...this._headers(),
        'Connection-Id': connectionId,
        'Provider-Config-Key': 'twitter-v2',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `media_data=${encodeURIComponent(base64Image)}`,
    });

    if (!response.ok) {
      logger.warn('Twitter media upload failed, posting without image');
      return null;
    }

    const data = await response.json();
    return data.media_id_string;
  }

  /**
   * Post to multiple platforms in parallel
   * @param {string} agencyId
   * @param {Array<string>} platforms - ['instagram', 'facebook', 'linkedin', 'x']
   * @param {Object} postData
   * @param {string} postData.imageUrl
   * @param {string} postData.caption
   * @param {Object} postData.platformConfig - Platform-specific config (pageId, igUserId, etc.)
   * @returns {Promise<Array>} Results per platform
   */
  async postToMultiplePlatforms(agencyId, platforms, postData) {
    const { imageUrl, caption, platformConfig = {} } = postData;
    const results = [];

    const postPromises = platforms.map(async (platform) => {
      switch (platform.toLowerCase()) {
        case 'facebook':
          return this.postToFacebook(agencyId, {
            pageId: platformConfig.facebookPageId,
            imageUrl,
            caption,
          });

        case 'instagram':
          return this.postToInstagram(agencyId, {
            igUserId: platformConfig.instagramUserId,
            imageUrl,
            caption,
          });

        case 'linkedin':
          return this.postToLinkedIn(agencyId, {
            authorUrn: platformConfig.linkedinAuthorUrn,
            imageUrl,
            caption,
          });

        case 'x':
        case 'twitter':
          return this.postToX(agencyId, {
            text: caption,
            imageUrl,
          });

        default:
          return { success: false, error: `Unknown platform: ${platform}`, platform };
      }
    });

    const settled = await Promise.allSettled(postPromises);

    for (let i = 0; i < settled.length; i++) {
      if (settled[i].status === 'fulfilled') {
        results.push(settled[i].value);
      } else {
        results.push({
          success: false,
          error: settled[i].reason?.message || 'Unknown error',
          platform: platforms[i],
        });
      }
    }

    return results;
  }
}

module.exports = new NangoService();
