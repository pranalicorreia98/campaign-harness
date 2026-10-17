# Campaign Harness

WhatsApp-native campaign harness for social media posting with Nango OAuth integration.

## Overview

This service enables agencies to:
1. Generate AI-powered campaign images using Google Gemini
2. Approve campaigns via WhatsApp with interactive buttons
3. Connect social media accounts via Nango OAuth
4. Post to Facebook, Instagram, LinkedIn, and X/Twitter

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Agency User   │────▶│  WhatsApp Cloud  │────▶│ Campaign Harness│
│   (WhatsApp)    │◀────│      API         │◀────│     Service     │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                        ┌──────────────────┐              │
                        │   Nango Cloud    │◀─────────────┤
                        │  (OAuth + APIs)  │              │
                        └────────┬─────────┘              │
                                 │                        │
         ┌───────────────────────┼───────────────────────┐│
         ▼           ▼           ▼           ▼           ▼▼
    ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
    │Facebook│  │Instagram│  │LinkedIn│  │X/Twitter│ │ Gemini │
    └────────┘  └────────┘  └────────┘  └────────┘  └────────┘
```

## Campaign Flow

1. **Start Campaign** → POST `/api/campaign-harness/start`
2. **Generate Image** → Gemini AI creates campaign background
3. **WhatsApp Approval** → Agency receives image with Approve/Decline buttons
4. **Platform Selection** → Agency specifies target platforms (text reply)
5. **Post to Platforms** → Nango posts to selected social accounts
6. **Summary** → Agency receives posting results via WhatsApp

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/campaign-harness/start` | Start a new campaign |
| POST | `/api/campaign-harness/webhook` | WhatsApp webhook handler |
| GET | `/api/campaign-harness/webhook` | WhatsApp webhook verification |
| GET | `/api/campaign-harness/connect/:agencyId` | Get Nango OAuth URL |
| GET | `/api/campaign-harness/connections/:agencyId` | List connected accounts |
| GET | `/api/campaign-harness/case/:caseId` | Get campaign case status |

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Set Up Nango Cloud

1. Create account at [app.nango.dev](https://app.nango.dev)
2. Add integrations: `facebook`, `instagram`, `linkedin`, `twitter-v2`
3. Copy Secret Key to `NANGO_SECRET_KEY`

### 4. Set Up WhatsApp Business API

1. Go to Meta Business Suite → WhatsApp → API Setup
2. Get Access Token and Phone Number ID
3. Configure webhook URL: `https://your-domain.com/api/campaign-harness/webhook`

### 5. Set Up Google AI

1. Get API key from [Google AI Studio](https://aistudio.google.com)
2. Add to `GOOGLE_AI_API_KEY`

### 6. Create Database Tables

Run the migration in your Supabase project:

```sql
-- Campaign cases table
CREATE TABLE campaign_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL,
  job_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  job_data JSONB NOT NULL,
  branding_data JSONB,
  image_url TEXT,
  selected_platforms TEXT[],
  agency_phone TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agency social connections table
CREATE TABLE agency_social_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL,
  platform TEXT NOT NULL,
  nango_connection_id TEXT NOT NULL,
  external_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agency_id, platform)
);

-- Campaign posts table
CREATE TABLE campaign_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES campaign_cases(id),
  platform TEXT NOT NULL,
  post_id TEXT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7. Start the Service

```bash
npm start
```

## Services

| Service | Description |
|---------|-------------|
| `gemini.service.js` | AI image generation using Google Gemini |
| `nango.service.js` | OAuth management and social media posting |
| `whatsapp.service.js` | WhatsApp Business API messaging |
| `campaign.database.js` | Supabase database operations |
| `campaign.workflow.js` | State machine for campaign flow |

## License

MIT
