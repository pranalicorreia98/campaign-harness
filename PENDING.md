# Pending Items - Campaign Harness

## 🔴 Blockers (Must Complete Before Testing)

### 1. Nango Cloud Account
- [ ] Create account at [app.nango.dev](https://app.nango.dev)
- [ ] Add integrations:
  - [ ] `facebook` - For Facebook Pages posting
  - [ ] `instagram` - For Instagram Business posting
  - [ ] `linkedin` - For LinkedIn company/personal posting
  - [ ] `twitter-v2` - For X/Twitter posting
- [ ] Copy **Secret Key** to `NANGO_SECRET_KEY` in `.env`
- [ ] Configure OAuth callback URLs in Nango dashboard

### 2. WhatsApp Business API
- [ ] Set up WhatsApp Business Account in [Meta Business Suite](https://business.facebook.com)
- [ ] Create WhatsApp Business API app
- [ ] Get **Access Token** → `WHATSAPP_ACCESS_TOKEN`
- [ ] Get **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
- [ ] Configure webhook URL: `https://your-domain.com/api/campaign-harness/webhook`
- [ ] Set **Verify Token** → `WHATSAPP_VERIFY_TOKEN`

### 3. Google AI / Gemini API
- [ ] Get API key from [Google AI Studio](https://aistudio.google.com)
- [ ] Add to `GOOGLE_AI_API_KEY` in `.env`
- [ ] Note: Using Gemini 2.0 Flash for image generation

### 4. Supabase Database
- [ ] Create tables (run migration):
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

---

## 🟡 Configuration Required

### 5. Public Image Hosting
- [ ] Set up public URL for generated campaign images
- [ ] Options:
  - AWS S3 bucket with public access
  - Cloudflare R2
  - Supabase Storage
- [ ] Update `CAMPAIGN_IMAGES_PUBLIC_URL` in `.env`

### 6. Instagram Custom Action (Nango)
- [ ] Instagram publishing requires a custom Nango action (~50 lines)
- [ ] Nango doesn't have pre-built Instagram publish action
- [ ] Need to implement container-based publish flow:
  1. Create media container
  2. Wait for processing
  3. Publish container

---

## 🟢 Optional / Nice-to-Have

### 7. Tracking/Analytics
- [ ] Set up UTM parameter generation for posted links
- [ ] Consider adding link shortener (Bitly, etc.)

### 8. Error Alerting
- [ ] Set up error notifications (Slack, email, etc.)
- [ ] Monitor failed posts

---

## 💰 Cost Estimates

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Nango Cloud | Starter | $50 + $0.29/connection |
| WhatsApp Business | - | Free (pay per conversation) |
| Google AI (Gemini) | Pay-as-you-go | ~$0.01-0.05 per image |
| Supabase | Free tier | $0 |

---

## 📋 Testing Checklist

Once all blockers are resolved:

- [ ] Run `npm install`
- [ ] Configure `.env` from `.env.example`
- [ ] Start server: `npm start`
- [ ] Test health endpoint: `curl http://localhost:3000/health`
- [ ] Test Nango connect flow: `GET /api/campaign-harness/connect/:agencyId?platform=facebook`
- [ ] Test campaign start: `POST /api/campaign-harness/start`
- [ ] Verify WhatsApp message received
- [ ] Test approval flow via WhatsApp buttons
- [ ] Verify posts appear on connected social accounts
