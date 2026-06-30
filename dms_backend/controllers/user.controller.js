import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { getAnalyticsDb } from '../config/analyticsDb.js';
import { logEvent } from '../services/analyticsLogger.js';
import { sendPlatformEmail } from '../services/platformMailer.js';

// ─── POST /api/users/register ────────────────────────────────────────────────
// Public endpoint. Creates a pending dms_user in the analytics MongoDB.
export async function createUser(req, res) {
  try {
    const { firstName, lastName, email, password, role, phone } = req.body;

    if (!firstName || !email || !password) {
      return res.status(400).json({ message: 'firstName, email, and password are required.' });
    }

    const analyticsDb = getAnalyticsDb();

    const existing = await analyticsDb.collection('dms_users').findOne({ email, product: 'dms' });
    if (existing) {
      return res.status(400).json({ message: 'A user with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await analyticsDb.collection('dms_users').insertOne({
      firstName,
      lastName:  lastName || '',
      email,
      password:  hashedPassword,
      role:      role || 'Doctor',     // Doctor | Receptionist | Assistant
      phone:     phone || '',
      status:    'pending',            // Awaits dashboard admin approval
      product:   'dms',
      tenantId:  null,                 // Assigned by admin on approval
      createdAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Registration submitted. Your account is pending approval by an administrator.',
      userId:  result.insertedId,
    });
  } catch (err) {
    console.error('[createUser]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── POST /api/users/login ────────────────────────────────────────────────────
// Public endpoint. Verifies credentials against analytics MongoDB dms_users.
export async function loginUser(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const analyticsDb = getAnalyticsDb();

    const user = await analyticsDb.collection('dms_users').findOne({ email, product: 'dms' });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Status checks
    if (user.status === 'pending') {
      return res.status(403).json({
        message: 'Your account is pending approval. Please wait for an administrator to approve your registration.',
        status: 'pending',
      });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({
        message: 'Your account registration was rejected. Please contact your administrator.',
        status: 'rejected',
      });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({
        message: 'Your account is inactive. Please contact your administrator.',
        status: 'inactive',
      });
    }

    const payload = {
      id:       user._id.toString(),
      role:     user.role,
      name:     `${user.firstName} ${user.lastName}`.trim(),
      tenantId: user.tenantId ? user.tenantId.toString() : null,
      // For role=Doctor: links the user to a Doctor record in the tenant DB
      // so the app can scope appointments/visits to this doctor.
      doctorId: user.doctorId ? user.doctorId.toString() : null,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    // Log login event to analytics (fire-and-forget)
    if (user.tenantId) {
      logEvent(user.tenantId.toString(), 'user_login', { userId: user._id, role: user.role });
    }

    const { password: _pwd, ...userData } = user;
    res.json({ token, user: userData });
  } catch (err) {
    console.error('[loginUser]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── GET /api/users/profile ───────────────────────────────────────────────────
// Protected. Returns current user + tenant info for sidebar/header display.
export async function getUserProfile(req, res) {
  try {
    const { id: userId, tenantId, name, role } = req.user;

    if (!tenantId) {
      return res.status(403).json({ message: 'User not assigned to a clinic.' });
    }

    const analyticsDb = getAnalyticsDb();

    // Fetch tenant info
    const tenant = await analyticsDb.collection('tenants').findOne({
      _id: new mongoose.Types.ObjectId(tenantId)
    });

    if (!tenant) {
      return res.status(404).json({ message: 'Clinic not found.' });
    }

    // Fetch full user info (excluding password)
    const user = await analyticsDb.collection('dms_users').findOne({
      _id: new mongoose.Types.ObjectId(userId)
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    console.log('[getUserProfile] Raw tenant data:', tenant);
    console.log('[getUserProfile] Raw user data:', user);

    res.json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
      tenant: {
        id: tenant._id,
        name: tenant.name || 'Clinic',
        slug: tenant.slug || '',
        status: tenant.status || 'active',
        address: tenant.address || '',
        phone: tenant.phone || '',
        email: tenant.email || '',
        website: tenant.website || '',
        city: tenant.city || '',
        state: tenant.state || '',
        zipCode: tenant.zipCode || '',
        country: tenant.country || '',
        currency: tenant.currency || 'INR',
        timezone: tenant.timezone || 'Asia/Kolkata',
        googleDriveFolderId: tenant.googleDriveFolderId || '',
      },
    });
  } catch (err) {
    console.error('[getUserProfile]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── GET /api/users/doctors ───────────────────────────────────────────────────
// Alias for /api/doctors for backward compatibility. Delegates to Doctor model.
// This endpoint is kept for clients that expect /users/doctors.
export async function getDoctors(req, res) {
  try {
    if (!req.tenantModels || !req.tenantModels.Doctor) {
      return res.status(500).json({ error: 'Doctor model not available' });
    }

    const { Doctor } = req.tenantModels;
    const doctors = await Doctor.find({ is_active: true }).sort({ name: 1 });
    res.json(doctors);
  } catch (err) {
    console.error('[getDoctors]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── GET /api/users ───────────────────────────────────────────────────────────
// Protected (authenticate only). Returns all staff for this tenant.
export async function getAllUsers(req, res) {
  try {
    const { tenantId } = req.user;
    if (!tenantId) return res.status(403).json({ message: 'No tenant assigned.' });

    const analyticsDb = getAnalyticsDb();

    const users = await analyticsDb.collection('dms_users').find({
      product:  'dms',
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).toArray();

    const sanitized = users.map(({ password, ...rest }) => rest);
    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PASSWORD_DENYLIST = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwerty1', 'iloveyou', 'admin123', 'welcome1',
  'monkey123', 'dragon12', 'master12', 'sunshine', 'princess',
  'letmein1', 'football', 'abc12345', 'shadow12', 'passw0rd',
]);

function validatePasswordStrength(pwd, email) {
  if (!pwd || pwd.length < 8)  return { ok: false, reason: 'Password must be at least 8 characters.' };
  if (pwd.length > 128)         return { ok: false, reason: 'Password must be at most 128 characters.' };
  if (!/[a-z]/.test(pwd))       return { ok: false, reason: 'Password must contain at least one lowercase letter.' };
  if (!/[A-Z]/.test(pwd))       return { ok: false, reason: 'Password must contain at least one uppercase letter.' };
  if (!/[0-9]/.test(pwd))       return { ok: false, reason: 'Password must contain at least one digit.' };
  if (!/[^a-zA-Z0-9]/.test(pwd)) return { ok: false, reason: 'Password must contain at least one symbol.' };
  if (email && pwd.toLowerCase() === email.toLowerCase()) return { ok: false, reason: 'Password cannot be your email address.' };
  if (PASSWORD_DENYLIST.has(pwd.toLowerCase())) return { ok: false, reason: 'Password is too common. Please choose a stronger password.' };
  return { ok: true };
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

// ─── POST /api/users/forgot-password ─────────────────────────────────────────
// Public. Generates a reset token and emails a link. Always returns 200.
export async function forgotPassword(req, res) {
  // Respond immediately — prevents timing-based email enumeration
  res.status(200).json({ message: 'If an account with that email exists, a reset link has been sent.' });

  try {
    const { email } = req.body;
    if (!email) return;

    const analyticsDb = getAnalyticsDb();
    const user = await analyticsDb.collection('dms_users').findOne({ email, product: 'dms' });
    if (!user || user.status !== 'active') return;

    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await analyticsDb.collection('dms_users').updateOne(
      { _id: user._id },
      { $set: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      } }
    );

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;
    const firstName = user.firstName || 'User';

    const frontendOrigin = process.env.FRONTEND_URL || 'https://molaris-ai.connectgenai.in';

    await sendPlatformEmail({
      to: user.email,
      subject: 'Reset your Molaris password',
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f6ff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f6ff;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(19,127,236,0.08);">

        <!-- Header -->
        <tr>
          <td align="center" style="background:#137fec;padding:28px 40px;">
            <img src="${frontendOrigin}/MolarisLandscapeName.png" alt="Molaris" height="40" style="display:inline-block;vertical-align:middle;">
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">Hi ${firstName},</p>
            <p style="margin:16px 0;font-size:15px;color:#4a5568;line-height:1.6;">
              We received a request to reset the password for your Molaris account.
              Click the button below to choose a new password.
            </p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" style="margin:32px 0;">
              <tr>
                <td align="center" style="background:#137fec;border-radius:10px;">
                  <a href="${resetUrl}" target="_blank"
                     style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">
                    Reset Password
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px;font-size:13px;color:#718096;">
              Or paste this link into your browser:
            </p>
            <p style="margin:0 0 24px;font-size:12px;color:#137fec;word-break:break-all;">
              <a href="${resetUrl}" style="color:#137fec;">${resetUrl}</a>
            </p>

            <p style="margin:0;font-size:13px;color:#718096;line-height:1.6;">
              If you did not request a password reset, you can safely ignore this email —
              your account will remain unchanged.
            </p>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #e8f0fe;margin:0;"></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:#a0aec0;">
              Need help? Contact us at
              <a href="mailto:support@connectgenai.in" style="color:#137fec;text-decoration:none;font-weight:600;">support@connectgenai.in</a>
            </p>
            <p style="margin:0;font-size:11px;color:#cbd5e0;">
              © ${new Date().getFullYear()} Molaris by Connect Gen-AI. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
      text: `Hi ${firstName},\n\nWe received a request to reset your Molaris password.\n\nReset your password here:\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.\n\nNeed help? Email us at support@connectgenai.in`,
    });

    logEvent(user.tenantId?.toString() || null, 'password_reset_requested', {
      userId:    user._id.toString(),
      email:     maskEmail(user.email),
      requestIp: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });
  } catch (err) {
    console.error('[forgotPassword]', err.message);
  }
}

// ─── POST /api/users/reset-password ──────────────────────────────────────────
// Public. Verifies the token and updates the password.
export async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and newPassword are required.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const analyticsDb = getAnalyticsDb();

    const user = await analyticsDb.collection('dms_users').findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
      product: 'dms',
    });

    if (!user) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired.' });
    }

    const strengthCheck = validatePasswordStrength(newPassword, user.email);
    if (!strengthCheck.ok) {
      return res.status(400).json({ message: strengthCheck.reason, code: 'WEAK_PASSWORD' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const tokenAgeSeconds = Math.floor(
      (3600000 - (user.passwordResetExpiresAt.getTime() - Date.now())) / 1000
    );

    await analyticsDb.collection('dms_users').updateOne(
      { _id: user._id },
      {
        $set:   { password: hashedPassword },
        $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '' },
      }
    );

    // Fire-and-forget confirmation email
    const firstName = user.firstName || 'User';
    sendPlatformEmail({
      to: user.email,
      subject: 'Your DMS password was just changed',
      html: `<p>Hi ${firstName},</p>
<p>Your DMS account password was changed at <strong>${new Date().toISOString()}</strong> from IP <strong>${req.ip}</strong>.</p>
<p>If this wasn't you, contact your clinic administrator immediately.</p>`,
      text: `Hi ${firstName},\n\nYour DMS account password was changed at ${new Date().toISOString()} from IP ${req.ip}.\n\nIf this wasn't you, contact your clinic administrator immediately.`,
    }).catch((err) => console.error('[resetPassword] confirmation email failed:', err.message));

    logEvent(user.tenantId?.toString() || null, 'password_reset_completed', {
      userId:          user._id.toString(),
      email:           maskEmail(user.email),
      requestIp:       req.ip,
      userAgent:       req.headers['user-agent'] || '',
      tokenAgeSeconds,
    });

    res.status(200).json({ message: 'Password updated. You can now log in.' });
  } catch (err) {
    console.error('[resetPassword]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── PATCH /api/users/admin/:userId/contact ───────────────────────────────────
// Admin-only (requireAdminSecret middleware). Updates email and/or phone on dms_users.
export async function adminUpdateUserContact(req, res) {
  try {
    const { userId } = req.params;
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ message: 'At least one of email or phone is required.' });
    }

    let targetId;
    try {
      targetId = new mongoose.Types.ObjectId(userId);
    } catch {
      return res.status(400).json({ message: 'Invalid userId.' });
    }

    const analyticsDb = getAnalyticsDb();
    const user = await analyticsDb.collection('dms_users').findOne({ _id: targetId, product: 'dms' });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Deduplicate email
    if (email && email !== user.email) {
      const conflict = await analyticsDb.collection('dms_users').findOne({
        email,
        product: 'dms',
        _id: { $ne: targetId },
      });
      if (conflict) {
        return res.status(409).json({ message: 'That email is already in use by another account.' });
      }
    }

    // Build update and track what actually changed for the audit log
    const setFields = { updatedAt: new Date() };
    const changes = {};

    if (email && email !== user.email) {
      setFields.email = email;
      changes.email = { before: user.email, after: email };
    }
    if (phone && phone !== user.phone) {
      setFields.phone = phone;
      changes.phone = { before: user.phone || '', after: phone };
    }

    if (Object.keys(changes).length === 0) {
      return res.status(200).json({ message: 'No changes — provided values match current record.' });
    }

    await analyticsDb.collection('dms_users').updateOne(
      { _id: targetId },
      {
        $set:   setFields,
        // Clear any outstanding reset token so old link can't be used against new email
        $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '' },
      }
    );

    logEvent(user.tenantId?.toString() || null, 'admin_user_contact_updated', {
      userId:    user._id.toString(),
      changes,
      requestIp: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });

    const updated = await analyticsDb.collection('dms_users').findOne({ _id: targetId });
    const { password: _pwd, ...rest } = updated;
    res.status(200).json(rest);
  } catch (err) {
    console.error('[adminUpdateUserContact]', err.message);
    res.status(500).json({ error: err.message });
  }
}
