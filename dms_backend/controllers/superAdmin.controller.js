import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { getAnalyticsDb } from '../config/analyticsDb.js';
import { getTenantConnection } from '../config/tenantDb.js';
import { getTenantModels } from '../config/tenantModels.js';
import { getBalanceSeconds, topUp, setBalance, adjust, getLedger, secondsToCredits } from '../services/credits.service.js';

// ─── helpers ─────────────────────────────────────────────────────────────────
function toObjectId(id) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}

// ─── POST /api/connect-desk/login ────────────────────────────────────────────
export async function superAdminLogin(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'email and password are required.' });

    const db = getAnalyticsDb();
    const admin = await db.collection('super_admins').findOne({ email });
    if (!admin)
      return res.status(401).json({ message: 'Invalid credentials.' });

    const match = await bcrypt.compare(password, admin.password);
    if (!match)
      return res.status(401).json({ message: 'Invalid credentials.' });

    if (admin.status !== 'active')
      return res.status(403).json({ message: 'Account is not active.' });

    const token = jwt.sign(
      { id: admin._id.toString(), email: admin.email, type: 'super_admin' },
      process.env.SUPER_ADMIN_JWT_SECRET,
      { expiresIn: '12h' }
    );

    const { password: _p, ...safeAdmin } = admin;
    res.json({ token, admin: safeAdmin });
  } catch (err) {
    console.error('[superAdminLogin]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── GET /api/connect-desk/me ─────────────────────────────────────────────────
export async function getSuperAdminMe(req, res) {
  try {
    const db = getAnalyticsDb();
    const admin = await db.collection('super_admins').findOne(
      { _id: toObjectId(req.superAdmin.id) },
      { projection: { password: 0 } }
    );
    if (!admin) return res.status(404).json({ message: 'Not found.' });
    res.json(admin);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  TENANTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/connect-desk/tenants
export async function listTenants(req, res) {
  try {
    const db = getAnalyticsDb();
    const tenants = await db.collection('tenants').find({}).sort({ createdAt: -1 }).toArray();
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/connect-desk/tenants/:id
export async function getTenant(req, res) {
  try {
    const db = getAnalyticsDb();
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id.' });
    const tenant = await db.collection('tenants').findOne({ _id: id });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/connect-desk/tenants
export async function createTenant(req, res) {
  try {
    const db = getAnalyticsDb();
    const {
      name, slug, mongoUri, mongoDbName, status,
      address, phone, email, website, city, state, zipCode, country,
      currency, timezone,
      googleClientId, googleClientSecret, googleRefreshToken, googleDriveFolderId,
      sarvamApiKey,
      cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret,
      wapiBaseUrl, wapiToken,
    } = req.body;

    if (!name || !mongoUri || !mongoDbName)
      return res.status(400).json({ message: 'name, mongoUri and mongoDbName are required.' });

    const doc = {
      name, slug: slug || '',
      mongoUri, mongoDbName,
      status: status || 'active',
      address: address || '', phone: phone || '', email: email || '',
      website: website || '', city: city || '', state: state || '',
      zipCode: zipCode || '', country: country || '',
      currency: currency || 'INR', timezone: timezone || 'Asia/Kolkata',
      googleClientId: googleClientId || '',
      googleClientSecret: googleClientSecret || '',
      googleRefreshToken: googleRefreshToken || '',
      googleDriveFolderId: googleDriveFolderId || '',
      sarvamApiKey: sarvamApiKey || '',
      cloudinaryCloudName: cloudinaryCloudName || '',
      cloudinaryApiKey: cloudinaryApiKey || '',
      cloudinaryApiSecret: cloudinaryApiSecret || '',
      wapiBaseUrl: wapiBaseUrl || '',
      wapiToken: wapiToken || '',
      creditSeconds: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('tenants').insertOne(doc);
    const created = await db.collection('tenants').findOne({ _id: result.insertedId });
    res.status(201).json(created);
  } catch (err) {
    console.error('[createTenant]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/connect-desk/tenants/:id
export async function updateTenant(req, res) {
  try {
    const db = getAnalyticsDb();
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id.' });

    // Allow every writable field — nothing is hidden or hashed
    const ALLOWED = [
      'name', 'slug', 'mongoUri', 'mongoDbName', 'status',
      'address', 'phone', 'email', 'website', 'city', 'state', 'zipCode', 'country',
      'currency', 'timezone',
      'googleClientId', 'googleClientSecret', 'googleRefreshToken', 'googleDriveFolderId',
      'sarvamApiKey',
      'cloudinaryCloudName', 'cloudinaryApiKey', 'cloudinaryApiSecret',
      'wapiBaseUrl', 'wapiToken',
    ];

    const $set = { updatedAt: new Date() };
    ALLOWED.forEach(k => { if (k in req.body) $set[k] = req.body[k]; });

    await db.collection('tenants').updateOne({ _id: id }, { $set });
    const updated = await db.collection('tenants').findOne({ _id: id });
    if (!updated) return res.status(404).json({ message: 'Tenant not found.' });
    res.json(updated);
  } catch (err) {
    console.error('[updateTenant]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/connect-desk/tenants/:id
export async function deleteTenant(req, res) {
  try {
    const db = getAnalyticsDb();
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id.' });
    const result = await db.collection('tenants').deleteOne({ _id: id });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: 'Tenant not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/connect-desk/tenants/:id/doctors
// Lists the Doctor records inside a tenant's own DB (for linking Doctor-role users).
export async function listTenantDoctors(req, res) {
  try {
    const db = getAnalyticsDb();
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id.' });

    const tenant = await db.collection('tenants').findOne({ _id: id });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });
    if (!tenant.mongoUri || !tenant.mongoDbName)
      return res.status(400).json({ message: 'Tenant database not configured.' });

    const conn = await getTenantConnection(tenant.mongoUri, tenant.mongoDbName);
    const { Doctor } = getTenantModels(conn);
    const doctors = await Doctor.find({}, 'name specialization email is_active').sort({ name: 1 }).lean();
    res.json(doctors);
  } catch (err) {
    console.error('[listTenantDoctors]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  USERS  (dms_users in analytics DB)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/connect-desk/users?status=&tenantId=&search=
export async function listUsers(req, res) {
  try {
    const db = getAnalyticsDb();
    const filter = { product: 'dms' };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.tenantId) {
      const tid = toObjectId(req.query.tenantId);
      if (tid) filter.tenantId = tid;
    }
    if (req.query.search) {
      const re = new RegExp(req.query.search, 'i');
      filter.$or = [{ firstName: re }, { lastName: re }, { email: re }];
    }

    const users = await db.collection('dms_users')
      .find(filter, { projection: { password: 0, passwordResetTokenHash: 0, passwordResetExpiresAt: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/connect-desk/users/:id
export async function getUser(req, res) {
  try {
    const db = getAnalyticsDb();
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id.' });
    const user = await db.collection('dms_users').findOne(
      { _id: id },
      { projection: { password: 0, passwordResetTokenHash: 0, passwordResetExpiresAt: 0 } }
    );
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PATCH /api/connect-desk/users/:id
// Editable: firstName, lastName, email, phone, role, status, tenantId
// Password reset is a separate field (plain text accepted — will be hashed)
export async function updateUser(req, res) {
  try {
    const db = getAnalyticsDb();
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id.' });

    const { firstName, lastName, email, phone, role, status, tenantId, doctorId, newPassword } = req.body;

    const $set = { updatedAt: new Date() };
    if (firstName  !== undefined) $set.firstName  = firstName;
    if (lastName   !== undefined) $set.lastName   = lastName;
    if (email      !== undefined) $set.email      = email;
    if (phone      !== undefined) $set.phone      = phone;
    if (role       !== undefined) $set.role       = role;
    if (status     !== undefined) $set.status     = status;

    if (tenantId !== undefined) {
      $set.tenantId = tenantId ? toObjectId(tenantId) : null;
    }

    // doctorId links a Doctor-role user to a Doctor record in the tenant DB.
    // Stored as a plain string (tenant-DB ObjectId), null when unlinked.
    if (doctorId !== undefined) {
      $set.doctorId = doctorId ? String(doctorId) : null;
    }

    if (newPassword) {
      $set.password = await bcrypt.hash(newPassword, 10);
      // Invalidate any outstanding reset token
      $set.passwordResetTokenHash = null;
      $set.passwordResetExpiresAt = null;
    }

    const result = await db.collection('dms_users').findOneAndUpdate(
      { _id: id },
      { $set },
      { returnDocument: 'after', projection: { password: 0, passwordResetTokenHash: 0, passwordResetExpiresAt: 0 } }
    );
    if (!result) return res.status(404).json({ message: 'User not found.' });
    res.json(result);
  } catch (err) {
    console.error('[updateUser]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/connect-desk/users/:id
export async function deleteUser(req, res) {
  try {
    const db = getAnalyticsDb();
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id.' });
    const result = await db.collection('dms_users').deleteOne({ _id: id });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: 'User not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  AI REPORT CREDITS  (1 credit = 60s; stored as integer seconds on the tenant)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/connect-desk/tenants/:id/credits
export async function getTenantCredits(req, res) {
  try {
    if (!toObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id.' });
    const creditSeconds = await getBalanceSeconds(req.params.id);
    res.json({ creditSeconds, credits: secondsToCredits(creditSeconds) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/connect-desk/tenants/:id/credits/topup  body { credits, note? }
export async function topUpTenantCredits(req, res) {
  try {
    if (!toObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id.' });
    const credits = Number(req.body.credits);
    if (!Number.isFinite(credits) || credits <= 0)
      return res.status(400).json({ message: 'credits must be a positive number.' });

    const creditSeconds = await topUp(req.params.id, Math.round(credits * 60), {
      by: req.superAdmin?.email || 'super_admin', kind: 'topup',
      note: (req.body.note || '').trim() || undefined,
    });
    res.json({ creditSeconds, credits: secondsToCredits(creditSeconds) });
  } catch (err) {
    console.error('[topUpTenantCredits]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// POST /api/connect-desk/tenants/:id/credits/adjust  body { credits, note? }
// Manual signed adjustment: positive adds, negative deducts. Floored at 0.
export async function adjustTenantCredits(req, res) {
  try {
    if (!toObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id.' });
    const credits = Number(req.body.credits);
    if (!Number.isFinite(credits) || credits === 0)
      return res.status(400).json({ message: 'credits must be a non-zero number (use a negative value to deduct).' });

    const creditSeconds = await adjust(req.params.id, Math.round(credits * 60), {
      by: req.superAdmin?.email || 'super_admin', kind: 'manual_adjust',
      note: (req.body.note || '').trim() || undefined,
    });
    res.json({ creditSeconds, credits: secondsToCredits(creditSeconds) });
  } catch (err) {
    console.error('[adjustTenantCredits]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// POST /api/connect-desk/tenants/:id/credits/set  body { credits, note? }
export async function setTenantCredits(req, res) {
  try {
    if (!toObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id.' });
    const credits = Number(req.body.credits);
    if (!Number.isFinite(credits) || credits < 0)
      return res.status(400).json({ message: 'credits must be a non-negative number.' });

    const creditSeconds = await setBalance(req.params.id, Math.round(credits * 60), {
      by: req.superAdmin?.email || 'super_admin', kind: 'set',
      note: (req.body.note || '').trim() || undefined,
    });
    res.json({ creditSeconds, credits: secondsToCredits(creditSeconds) });
  } catch (err) {
    console.error('[setTenantCredits]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/connect-desk/tenants/:id/credits/ledger?limit=
export async function getTenantLedger(req, res) {
  try {
    if (!toObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id.' });
    const rows = await getLedger(req.params.id, req.query.limit);
    res.json(rows.map(r => ({ ...r, credits: secondsToCredits(r.seconds), balanceCredits: secondsToCredits(r.balanceAfter) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
