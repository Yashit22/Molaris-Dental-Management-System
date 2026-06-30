import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, name }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function authenticateSuperAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.SUPER_ADMIN_JWT_SECRET);
    if (decoded.type !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    req.superAdmin = decoded; // { id, email, type: 'super_admin' }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired super admin token' });
  }
}

export function requireAdminSecret(req, res, next) {
  const provided = req.header('X-Admin-Secret');
  const expected = process.env.ADMIN_API_SECRET;

  if (!provided || !expected) {
    console.warn('[adminSecret] denied — header missing or secret not configured');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const safe = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!safe) {
    console.warn('[adminSecret] denied');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  next();
}
