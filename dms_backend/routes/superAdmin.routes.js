import express from 'express';
import { authenticateSuperAdmin } from '../middleware/auth.js';
import {
  superAdminLogin, getSuperAdminMe,
  listTenants, getTenant, createTenant, updateTenant, deleteTenant,
  listTenantDoctors,
  listUsers, getUser, updateUser, deleteUser,
} from '../controllers/superAdmin.controller.js';

const router = express.Router();
const guard = authenticateSuperAdmin;

// Public
router.post('/login', superAdminLogin);

// Protected — all require super admin JWT
router.get('/me', guard, getSuperAdminMe);

// Tenants
router.get   ('/tenants',             guard, listTenants);
router.get   ('/tenants/:id',         guard, getTenant);
router.get   ('/tenants/:id/doctors', guard, listTenantDoctors);
router.post  ('/tenants',             guard, createTenant);
router.put   ('/tenants/:id',         guard, updateTenant);
router.delete('/tenants/:id',         guard, deleteTenant);

// Users
router.get   ('/users',     guard, listUsers);
router.get   ('/users/:id', guard, getUser);
router.patch ('/users/:id', guard, updateUser);
router.delete('/users/:id', guard, deleteUser);

export default router;
