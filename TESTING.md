# Testing Campaign Harness

## Quick Start

### 1. Install & Configure

```bash
cd campaign-harness
npm install
cp .env.example .env
```

Edit `.env` - for basic testing you only need:
```
PORT=3000
```

### 2. Start the Server

```bash
npm start
# or for auto-reload:
npm run dev
```

### 3. Run Tests

```bash
# Test all endpoints
npm run test:manual

# Simulate WhatsApp webhooks
npm run test:webhook
```

---

## Manual Testing with cURL

### Health Check

```bash
curl http://localhost:3000/health
```

### Start Campaign

```bash
curl -X POST http://localhost:3000/api/campaign-harness/start \
  -H "Content-Type: application/json" \
  -d '{
    "agencyId": "test-agency-123",
    "jobId": "test-job-456",
    "job": {
      "title": "Senior Software Engineer",
      "location": "San Francisco, CA",
      "payRate": "$150,000 - $200,000",
      "category": "technology"
    },
    "branding": {
      "primaryColor": "#2563eb",
      "companyName": "Tech Corp"
    },
    "agencyPhone": "+1234567890"
  }'
```

### Get Nango Connect URL

```bash
curl "http://localhost:3000/api/campaign-harness/connect/test-agency-123?platform=facebook"
```

### List Social Connections

```bash
curl http://localhost:3000/api/campaign-harness/connections/test-agency-123
```

### Get Campaign Case

```bash
curl http://localhost:3000/api/campaign-harness/case/some-case-id
```

### WhatsApp Webhook Verification

```bash
curl "http://localhost:3000/api/campaign-harness/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

### Simulate WhatsApp Button Click

```bash
curl -X POST http://localhost:3000/api/campaign-harness/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "+1234567890",
            "id": "test-msg-id",
            "type": "interactive",
            "interactive": {
              "button_reply": {
                "id": "approve_campaign",
                "title": "Approve"
              }
            }
          }]
        }
      }]
    }]
  }'
```

---

## Testing with Full Configuration

For end-to-end testing, configure these services:

### 1. Supabase Database

Create tables (see README.md for SQL) and add to `.env`:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### 2. Nango Cloud

1. Sign up at https://app.nango.dev
2. Add integrations: `facebook`, `instagram`, `linkedin`, `twitter-v2`
3. Add to `.env`:
```
NANGO_SECRET_KEY=xxx
```

### 3. WhatsApp Business API

1. Set up in Meta Business Suite
2. Add to `.env`:
```
WHATSAPP_ACCESS_TOKEN=xxx
WHATSAPP_PHONE_NUMBER_ID=xxx
WHATSAPP_VERIFY_TOKEN=your-chosen-token
```

### 4. Google AI (Gemini)

1. Get API key from https://aistudio.google.com
2. Add to `.env`:
```
GOOGLE_AI_API_KEY=xxx
```

---

## Testing Flow Walkthrough

With full configuration, the complete flow is:

1. **Start Campaign**
   - POST `/api/campaign-harness/start` with job data
   - Service generates AI image using Gemini
   - Sends WhatsApp message with image + Approve/Decline buttons

2. **Agency Approves (via WhatsApp)**
   - Webhook receives button click
   - Sends platform selection prompt

3. **Agency Selects Platforms (WhatsApp text)**
   - Webhook receives text like "Facebook, Instagram"
   - Sends confirmation message

4. **Agency Confirms**
   - Webhook receives confirmation button
   - Posts to all selected platforms via Nango
   - Sends summary with results

---

## Troubleshooting

### "Nango not configured"
Add `NANGO_SECRET_KEY` to `.env`

### "Cannot read properties of undefined"
Usually missing Supabase config - add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

### Webhook not receiving events
- Ensure your server is publicly accessible (use ngrok for local testing)
- Verify webhook URL is registered in Meta Business Suite
- Check `WHATSAPP_VERIFY_TOKEN` matches what you configured in Meta
