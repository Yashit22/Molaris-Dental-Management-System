import mongoose from 'mongoose';
import { getAnalyticsDb } from '../config/analyticsDb.js';
import { getTenantConnection } from '../config/tenantDb.js';
import { getTenantModels } from '../config/tenantModels.js';

// ─── Public Booking Info (no auth required) ────────────────────────────────

export async function getPublicBookingInfo(req, res) {
  try {
    const { tenantId } = req.params;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    // Load tenant configuration from analytics DB
    const analyticsDb = getAnalyticsDb();
    const tenant = await analyticsDb.collection('tenants').findOne({
      _id: new mongoose.Types.ObjectId(tenantId),
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Clinic not found' });
    }

    if (!tenant.mongoUri || !tenant.mongoDbName) {
      return res.status(500).json({ error: 'Clinic database not configured' });
    }

    // Get tenant-specific DB connection and models
    const tenantConn = await getTenantConnection(tenant.mongoUri, tenant.mongoDbName);
    const { BookingSettings, Doctor } = getTenantModels(tenantConn);

    // Fetch booking settings
    const bookingSettings = await BookingSettings.findOne({}).lean();
    if (!bookingSettings || !bookingSettings.isBookingEnabled) {
      return res.status(403).json({ error: 'Online booking is not enabled for this clinic' });
    }

    // Fetch available doctors
    const doctors = await Doctor.find({ is_active: true })
      .select('name specialization isBookable bookingWorkingHours')
      .lean();

    const availableDoctors = doctors
      .filter(d => d.isBookable)
      .map(d => ({
        id: d._id.toString(),
        name: d.name,
        specialization: d.specialization,
        workingHours: d.bookingWorkingHours || {},
      }));

    res.json({
      isEnabled: bookingSettings.isBookingEnabled,
      clinicDisplayName: bookingSettings.clinicDisplayName || 'Clinic',
      clinicTagline: bookingSettings.clinicTagline || '',
      clinicLogoUrl: bookingSettings.clinicLogoUrl || '',
      slotDurationMinutes: bookingSettings.slotDurationMinutes || 30,
      workingHours: bookingSettings.workingHours || {},
      blockedDates: bookingSettings.blockedDates || [],
      doctors: availableDoctors,
    });
  } catch (err) {
    console.error('[Booking Public Info] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
