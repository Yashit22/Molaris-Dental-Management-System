import mongoose from 'mongoose';
import { getAnalyticsDb } from '../config/analyticsDb.js';
import { getTenantConnection } from '../config/tenantDb.js';
import { getTenantModels } from '../config/tenantModels.js';
import { triggerBookingEmails } from './email.controller.js';

const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

// Resolve tenant DB models from a public tenantId (no JWT required)
async function resolveTenantModels(tenantId) {
  const analyticsDb = getAnalyticsDb();
  const tenant = await analyticsDb.collection('tenants').findOne({
    _id: new mongoose.Types.ObjectId(tenantId),
  });
  if (!tenant) throw Object.assign(new Error('Clinic not found'), { status: 404 });
  if (!tenant.mongoUri || !tenant.mongoDbName) {
    throw Object.assign(new Error('Clinic database not configured'), { status: 500 });
  }
  const conn = await getTenantConnection(tenant.mongoUri, tenant.mongoDbName);
  const models = getTenantModels(conn);
  return { models, tenant };
}

// Parse "HH:MM" → minutes since midnight
function toMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Format minutes since midnight → "HH:MM"
function fromMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// Generate slot start times (in minutes) for a doctor's working window
function generateSlots(startMin, endMin, durationMin, bufferMin) {
  const step = durationMin + bufferMin;
  const slots = [];
  for (let t = startMin; t + durationMin <= endMin; t += step) {
    slots.push(t);
  }
  return slots;
}

// GET /api/booking/:tenantId/clinic-info
export async function getClinicInfo(req, res) {
  try {
    const { models, tenant } = await resolveTenantModels(req.params.tenantId);
    const { ClinicProfile, Doctor } = models;

    const [profile, doctors] = await Promise.all([
      ClinicProfile.findOne({}).lean(),
      Doctor.find({ is_active: true }).select('name availability').lean(),
    ]);

    // Build working hours: union of all active doctors' availability
    const working_hours = {};
    for (const day of WEEKDAYS) {
      const times = doctors
        .map(d => d.availability?.[day])
        .filter(a => a?.start && a?.end);
      if (times.length) {
        // Take earliest start and latest end across all doctors
        working_hours[day] = {
          start: times.reduce((acc, t) => (t.start < acc ? t.start : acc), times[0].start),
          end:   times.reduce((acc, t) => (t.end   > acc ? t.end   : acc), times[0].end),
        };
      }
    }

    res.json({
      name:    profile?.name    || tenant.name || 'Dental Clinic',
      tagline: profile?.tagline || '',
      phone:   profile?.phone   || '',
      email:   profile?.email   || '',
      address: profile?.address || '',
      city:    profile?.city    || '',
      logoUrl: profile?.logoUrl || '',
      slot_duration_minutes: profile?.slot_duration_minutes ?? 30,
      slot_buffer_minutes:   profile?.slot_buffer_minutes   ?? 0,
      working_hours,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

// GET /api/booking/:tenantId/services
export async function getServices(req, res) {
  try {
    const { models } = await resolveTenantModels(req.params.tenantId);
    const services = await models.Service.find({ isActive: true })
      .select('name cost category description duration_minutes')
      .sort({ category: 1, name: 1 })
      .lean();
    res.json(services);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

// GET /api/booking/:tenantId/availability?date=YYYY-MM-DD&service_id=...
export async function getAvailability(req, res) {
  try {
    const { models } = await resolveTenantModels(req.params.tenantId);
    const { Doctor, Appointment, Service, ClinicProfile } = models;

    const { date, service_id } = req.query;
    if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

    const targetDate = new Date(date);
    if (isNaN(targetDate)) return res.status(400).json({ error: 'Invalid date format' });

    const weekday = WEEKDAYS[targetDate.getDay()]; // 0=sunday

    // Load clinic slot settings
    const [profile, service] = await Promise.all([
      ClinicProfile.findOne({}).lean(),
      service_id ? Service.findById(service_id).lean() : Promise.resolve(null),
    ]);

    const slotDuration = service?.duration_minutes || profile?.slot_duration_minutes || 30;
    const slotBuffer   = profile?.slot_buffer_minutes || 0;

    // Active doctors available on this weekday
    const doctors = await Doctor.find({ is_active: true }).lean();
    const availableDoctors = doctors.filter(d => {
      const av = d.availability?.[weekday];
      return av?.start && av?.end;
    });

    if (!availableDoctors.length) {
      return res.json({ slots: [], message: 'No availability on this day' });
    }

    // Booked appointment start_times for this date (non-cancelled)
    const dayStart = new Date(date); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(date); dayEnd.setHours(23,59,59,999);

    const booked = await Appointment.find({
      start_time: { $gte: dayStart, $lte: dayEnd },
      status: { $nin: ['Cancelled'] },
    }).select('doctor_id start_time').lean();

    // Map: doctorId → Set of booked start times (ISO strings)
    const bookedByDoctor = new Map();
    for (const appt of booked) {
      const did = appt.doctor_id.toString();
      if (!bookedByDoctor.has(did)) bookedByDoctor.set(did, new Set());
      bookedByDoctor.get(did).add(new Date(appt.start_time).toISOString());
    }

    // Build candidate slots per doctor, then merge into unique available slot times
    const slotDoctorMap = new Map(); // slotTimeISO → [doctorId, ...]

    for (const doctor of availableDoctors) {
      const av = doctor.availability[weekday];
      const startMin = toMinutes(av.start);
      const endMin   = toMinutes(av.end);
      const slotMins = generateSlots(startMin, endMin, slotDuration, slotBuffer);

      for (const sm of slotMins) {
        // Build the exact datetime for this slot
        const slotDate = new Date(date);
        slotDate.setHours(Math.floor(sm / 60), sm % 60, 0, 0);
        const slotISO = slotDate.toISOString();

        // Skip slots in the past (add 30 min buffer so patients can't book something starting very soon)
        if (slotDate <= new Date(Date.now() + 30 * 60 * 1000)) continue;

        const doctorBooked = bookedByDoctor.get(doctor._id.toString()) || new Set();
        if (!doctorBooked.has(slotISO)) {
          if (!slotDoctorMap.has(slotISO)) slotDoctorMap.set(slotISO, []);
          slotDoctorMap.get(slotISO).push(doctor._id.toString());
        }
      }
    }

    // Return slots sorted by time, with display time in IST
    const slots = Array.from(slotDoctorMap.entries())
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .map(([iso, doctorIds]) => {
        const dt = new Date(iso);
        return {
          datetime: iso,
          display_time: dt.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
          doctor_ids: doctorIds,
        };
      });

    res.json({ slots, slot_duration_minutes: slotDuration });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

// POST /api/booking/:tenantId/request
export async function requestBooking(req, res) {
  try {
    const { models, tenant } = await resolveTenantModels(req.params.tenantId);
    const { Patient, Appointment, Doctor, ClinicProfile } = models;

    const {
      first_name,
      last_name,
      phone,
      email,
      service_id,
      service_name,
      notes,
      datetime, // ISO slot datetime
      doctor_id, // optional preferred doctor from availability response
    } = req.body;

    if (!first_name || !phone || !datetime) {
      return res.status(400).json({ error: 'first_name, phone, and datetime are required' });
    }

    const slotTime = new Date(datetime);
    if (isNaN(slotTime)) return res.status(400).json({ error: 'Invalid datetime' });
    if (slotTime < new Date()) return res.status(400).json({ error: 'Selected time has already passed' });

    // Normalize phone (strip non-digits, ensure 10 digits)
    const normalizedPhone = phone.toString().replace(/\D/g, '').replace(/^91/, '').slice(-10);
    if (normalizedPhone.length !== 10) {
      return res.status(400).json({ error: 'Invalid phone number — must be a 10-digit Indian mobile number' });
    }
    const fullPhone = `91${normalizedPhone}`;

    // Look up or create patient
    let patient = await Patient.findOne({
      $or: [
        { 'contact.mobile': fullPhone },
        { 'contact.mobile': normalizedPhone },
      ],
    }).lean();

    let patientId;
    let isNewPatient = false;

    if (patient) {
      patientId = patient._id;

      // Warn if patient already has a pending/scheduled appointment soon
      const upcoming = await Appointment.findOne({
        patient_id: patientId,
        status: { $in: ['Requested', 'Scheduled', 'Confirmed'] },
        start_time: { $gte: new Date() },
      }).lean();

      if (upcoming) {
        // Allow booking but include a warning flag
        // (frontend decides whether to show warning or block)
      }
    } else {
      // Auto-create patient
      isNewPatient = true;
      const year = new Date().getFullYear();
      const yearPrefix = `PID-${year}-`;
      const lastForYear = await Patient.findOne(
        { patientId: { $regex: `^${yearPrefix}` } },
        { patientId: 1 }
      ).sort({ patientId: -1 });

      let nextNum = 1;
      if (lastForYear?.patientId) {
        const m = lastForYear.patientId.match(/^PID-\d{4}-(\d+)$/);
        if (m) nextNum = parseInt(m[1], 10) + 1;
      }
      const newPatientId = `${yearPrefix}${String(nextNum).padStart(4, '0')}`;

      const newPatient = new Patient({
        patientId: newPatientId,
        first_name,
        last_name: last_name || '',
        contact: {
          mobile: fullPhone,
          email:  email || '',
        },
      });
      await newPatient.save();
      patientId = newPatient._id;
      patient   = newPatient.toObject();
    }

    // Choose doctor for this slot
    let assignedDoctorId = null;
    const weekday = WEEKDAYS[slotTime.getDay()];

    if (doctor_id) {
      // Use the requested doctor if they're still available
      const conflict = await Appointment.findOne({
        doctor_id,
        status: { $nin: ['Cancelled'] },
        start_time: slotTime,
      }).lean();
      if (!conflict) assignedDoctorId = doctor_id;
    }

    if (!assignedDoctorId) {
      // Pick first available doctor
      const doctors = await Doctor.find({ is_active: true }).lean();
      const dayStart = new Date(datetime); dayStart.setHours(0,0,0,0);
      const dayEnd   = new Date(datetime); dayEnd.setHours(23,59,59,999);

      const booked = await Appointment.find({
        start_time: { $gte: dayStart, $lte: dayEnd },
        status: { $nin: ['Cancelled'] },
      }).select('doctor_id start_time').lean();

      const bookedAtSlot = new Set(
        booked
          .filter(a => new Date(a.start_time).toISOString() === slotTime.toISOString())
          .map(a => a.doctor_id.toString())
      );

      for (const doc of doctors) {
        const av = doc.availability?.[weekday];
        if (!av?.start || !av?.end) continue;
        const startMin = toMinutes(av.start);
        const endMin   = toMinutes(av.end);
        const slotMin  = slotTime.getHours() * 60 + slotTime.getMinutes();
        if (slotMin >= startMin && slotMin < endMin && !bookedAtSlot.has(doc._id.toString())) {
          assignedDoctorId = doc._id;
          break;
        }
      }
    }

    if (!assignedDoctorId) {
      return res.status(409).json({ error: 'This time slot is no longer available. Please pick another time.' });
    }

    // Load clinic profile for slot duration
    const profile = await ClinicProfile.findOne({}).lean();
    const slotDuration = profile?.slot_duration_minutes || 30;

    const endTime = new Date(slotTime.getTime() + slotDuration * 60 * 1000);
    const patientFullName = `${first_name} ${last_name || ''}`.trim();

    const appointment = new Appointment({
      patient_id:            patientId,
      doctor_id:             assignedDoctorId,
      start_time:            slotTime,
      end_time:              endTime,
      title:                 `${service_name || 'Appointment'} - ${patientFullName}`,
      type:                  service_name || 'Consultation',
      status:                'Requested',
      booking_source:        'online',
      notes:                 notes || '',
      patient_name_snapshot: patientFullName,
      patient_phone_snapshot: fullPhone,
    });
    await appointment.save();

    // Fire email confirmations (non-blocking)
    _sendBookingEmails({ models, tenant, patient, appointment, serviceName: service_name })
      .catch(err => console.error('[Booking Email] Error:', err.message));

    res.status(201).json({
      appointment_id: appointment._id,
      status:        'Requested',
      patient_id:    patientId,
      is_new_patient: isNewPatient,
      start_time:    appointment.start_time,
      end_time:      appointment.end_time,
      message:       'Appointment request received. The clinic will confirm shortly.',
    });
  } catch (err) {
    console.error('[Booking] requestBooking error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

// GET /api/booking/:tenantId/clinic-profile — for staff to update clinic profile (protected, not truly public)
// Upsert clinic profile: POST /api/booking/:tenantId/clinic-profile handled in booking.routes.js

async function _sendBookingEmails({ models, tenant, patient, appointment, serviceName }) {
  try {
    await triggerBookingEmails({
      tenantModels: models,
      patient,
      appointment,
      serviceName,
      clinicName: tenant?.name || 'Dental Clinic',
    });
  } catch (err) {
    console.error('[Booking Email] silenced:', err.message);
  }
}
