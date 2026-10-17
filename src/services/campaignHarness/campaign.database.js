/**
 * Campaign Database Service
 *
 * Handles all database operations for the campaign harness.
 * Uses Supabase for storage.
 */
const { createClient } = require('@supabase/supabase-js');
const logger = require('../../utils/logger');

class CampaignDatabaseService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!this.supabaseUrl || !this.supabaseKey) {
      logger.warn('Supabase not configured for campaign database');
      this.client = null;
      return;
    }

    this.client = createClient(this.supabaseUrl, this.supabaseKey);
    logger.info('Campaign Database Service initialized');
  }

  isConfigured() {
    return !!this.client;
  }

  /**
   * Create a new campaign case
   * @param {Object} params
   * @param {string} params.agencyId
   * @param {string} params.jobId
   * @param {Object} params.jobData - Job posting data
   * @param {Object} params.brandingData - Agency branding data
   * @returns {Promise<Object>} Created campaign case
   */
  async createCampaignCase(params) {
    const { agencyId, jobId, jobData, brandingData } = params;

    if (!this.isConfigured()) {
      throw new Error('Database not configured');
    }

    const threadId = `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { data, error } = await this.client
      .from('campaign_cases')
      .insert({
        agency_id: agencyId,
        job_id: jobId,
        status: 'generating',
        thread_id: threadId,
        job_data: jobData,
        branding_data: brandingData,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create campaign case', { error: error.message });
      throw error;
    }

    logger.info('Campaign case created', { id: data.id, threadId });
    return data;
  }

  /**
   * Update campaign case status
   * @param {string} caseId
   * @param {string} status
   * @param {Object} additionalFields
   * @returns {Promise<Object>}
   */
  async updateCaseStatus(caseId, status, additionalFields = {}) {
    if (!this.isConfigured()) {
      throw new Error('Database not configured');
    }

    const { data, error } = await this.client
      .from('campaign_cases')
      .update({
        status,
        ...additionalFields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update campaign case', { caseId, error: error.message });
      throw error;
    }

    logger.info('Campaign case updated', { caseId, status });
    return data;
  }

  /**
   * Get campaign case by ID
   * @param {string} caseId
   * @returns {Promise<Object|null>}
   */
  async getCaseById(caseId) {
    if (!this.isConfigured()) {
      return null;
    }

    const { data, error } = await this.client
      .from('campaign_cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (error) {
      logger.error('Failed to get campaign case', { caseId, error: error.message });
      return null;
    }

    return data;
  }

  /**
   * Get campaign case by thread ID
   * @param {string} threadId
   * @returns {Promise<Object|null>}
   */
  async getCaseByThreadId(threadId) {
    if (!this.isConfigured()) {
      return null;
    }

    const { data, error } = await this.client
      .from('campaign_cases')
      .select('*')
      .eq('thread_id', threadId)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('Failed to get campaign case by thread', { threadId, error: error.message });
      return null;
    }

    return data;
  }

  /**
   * Get campaign case by WhatsApp message ID
   * @param {string} messageId
   * @returns {Promise<Object|null>}
   */
  async getCaseByMessageId(messageId) {
    if (!this.isConfigured()) {
      return null;
    }

    const { data, error } = await this.client
      .from('campaign_cases')
      .select('*')
      .eq('last_message_id', messageId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return null;
    }

    return data;
  }

  /**
   * Find pending case for an agency phone number
   * @param {string} phoneNumber
   * @returns {Promise<Object|null>}
   */
  async findPendingCaseByPhone(phoneNumber) {
    if (!this.isConfigured()) {
      return null;
    }

    const { data, error } = await this.client
      .from('campaign_cases')
      .select('*')
      .eq('agency_phone', phoneNumber)
      .in('status', ['awaiting_approval', 'awaiting_platforms', 'confirming_platforms'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      return null;
    }

    return data;
  }

  /**
   * Save generated image path
   * @param {string} caseId
   * @param {string} imagePath
   * @returns {Promise<Object>}
   */
  async saveImagePath(caseId, imagePath) {
    return this.updateCaseStatus(caseId, 'awaiting_approval', { image_path: imagePath });
  }

  /**
   * Save selected platforms
   * @param {string} caseId
   * @param {Array<string>} platforms
   * @returns {Promise<Object>}
   */
  async savePlatforms(caseId, platforms) {
    return this.updateCaseStatus(caseId, 'confirming_platforms', { selected_platforms: platforms });
  }

  /**
   * Record posting results
   * @param {string} caseId
   * @param {Array<Object>} results
   * @returns {Promise<void>}
   */
  async recordPostingResults(caseId, results) {
    if (!this.isConfigured()) {
      return;
    }

    // Insert individual post records
    for (const result of results) {
      await this.client
        .from('campaign_posts')
        .insert({
          case_id: caseId,
          platform: result.platform,
          status: result.success ? 'success' : 'failed',
          platform_post_id: result.postId || null,
          error_detail: result.error || null,
          posted_at: result.success ? new Date().toISOString() : null,
        });
    }

    // Update case status
    const allSucceeded = results.every(r => r.success);
    const anySucceeded = results.some(r => r.success);

    let status = 'completed';
    if (!anySucceeded) {
      status = 'failed';
    } else if (!allSucceeded) {
      status = 'partial_success';
    }

    await this.updateCaseStatus(caseId, status, { posting_results: results });

    logger.info('Posting results recorded', { caseId, status, results: results.length });
  }

  /**
   * Get or create agency social connection reference
   * @param {string} agencyId
   * @param {string} platform
   * @param {string} nangoConnectionId
   * @param {string} externalAccountId
   * @returns {Promise<Object>}
   */
  async upsertSocialConnection(agencyId, platform, nangoConnectionId, externalAccountId) {
    if (!this.isConfigured()) {
      throw new Error('Database not configured');
    }

    const { data, error } = await this.client
      .from('agency_social_connections')
      .upsert({
        agency_id: agencyId,
        platform,
        nango_connection_id: nangoConnectionId,
        external_account_id: externalAccountId,
        status: 'active',
        connected_at: new Date().toISOString(),
      }, {
        onConflict: 'agency_id,platform',
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to upsert social connection', { error: error.message });
      throw error;
    }

    return data;
  }

  /**
   * Get agency's social connections
   * @param {string} agencyId
   * @returns {Promise<Array>}
   */
  async getAgencyConnections(agencyId) {
    if (!this.isConfigured()) {
      return [];
    }

    const { data, error } = await this.client
      .from('agency_social_connections')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('status', 'active');

    if (error) {
      logger.error('Failed to get agency connections', { agencyId, error: error.message });
      return [];
    }

    return data || [];
  }

  /**
   * Mark connection as needing reconnect
   * @param {string} agencyId
   * @param {string} platform
   * @returns {Promise<void>}
   */
  async markConnectionNeedsReconnect(agencyId, platform) {
    if (!this.isConfigured()) {
      return;
    }

    await this.client
      .from('agency_social_connections')
      .update({ status: 'needs_reconnect' })
      .eq('agency_id', agencyId)
      .eq('platform', platform);

    logger.info('Connection marked as needs_reconnect', { agencyId, platform });
  }

  /**
   * Get agency details including phone number
   * @param {string} agencyId
   * @returns {Promise<Object|null>}
   */
  async getAgency(agencyId) {
    if (!this.isConfigured()) {
      return null;
    }

    const { data, error } = await this.client
      .from('agencies')
      .select('*')
      .eq('id', agencyId)
      .single();

    if (error) {
      logger.error('Failed to get agency', { agencyId, error: error.message });
      return null;
    }

    return data;
  }

  /**
   * Get stale cases for sweep job
   * @param {number} hoursOld - Cases older than this many hours
   * @returns {Promise<Array>}
   */
  async getStaleCases(hoursOld = 48) {
    if (!this.isConfigured()) {
      return [];
    }

    const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.client
      .from('campaign_cases')
      .select('*')
      .in('status', ['awaiting_approval', 'awaiting_platforms', 'confirming_platforms'])
      .lt('updated_at', cutoff);

    if (error) {
      logger.error('Failed to get stale cases', { error: error.message });
      return [];
    }

    return data || [];
  }
}

module.exports = new CampaignDatabaseService();
