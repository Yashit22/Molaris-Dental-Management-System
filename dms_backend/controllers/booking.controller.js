import mongoose from 'mongoose';
import { getAnalyticsDb } from '../config/analyticsDb.js';
import { getTenantConnection } from '../config/tenantDb.js';
import { getTenantModels } from '../config/tenantModels.js';

// Helper: Load tenant DB models
async function loadTenantModels(tenantId) {
  const analyticsDb = getAnalyticsDb();

  let tenant;
  try {
    tenant = await analyticsDb.collection('tenants').findOne({
      _id: new mongoose.Types.ObjectId(tenantId),
    });
  } catch (err) {
    console.error(`[loadTenantModels] Invalid tenantId format: ${tenantId}`, err.message);
    throw new Error('Invalid clinic ID format');
  }

  if (!tenant) {
    console.error(`[loadTenantModels] Tenant not found with ID: ${tenantId}`);
    throw new Error('Clinic not found');
  }

  console.log(`[loadTenantModels] Found tenant:`, { _id: tenant._id, mongoUri: !!tenant.mongoUri, mongoDbName: tenant.mongoDbName });

  if (!tenant.mongoUri || !tenant.mongoDbName) {
    console.error(`[loadTenantModels] Tenant missing database config:`, { mongoUri: !!tenant.mongoUri, mongoDbName: tenant.mongoDbName });
    throw new Error('Clinic database not configured');
  }

  const tenantConn = await getTenantConnection(tenant.mongoUri, tenant.mongoDbName);
  return { tenantModels: getTenantModels(tenantConn), tenant };
}

// ─── GET clinic info ────────────────────────────────────────────────────────

export async function getClinicInfo(req, res) {
  try {
    const { tenantId } = req.params;
    const { tenantModels } = await loadTenantModels(tenantId);
    const { BookingSettings, Doctor } = tenantModels;

    const bookingSettings = await BookingSettings.findOne({}).lean();
    if (!bookingSettings || !bookingSettings.isBookingEnabled) {
      return res.status(403).json({ error: 'Booking is not enabled' });
    }

    const doctors = await Doctor.find({ is_active: true, isBookable: true })
      .select('name specialization bookingWorkingHours')
      .lean();

    res.json({
      clinicName: bookingSettings.clinicDisplayName || 'Clinic',
      tagline: bookingSettings.clinicTagline || '',
      logo: bookingSettings.clinicLogoUrl || '',
      slotDuration: bookingSettings.slotDurationMinutes || 30,
      workingHours: bookingSettings.workingHours || {},
      doctors: doctors.map(d => ({
        id: d._id.toString(),
        name: d.name,
        specialization: d.specialization,
        schedule: d.bookingWorkingHours || {},
      })),
    });
  } catch (err) {
    console.error('[Booking Clinic Info] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
}

// ─── GET services ────────────────────────────────────────────────────────

export async function getServices(req, res) {
  try {
    const { tenantId } = req.params;
    const { tenantModels } = await loadTenantModels(tenantId);
    const { Services } = tenantModels;

    const services = await Services.find({ isActive: true })
      .select('name cost category description')
      .lean();

    res.json(services || []);
  } catch (err) {
    console.error('[Booking Services] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
}

// ─── GET availability ────────────────────────────────────────────────────────

export async function getAvailability(req, res) {
  try {
    const { tenantId } = req.params;
    const { doctorId, date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const { tenantModels } = await loadTenantModels(tenantId);
    const { Doctor, Appointment, BookingSettings } = tenantModels;

    const doctor = doctorId
      ? await Doctor.findById(doctorId).lean()
      : await Doctor.findOne({ is_active: true, isBookable: true }).lean();

    if (!doctor) return res.status(404).json({ error: 'No available doctors found' });

    const settings = await BookingSettings.findOne({}).lean();
    const slotDuration = settings?.slotDurationMinutes || 30;

    // Get existing appointments for this doctor on this date
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const booked = await Appointment.find({
      doctor_id: doctorId,
      start_time: { $gte: dayStart, $lt: dayEnd },
      status: { $in: ['Scheduled', 'Confirmed', 'Checked In', 'In Progress'] },
    }).lean();

    const bookedTimes = booked.map(a => a.start_time.getTime());

    // Calculate available slots based on doctor schedule
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
      dayStart.getDay()
    ];
    const daySchedule = doctor.bookingWorkingHours?.[dayOfWeek] || { isOpen: false };

    const slots = [];
    if (daySchedule.isOpen) {
      const [startHour, startMin] = (daySchedule.start || '09:00').split(':').map(Number);
      const [endHour, endMin] = (daySchedule.end || '17:00').split(':').map(Number);

      let current = new Date(dayStart);
      current.setHours(startHour, startMin, 0, 0);
      const end = new Date(dayStart);
      end.setHours(endHour, endMin, 0, 0);

      while (current < end) {
        if (!bookedTimes.includes(current.getTime())) {
          const isoString = current.toISOString();
          const displayTime = current.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
          slots.push({
            time: isoString,
            display_time: displayTime,
            doctor_ids: [doctor._id.toString()],
          });
        }
        current = new Date(current.getTime() + slotDuration * 60000);
      }
    }

    res.json({ slots });
  } catch (err) {
    console.error('[Booking Availability] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
}

// ─── POST request booking ────────────────────────────────────────────────────

export async function requestBooking(req, res) {
  try {
    const { tenantId } = req.params;
    const { doctorId, startTime, patientName, patientPhone, patientEmail, notes } = req.body;

    if (!doctorId || !startTime || !patientName || !patientPhone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { tenantModels } = await loadTenantModels(tenantId);
    const { Appointment, Patient, Doctor } = tenantModels;

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    // Find or create patient
    let patient = await Patient.findOne({ 'contact.mobile': patientPhone });
    if (!patient) {
      const [firstName, ...lastNameParts] = patientName.split(' ');
      patient = await Patient.create({
        first_name: firstName,
        last_name: lastNameParts.join(' '),
        contact: { mobile: patientPhone, email: patientEmail },
      });
    }

    // Create appointment
    const start = new Date(startTime);
    const end = new Date(start.getTime() + 30 * 60000); // 30 min default

    const appointment = await Appointment.create({
      patient_id: patient._id,
      doctor_id: doctorId,
      start_time: start,
      end_time: end,
      title: `${patientName} - Booking`,
      type: 'Consultation',
      status: 'Scheduled',
      notes: notes || 'Online booking request',
    });

    res.status(201).json({
      success: true,
      appointmentId: appointment._id,
      message: 'Booking request submitted',
    });
  } catch (err) {
    console.error('[Booking Request] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
}
