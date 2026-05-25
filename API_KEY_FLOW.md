# AI Report Generation - OpenRouter API Key Flow

## Where the API Key is Being Used

The **OpenRouter API Key** is used in the **AI Clinical Report Generation** feature to power:
1. **Report generation** - Generating clinical documents from dictated transcripts
2. **Autofill extraction** - Extracting structured clinical data from transcripts

## Where the API Key is Fetched From

The API key follows this chain:

### 1. **Storage Location**: MongoDB Analytics Database
   - **Database**: `ANALYTICS_MONGO_URI` (from `.env`)
   - **Collection**: `tenants`
   - **Field**: `openrouterApiKey`

### 2. **Retrieval Flow** (Step by Step):

```
HTTP Request (with JWT token)
    ↓
resolveTenant middleware (middleware/resolveTenant.js)
    ↓
Get user's tenantId from JWT
    ↓
Connect to Analytics DB via ANALYTICS_MONGO_URI
    ↓
Query tenants collection for { _id: tenantId }
    ↓
Extract openrouterApiKey from tenant document
    ↓
Attach to req.tenantConfig.openrouterApiKey
    ↓
Report controller uses credentials.openrouterApiKey
```

### 3. **Report Controller Usage** (controllers/report.controller.js):

The API key is used in three functions:
- `generateFromTemplate()` - Non-streaming generation
- `streamFromTemplate()` - Streaming generation (SSE)
- `parseAutofillWithLLM()` - Structured data extraction

All use OpenRouter endpoint: `https://openrouter.io/api/v1/chat/completions`

## Current Configuration

- **API Key**: `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`
- **Location in Code**: `dms_backend/.env` (as fallback, but tenant DB is primary)
- **Model Used**: `google/gemma-2-27b-it`
- **Endpoint**: `https://openrouter.io/api/v1/chat/completions`

## Important Note

The `.env` file has the API key as a **backup/default**, but the system primarily fetches it from the MongoDB **tenants collection** on a per-tenant basis. Each tenant can have their own `openrouterApiKey` stored in the analytics database.

If a tenant doesn't have `openrouterApiKey` set in MongoDB, the report generation will fail with: `"OpenRouter API Key not configured for this tenant."`
