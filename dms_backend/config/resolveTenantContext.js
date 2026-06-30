import mongoose from 'mongoose';
import { getAnalyticsDb } from './analyticsDb.js';
import { getTenantConnection } from './tenantDb.js';
import { getTenantModels } from './tenantModels.js';

/**
 * Resolve a tenant's DB models + sensitive credentials from a tenantId.
 *
 * Shared by the Express `resolveTenant` middleware (HTTP requests) and the
 * WebSocket upgrade handler (`ws/reportStream.ws.js`), so both paths resolve
 * tenants identically. Throws an Error tagged with `.statusCode` on failure so
 * callers can map it to an HTTP status or a WS close code.
 *
 * @param {string} tenantId  Tenant ObjectId as a string (from the JWT).
 * @returns {Promise<{ tenantModels: object, tenantConfig: object }>}
 */
export async function resolveTenantContext(tenantId) {
  if (!tenantId) {
    const e = new Error('User is not assigned to a clinic (No tenantId)');
    e.statusCode = 403;
    throw e;
  }

  const analyticsDb = getAnalyticsDb();

  // JWT tenantId is a string, must convert to ObjectId for _id lookup
  const tenant = await analyticsDb.collection('tenants').findOne({
    _id: new mongoose.Types.ObjectId(tenantId),
  });

  if (!tenant) {
    const e = new Error('Clinic configuration not found. Contact administration.');
    e.statusCode = 404;
    throw e;
  }

  if (!tenant.mongoUri || !tenant.mongoDbName) {
    const e = new Error('Clinic database configuration is incomplete.');
    e.statusCode = 500;
    throw e;
  }

  const tenantConn = await getTenantConnection(tenant.mongoUri, tenant.mongoDbName);

  const tenantModels = getTenantModels(tenantConn);

  // Inject sensitive credentials (Google, API Keys); fall back to env where set.
  const tenantConfig = {
    clientId:             tenant.googleClientId,
    clientSecret:         tenant.googleClientSecret,
    refreshToken:         tenant.googleRefreshToken,
    driveFolderId:        tenant.googleDriveFolderId,
    sarvamApiKey:         tenant.sarvamApiKey || process.env.SARVAM_API_KEY,
    cloudinaryCloudName:  tenant.cloudinaryCloudName,
    cloudinaryApiKey:     tenant.cloudinaryApiKey,
    cloudinaryApiSecret:  tenant.cloudinaryApiSecret,
  };

  return { tenantModels, tenantConfig };
}
