/**
 * Campaign Harness - Main Export
 *
 * Exports all campaign harness services for use in the main application.
 */

const geminiService = require('./gemini.service');
const nangoService = require('./nango.service');
const whatsappService = require('./whatsapp.service');
const campaignDatabase = require('./campaign.database');
const campaignWorkflow = require('./campaign.workflow');

module.exports = {
  geminiService,
  nangoService,
  whatsappService,
  campaignDatabase,
  campaignWorkflow,
};
