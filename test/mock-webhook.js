/**
 * Mock WhatsApp Webhook Test
 *
 * Simulates WhatsApp webhook events to test the campaign flow.
 * Run with: node test/mock-webhook.js
 */

const axios = require('axios');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Simulate a button click (Approve/Decline)
async function simulateButtonClick(from, buttonId, buttonTitle) {
  console.log(`\n📱 Simulating button click: ${buttonTitle} from ${from}`);

  const webhookPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15550000000',
            phone_number_id: 'PHONE_NUMBER_ID'
          },
          messages: [{
            from: from,
            id: 'wamid.test123',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'interactive',
            interactive: {
              type: 'button_reply',
              button_reply: {
                id: buttonId,
                title: buttonTitle
              }
            }
          }]
        },
        field: 'messages'
      }]
    }]
  };

  try {
    const res = await axios.post(`${BASE_URL}/api/campaign-harness/webhook`, webhookPayload);
    console.log('✅ Webhook accepted (status:', res.status, ')');
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
  }
}

// Simulate a text message (platform selection)
async function simulateTextMessage(from, text) {
  console.log(`\n📱 Simulating text message: "${text}" from ${from}`);

  const webhookPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15550000000',
            phone_number_id: 'PHONE_NUMBER_ID'
          },
          messages: [{
            from: from,
            id: 'wamid.test456',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'text',
            text: {
              body: text
            }
          }]
        },
        field: 'messages'
      }]
    }]
  };

  try {
    const res = await axios.post(`${BASE_URL}/api/campaign-harness/webhook`, webhookPayload);
    console.log('✅ Webhook accepted (status:', res.status, ')');
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
  }
}

async function runWebhookTests() {
  console.log('🧪 WhatsApp Webhook Simulation Tests');
  console.log('====================================');
  console.log(`Testing against: ${BASE_URL}\n`);

  const testPhone = '+1234567890';

  // Test 1: Approve button click
  await simulateButtonClick(testPhone, 'approve_campaign', 'Approve ✓');

  // Wait a bit
  await new Promise(r => setTimeout(r, 500));

  // Test 2: Decline button click
  await simulateButtonClick(testPhone, 'decline_campaign', 'Decline ✗');

  // Wait a bit
  await new Promise(r => setTimeout(r, 500));

  // Test 3: Platform selection text
  await simulateTextMessage(testPhone, 'Facebook, Instagram, LinkedIn');

  // Test 4: Confirmation button
  await simulateButtonClick(testPhone, 'confirm_platforms', 'Yes, post now');

  console.log('\n====================================');
  console.log('✅ Webhook simulation tests completed!');
  console.log('\nNote: Without a real campaign case in the database,');
  console.log('these webhooks will be processed but may not find matching cases.');
}

runWebhookTests().catch(console.error);
