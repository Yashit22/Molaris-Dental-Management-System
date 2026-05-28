import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';

// ── Check Google Drive integration status and quota ──
export const checkGoogleDriveStatus = async (req, res) => {
  try {
    const { IntegrationStatus } = req.tenantModels;
    const requiredEnvVars = [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REFRESH_TOKEN',
      'GOOGLE_DRIVE_FOLDER_ID',
    ];

    const credentialsPresent = requiredEnvVars.filter(v => process.env[v]);
    const isConfigured = credentialsPresent.length === requiredEnvVars.length;

    let storageQuota = null;
    let storageUsed = null;
    let lastError = null;
    let isVerified = false;

    if (isConfigured) {
      try {
        const auth = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/auth/google/callback'
        );

        auth.setCredentials({
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        });

        const drive = google.drive({ version: 'v3', auth });
        const about = await drive.about.get({ fields: 'storageQuota' });

        storageQuota = about.data.storageQuota?.limit || 5 * 1024 * 1024 * 1024; // 5GB default
        storageUsed = about.data.storageQuota?.usage || 0;
        isVerified = true;
      } catch (err) {
        lastError = err.message || 'Failed to verify Google Drive credentials';
        console.error('[Integration] Google Drive verification error:', err.message);
      }
    }

    // Update integration status in DB
    const status = await IntegrationStatus.findOneAndUpdate(
      { integration: 'google_drive' },
      {
        isConfigured,
        isVerified,
        lastVerified: isVerified ? new Date() : null,
        lastError: lastError || null,
        metadata: {
          storageQuota,
          storageUsed,
          credentialsPresent,
        },
      },
      { upsert: true, new: true }
    );

    res.json({
      integration: 'google_drive',
      status: {
        isConfigured,
        isVerified,
        storageQuota,
        storageUsed,
        storageGB: storageQuota ? `${(storageUsed / (1024 * 1024 * 1024)).toFixed(2)}/${(storageQuota / (1024 * 1024 * 1024)).toFixed(1)}` : null,
        credentialsPresent,
        lastError,
        lastVerified: status.lastVerified,
      },
    });
  } catch (error) {
    console.error('[Integration] Error checking Google Drive status:', error);
    res.status(500).json({ error: error.message });
  }
};

// ── Check Gmail integration status ──
export const checkGmailStatus = async (req, res) => {
  try {
    const { IntegrationStatus } = req.tenantModels;
    const emailSettings = req.app.locals.emailSettings || {};
    const isConfigured =
      emailSettings.smtpHost &&
      emailSettings.smtpPort &&
      emailSettings.smtpUser &&
      emailSettings.smtpPassword;

    let isVerified = false;
    let lastError = null;

    if (isConfigured) {
      // Check if a test email was already sent and succeeded
      const existing = await IntegrationStatus.findOne({ integration: 'gmail' });
      isVerified = existing?.isVerified || false;
      lastError = existing?.lastError || null;
    }

    const status = await IntegrationStatus.findOneAndUpdate(
      { integration: 'gmail' },
      {
        isConfigured,
        isVerified,
        lastError: lastError || null,
        metadata: {
          credentialsPresent: isConfigured ? ['smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword'] : [],
        },
      },
      { upsert: true, new: true }
    );

    res.json({
      integration: 'gmail',
      status: {
        isConfigured,
        isVerified,
        testSent: status?.testDetails?.testStatus === 'success',
        lastTestDate: status?.testDetails?.lastTestDate,
        lastError,
      },
    });
  } catch (error) {
    console.error('[Integration] Error checking Gmail status:', error);
    res.status(500).json({ error: error.message });
  }
};

// ── Check WhatsApp integration status ──
export const checkWhatsAppStatus = async (req, res) => {
  try {
    const { IntegrationStatus } = req.tenantModels;
    const isConfigured = !!process.env.WAAPI_BASE_URL;
    let isVerified = false;
    let lastError = null;

    if (isConfigured) {
      try {
        // Try a simple health check to WAAPI
        const response = await fetch(`${process.env.WAAPI_BASE_URL}/health`, {
          method: 'GET',
          timeout: 5000,
        }).catch(() => ({ ok: false }));

        isVerified = response.ok || false;
      } catch (err) {
        lastError = 'WhatsApp API unreachable';
        console.error('[Integration] WhatsApp health check failed:', err.message);
      }

      // Also check if a test message was sent successfully
      const existing = await IntegrationStatus.findOne({ integration: 'whatsapp' });
      if (existing?.testDetails?.testStatus === 'success') {
        isVerified = true;
      } else if (lastError) {
        isVerified = false;
      }
    }

    const status = await IntegrationStatus.findOneAndUpdate(
      { integration: 'whatsapp' },
      {
        isConfigured,
        isVerified,
        lastError: lastError || null,
        metadata: {
          credentialsPresent: isConfigured ? ['WAAPI_BASE_URL'] : [],
        },
      },
      { upsert: true, new: true }
    );

    res.json({
      integration: 'whatsapp',
      status: {
        isConfigured,
        isVerified,
        testSent: status?.testDetails?.testStatus === 'success',
        lastTestDate: status?.testDetails?.lastTestDate,
        lastError,
      },
    });
  } catch (error) {
    console.error('[Integration] Error checking WhatsApp status:', error);
    res.status(500).json({ error: error.message });
  }
};

// ── Get all integrations status ──
export const getAllIntegrationsStatus = async (req, res) => {
  try {
    const { IntegrationStatus } = req.tenantModels;
    const integrations = await IntegrationStatus.find();
    const statusMap = {};

    integrations.forEach(integ => {
      statusMap[integ.integration] = {
        isConfigured: integ.isConfigured,
        isVerified: integ.isVerified,
        lastVerified: integ.lastVerified,
        lastError: integ.lastError,
        testStatus: integ.testDetails?.testStatus,
      };
    });

    // Ensure all integrations are represented
    const allIntegrations = ['google_drive', 'gmail', 'whatsapp'];
    for (const integ of allIntegrations) {
      if (!statusMap[integ]) {
        statusMap[integ] = {
          isConfigured: false,
          isVerified: false,
          lastVerified: null,
          lastError: null,
          testStatus: 'pending',
        };
      }
    }

    res.json({
      status: statusMap,
      allVerified: Object.values(statusMap).every(s => s.isVerified),
    });
  } catch (error) {
    console.error('[Integration] Error getting all integrations status:', error);
    res.status(500).json({ error: error.message });
  }
};

// ── Send test email ──
export const sendTestEmail = async (req, res) => {
  try {
    const { IntegrationStatus } = req.tenantModels;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const emailSettings = req.app.locals.emailSettings || {};

    if (!emailSettings.smtpHost || !emailSettings.smtpPort || !emailSettings.smtpUser || !emailSettings.smtpPassword) {
      return res.status(400).json({ error: 'Gmail/SMTP not configured in settings' });
    }

    const transporter = nodemailer.createTransport({
      host: emailSettings.smtpHost,
      port: emailSettings.smtpPort,
      secure: emailSettings.smtpPort === 465,
      auth: {
        user: emailSettings.smtpUser,
        pass: emailSettings.smtpPassword,
      },
    });

    const mailOptions = {
      from: emailSettings.smtpUser,
      to: email,
      subject: '🧪 Connect Cloud Integration Test Email',
      html: `
        <h2>Integration Test Successful!</h2>
        <p>Your email integration with Connect Cloud is working correctly.</p>
        <p>You can now:</p>
        <ul>
          <li>Send clinical reports via email</li>
          <li>Enable email notifications and automations</li>
        </ul>
        <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    // Mark as verified
    await IntegrationStatus.findOneAndUpdate(
      { integration: 'gmail' },
      {
        isVerified: true,
        'testDetails.testStatus': 'success',
        'testDetails.lastTestDate': new Date(),
        'testDetails.testMessage': `Test email sent to ${email}`,
        lastError: null,
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: `Test email sent to ${email}`,
      integration: 'gmail',
      isVerified: true,
    });
  } catch (error) {
    console.error('[Integration] Error sending test email:', error);

    const { IntegrationStatus } = req.tenantModels;
    // Mark as failed
    await IntegrationStatus.findOneAndUpdate(
      { integration: 'gmail' },
      {
        'testDetails.testStatus': 'failed',
        'testDetails.testMessage': error.message,
        lastError: error.message,
      },
      { upsert: true, new: true }
    );

    res.status(500).json({
      error: error.message || 'Failed to send test email',
      integration: 'gmail',
      isVerified: false,
    });
  }
};

// ── Send test WhatsApp message ──
export const sendTestWhatsApp = async (req, res) => {
  try {
    const { IntegrationStatus } = req.tenantModels;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    if (!process.env.WAAPI_BASE_URL) {
      return res.status(400).json({ error: 'WhatsApp API not configured' });
    }

    // Normalize phone number
    let normalizedPhone = phone.replace(/\D/g, '');
    if (!normalizedPhone.startsWith('91')) {
      normalizedPhone = '91' + normalizedPhone.slice(-10);
    }

    const response = await fetch(`${process.env.WAAPI_BASE_URL}/messages/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: normalizedPhone,
        text: '🧪 Integration Test\n\nYour WhatsApp integration with Connect Cloud is working! You can now receive notifications and messages.',
      }),
    });

    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${response.statusText}`);
    }

    // Mark as verified
    await IntegrationStatus.findOneAndUpdate(
      { integration: 'whatsapp' },
      {
        isVerified: true,
        'testDetails.testStatus': 'success',
        'testDetails.lastTestDate': new Date(),
        'testDetails.testMessage': `Test message sent to ${phone}`,
        lastError: null,
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: `Test message sent to ${phone}`,
      integration: 'whatsapp',
      isVerified: true,
    });
  } catch (error) {
    console.error('[Integration] Error sending test WhatsApp:', error);

    const { IntegrationStatus } = req.tenantModels;
    // Mark as failed
    await IntegrationStatus.findOneAndUpdate(
      { integration: 'whatsapp' },
      {
        'testDetails.testStatus': 'failed',
        'testDetails.testMessage': error.message,
        lastError: error.message,
      },
      { upsert: true, new: true }
    );

    res.status(500).json({
      error: error.message || 'Failed to send test WhatsApp message',
      integration: 'whatsapp',
      isVerified: false,
    });
  }
};

// ── Get Google Drive storage info ──
export const getStorageInfo = async (req, res) => {
  try {
    if (!process.env.GOOGLE_REFRESH_TOKEN || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ error: 'Google Drive not configured' });
    }

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/auth/google/callback'
    );

    auth.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const drive = google.drive({ version: 'v3', auth });
    const about = await drive.about.get({ fields: 'storageQuota' });

    const storageQuota = about.data.storageQuota?.limit || 5 * 1024 * 1024 * 1024;
    const storageUsed = about.data.storageQuota?.usage || 0;
    const percentUsed = ((storageUsed / storageQuota) * 100).toFixed(1);

    res.json({
      integration: 'google_drive',
      storage: {
        totalGB: (storageQuota / (1024 * 1024 * 1024)).toFixed(1),
        usedGB: (storageUsed / (1024 * 1024 * 1024)).toFixed(2),
        usedBytes: storageUsed,
        totalBytes: storageQuota,
        percentUsed,
        displayText: `${(storageUsed / (1024 * 1024 * 1024)).toFixed(2)}/${(storageQuota / (1024 * 1024 * 1024)).toFixed(1)} GB used`,
      },
    });
  } catch (error) {
    console.error('[Integration] Error getting storage info:', error);
    res.status(500).json({ error: error.message });
  }
};
