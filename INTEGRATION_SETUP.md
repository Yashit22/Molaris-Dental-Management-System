# Integration Verification System - Setup Guide

## Overview

This document describes the integration verification system that validates and tracks the status of three critical integrations:
1. **Connect Cloud (Google Drive)** - For storing clinical reports and patient files
2. **Email (Gmail/SMTP)** - For sending report PDFs and notifications
3. **WhatsApp (WAAPI)** - For sending patient notifications and updates

## Features Implemented

### 1. Backend Integration Status Tracking
- **Model**: `IntegrationStatus.model.js` - Tracks configuration, verification, and test status for each integration
- **Controller**: `integration.controller.js` - Provides endpoints to check status, get storage quota, and send test messages
- **Routes**: `/api/integrations/*` - REST endpoints for integration operations

### 2. Frontend Integration Context
- **Context**: `IntegrationContext.jsx` - Global state management for integration status
- **Provides**:
  - Real-time integration status across all pages
  - Methods to check individual integration status
  - Methods to send test emails and WhatsApp messages
  - Storage quota information for Google Drive

### 3. Integration Settings Page
- **Page**: `IntegrationSettingsPage.jsx` - Dashboard for viewing and testing integrations
- **Features**:
  - Visual status indicators (Verified/Not Configured/Failed)
  - Google Drive storage quota display (X/5GB)
  - Test email sending form
  - Test WhatsApp message sending form
  - Real-time verification status updates

### 4. Integration Status Components
- **Components**: `IntegrationStatusBadges.jsx`
- **Components**:
  - `CloudStorageBadge` - Shows storage quota
  - `EmailIntegrationBadge` - Shows email status
  - `WhatsAppIntegrationBadge` - Shows WhatsApp status
  - `IntegrationBlocker` - Blocks UI elements if integration not verified
  - `AllIntegrationsStatus` - Summary of all integrations

### 5. Clinical Report Modal Integration
- Updated `ClinicalReportModal.jsx` to:
  - Show integration status banner
  - Warn user if Connect Cloud is not verified
  - Block report saving if integration not verified

## Setup Instructions

### 1. Update App.jsx to Include IntegrationProvider

```jsx
import { IntegrationProvider } from './Context/IntegrationContext';

function App() {
  return (
    <AuthProvider>
      <IntegrationProvider>
        {/* Your routes here */}
      </IntegrationProvider>
    </AuthProvider>
  );
}
```

### 2. Add Integration Settings to Navigation

Update your navigation/sidebar to include a link to the Integration Settings page:

```jsx
<Link to="/settings/integrations">
  <Settings2 size={20} />
  Integration Settings
</Link>
```

Add route:
```jsx
<Route path="/settings/integrations" element={<IntegrationSettingsPage />} />
```

### 3. Configure Environment Variables

Ensure these environment variables are set in your `.env`:

**For Google Drive (Connect Cloud):**
```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token
GOOGLE_DRIVE_FOLDER_ID=your_folder_id
```

**For Email:**
Configure in the Settings page (settings stored in database)

**For WhatsApp:**
```
WAAPI_BASE_URL=https://your_waapi_base_url
```

### 4. Database Migration

Run the following in MongoDB to create the IntegrationStatus collection:

```javascript
db.createCollection('integrationstatuses');
db.integrationstatuses.createIndex({ 'integration': 1 }, { unique: true });
```

## API Endpoints

### Check Integration Status
```
GET /api/integrations/status/all
GET /api/integrations/status/google-drive
GET /api/integrations/status/gmail
GET /api/integrations/status/whatsapp
```

Response:
```json
{
  "integration": "google_drive",
  "status": {
    "isConfigured": true,
    "isVerified": true,
    "storageGB": "2.5/5.0",
    "lastError": null,
    "lastVerified": "2026-05-25T10:30:00Z"
  }
}
```

### Get Storage Information
```
GET /api/integrations/storage
```

Response:
```json
{
  "storage": {
    "totalGB": "5.0",
    "usedGB": "2.50",
    "percentUsed": "50.0",
    "displayText": "2.50/5.0 GB used"
  }
}
```

### Send Test Email
```
POST /api/integrations/test/email
Body: { "email": "test@example.com" }
```

### Send Test WhatsApp
```
POST /api/integrations/test/whatsapp
Body: { "phone": "+91 98765 43210" }
```

## Usage in Components

### Check if Integration is Verified

```jsx
import { useIntegration } from '../Context/IntegrationContext';

function MyComponent() {
  const { integrations, isCloudVerified, isEmailVerified } = useIntegration();
  
  return (
    <div>
      {isCloudVerified ? (
        <button>Upload File</button>
      ) : (
        <p>Please verify Connect Cloud integration first</p>
      )}
    </div>
  );
}
```

### Block Feature if Not Verified

```jsx
import { IntegrationBlocker } from '../components/IntegrationStatusBadges';

<IntegrationBlocker feature="cloud_upload">
  <FileUploadButton />
</IntegrationBlocker>
```

### Show Storage Badge

```jsx
import { CloudStorageBadge } from '../components/IntegrationStatusBadges';

<CloudStorageBadge />
```

## Workflow

### For End Users

1. **Go to Integration Settings** - Navigate to Settings > Integrations
2. **Verify Each Integration**:
   - Connect Cloud: System automatically checks Google Drive credentials
   - Email: Enter test email address and click "Send Test Email"
   - WhatsApp: Enter test phone number and click "Send Test Message"
3. **Once Verified**: All features are unlocked
   - Can upload files to Connect Cloud
   - Can enable email automations
   - Can send WhatsApp notifications

### For Developers

To add integration checks to a new feature:

```jsx
const { isCloudVerified, isEmailVerified, isWhatsAppVerified } = useIntegration();

if (!isCloudVerified) {
  return <ErrorMessage>Connect Cloud not verified</ErrorMessage>;
}

// Continue with feature
```

## Database Schema

### IntegrationStatus Collection

```javascript
{
  _id: ObjectId,
  integration: "google_drive" | "gmail" | "whatsapp",
  isConfigured: boolean,
  isVerified: boolean,
  lastVerified: Date | null,
  lastError: String | null,
  errorCode: String | null,
  testDetails: {
    lastTestDate: Date | null,
    testStatus: "pending" | "success" | "failed",
    testMessage: String
  },
  metadata: {
    storageQuota: Number (bytes) | null,
    storageUsed: Number (bytes) | null,
    credentialsPresent: [String]
  },
  createdAt: Date,
  updatedAt: Date
}
```

## Security Notes

- All integration endpoints are protected with JWT authentication
- Test emails and messages are rate-limited (implementation optional)
- Credentials are stored in environment variables, never in the database
- Google Drive quota is retrieved fresh on each check
- WhatsApp verification uses health check endpoint

## Troubleshooting

### Google Drive integration shows "Failed to verify"
- Check that GOOGLE_REFRESH_TOKEN is valid
- Verify Google API is enabled in GCP console
- Check GOOGLE_DRIVE_FOLDER_ID is valid

### Email test fails
- Verify SMTP credentials in Settings
- Check firewall allows SMTP port (usually 587 or 465)
- Ensure "Less secure apps" is enabled for Gmail

### WhatsApp test fails
- Verify WAAPI_BASE_URL is correct
- Check WhatsApp API credentials
- Ensure WhatsApp Business account is properly set up
