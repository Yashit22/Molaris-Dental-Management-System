import { resolveTenantContext } from '../config/resolveTenantContext.js';

export async function resolveTenant(req, res, next) {
  try {
    const { tenantModels, tenantConfig } = await resolveTenantContext(req.user?.tenantId);
    req.tenantModels = tenantModels;
    req.tenantConfig = tenantConfig;
    next();
  } catch (err) {
    const status = err.statusCode || 500;
    const message = status === 500
      ? (err.message || 'Internal Server Error during tenant resolution.')
      : err.message;
    if (status === 500) console.error('[resolveTenant] Error:', err.message);
    res.status(status).json({ message });
  }
}
