/**
 * Manual Test Script for Campaign Harness
 *
 * Run with: node test/manual-test.js
 *
 * Prerequisites:
 * 1. Copy .env.example to .env and fill in credentials
 * 2. npm install
 * 3. Start the server: npm start (in another terminal)
 */

const axios = require('axios');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function testHealthCheck() {
  console.log('\n📍 Testing Health Check...');
  try {
    const res = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check passed:', res.data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testStartCampaign() {
  console.log('\n📍 Testing Start Campaign...');

  const payload = {
    agencyId: 'test-agency-123',
    jobId: 'test-job-456',
    job: {
      title: 'Senior Software Engineer',
      location: 'San Francisco, CA',
      payRate: '$150,000 - $200,000',
      category: 'technology',
      description: 'We are looking for an experienced software engineer...'
    },
    branding: {
      primaryColor: '#2563eb',
      companyName: 'Tech Corp',
      logoUrl: 'https://example.com/logo.png'
    },
    agencyPhone: '+1234567890'
  };

  try {
    const res = await axios.post(`${BASE_URL}/api/campaign-harness/start`, payload);
    console.log('✅ Start campaign response:', res.data);
    return res.data;
  } catch (error) {
    if (error.response) {
      console.log('⚠️  Start campaign error (expected without full config):', error.response.data);
    } else {
      console.error('❌ Start campaign failed:', error.message);
    }
    return null;
  }
}

async function testGetConnectUrl() {
  console.log('\n📍 Testing Get Nango Connect URL...');

  const agencyId = 'test-agency-123';
  const platform = 'facebook';

  try {
    const res = await axios.get(`${BASE_URL}/api/campaign-harness/connect/${agencyId}?platform=${platform}`);
    console.log('✅ Connect URL response:', res.data);
    return res.data;
  } catch (error) {
    if (error.response?.status === 503) {
      console.log('⚠️  Nango not configured (expected without NANGO_SECRET_KEY)');
    } else if (error.response) {
      console.log('⚠️  Connect URL error:', error.response.data);
    } else {
      console.error('❌ Connect URL failed:', error.message);
    }
    return null;
  }
}

async function testListConnections() {
  console.log('\n📍 Testing List Connections...');

  const agencyId = 'test-agency-123';

  try {
    const res = await axios.get(`${BASE_URL}/api/campaign-harness/connections/${agencyId}`);
    console.log('✅ Connections response:', res.data);
    return res.data;
  } catch (error) {
    if (error.response?.status === 503) {
      console.log('⚠️  Nango not configured (expected without NANGO_SECRET_KEY)');
    } else if (error.response) {
      console.log('⚠️  Connections error:', error.response.data);
    } else {
      console.error('❌ Connections failed:', error.message);
    }
    return null;
  }
}

async function testGetCase() {
  console.log('\n📍 Testing Get Campaign Case...');

  const caseId = 'non-existent-case';

  try {
    const res = await axios.get(`${BASE_URL}/api/campaign-harness/case/${caseId}`);
    console.log('✅ Case response:', res.data);
    return res.data;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('✅ Case not found (expected for non-existent case)');
    } else if (error.response) {
      console.log('⚠️  Case error:', error.response.data);
    } else {
      console.error('❌ Case failed:', error.message);
    }
    return null;
  }
}

async function testWebhookVerification() {
  console.log('\n📍 Testing WhatsApp Webhook Verification...');

  const verifyToken = 'test-token';
  const challenge = 'test-challenge-123';

  try {
    const res = await axios.get(`${BASE_URL}/api/campaign-harness/webhook`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': verifyToken,
        'hub.challenge': challenge
      }
    });
    console.log('⚠️  Webhook verification passed (unexpected without matching token):', res.data);
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('✅ Webhook verification rejected (expected - token mismatch)');
    } else {
      console.error('❌ Webhook verification error:', error.message);
    }
  }
}

async function runAllTests() {
  console.log('🚀 Campaign Harness Manual Tests');
  console.log('================================');
  console.log(`Testing against: ${BASE_URL}`);

  await testHealthCheck();
  await testStartCampaign();
  await testGetConnectUrl();
  await testListConnections();
  await testGetCase();
  await testWebhookVerification();

  console.log('\n================================');
  console.log('✅ All tests completed!');
  console.log('\nNote: Some tests may show warnings - this is expected');
  console.log('when running without full configuration (Nango, Supabase, etc.)');
}

runAllTests().catch(console.error);
