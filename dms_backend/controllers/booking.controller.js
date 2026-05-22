import mongoose from 'mongoose';
import { getAnalyticsDb } from '../config/analyticsDb.js';
import { getTenantConnection } from '../config/tenantDb.js';
import { getTenantModels } from '../config/tenantModels.js';
import { triggerBookingEmails } from './email.controller.js';

const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

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

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// Normalize date to YYYY-MM-DD string using local time (avoids UTC day-flip for IST)
function toDateKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

// GET /api/booking/:tenantId/clinic-info
export async function getClinicInfo(req, res) {
  try {
    const { models, tenant } = await resolveTenantModels(req.params.tenantId);
    const { BookingSettings, ClinicProfile, Doctor } = models;

    const [settings, profile, doctors] = await Promise.all([
      BookingSettings.findOne({}).lean(),
      ClinicProfile.findOne({}).lean(),
      Doctor.find({ is_active: true, isBookable: true }).lean(),
    ]);

    if (settings && settings.isBookingEnabled === false) {
      return res.json({ bookingEnabled: false });
    }

    // Build working hours union from bookable doctors (for date picker disabled-day logic)
    const working_hours = {};
    for (const day of WEEKDAYS) {
      const openDoctors = doctors.filter(d => {
        const wh = d.bookingWorkingHours?.[day];
        if (wh && wh.isOpen && wh.start && wh.end) return true;
        // fallback to legacy availability if no bookingWorkingHours set
        const av = d.availability?.[day];
        return av?.start && av?.end;
      });
      if (openDoctors.length) working_hours[day] = true;
    }

    res.json({
      bookingEnabled:     true,
      name:               settings?.clinicDisplayName || profile?.name    || tenant.name || 'Dental Clinic',
      tagline:            settings?.clinicTagline      || profile?.tagline || '',
      logoUrl:            settings?.clinicLogoUrl      || profile?.logoUrl || '',
      phone:              profile?.phone   || '',
      address:            profile?.address || '',
      city:               profile?.city    || '',
      slot_duration_minutes: settings?.slotDurationMinutes || profile?.slot_duration_minutes || 30,
      blocked_dates:      (settings?.blockedDates || []).map(b => b.date),
      working_hours,
      doctors: doctors.map(d => ({
        _id:              d._id,
        name:             d.name,
        specialization:   d.specialization,
        qualification:    d.qualification,
        experience_years: d.experience_years,
        bookingWorkingHours: d.bookingWorkingHours || {},
        holidays:         d.holidays || [],
      })),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

// GET /api/booking/:tenantId/services
export async function getServices(req, res) {
  try {
    const { models } = await resolveTenantModels(req.params.tenantId);
    const services = await models.SuggestedTreatment.find({ is_active: true })
      .select('name cost category description')
      .sort({ category: 1, name: 1 })
      .lean();
    res.json(services);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

// GET /api/booking/:tenantId/availability?date=YYYY-MM-DD&service_id=&doctor_id=
export async function getAvailability(req, res) {
  try {
    const { models } = await resolveTenantModels(req.params.tenantId);
    const { Doctor, Appointment, SuggestedTreatment, BookingSettings, ClinicProfile } = models;

    const { date, service_id, doctor_id } = req.query;
    if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

    const targetDate = new Date(date + 'T00:00:00');
    if (isNaN(targetDate)) return res.status(400).json({ error: 'Invalid date format' });

    const [settings, profile, service] = await Promise.all([
      BookingSettings.findOne({}).lean(),
      ClinicProfile.findOne({}).lean(),
      service_id ? SuggestedTreatment.findById(service_id).lean() : Promise.resolve(null),
    ]);

    // Respect isBookingEnabled flag
    if (settings && settings.isBookingEnabled === false) {
      return res.json({ slots: [], message: 'Online booking is disabled' });
    }

    // Check clinic-level blocked dates
    const dateKey = toDateKey(targetDate);
    const isClinicBlocked = (settings?.blockedDates || []).some(b => b.date === dateKey);
    if (isClinicBlocked) {
      return res.json({ slots: [], message: 'Clinic is closed on this date' });
    }

    const slotDuration = service?.duration_minutes || settings?.slotDurationMinutes || profile?.slot_duration_minutes || 30;
    const weekday = WEEKDAYS[targetDate.getDay()];

    // Build doctor query
    const doctorQuery = { is_active: true, isBookable: true };
    if (doctor_id) doctorQuery._id = doctor_id;

    const doctors = await Doctor.find(doctorQuery).lean();

    // Booked appointments for this date
    const dayStart = new Date(date + 'T00:00:00'); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(date + 'T00:00:00'); dayEnd.setHours(23,59,59,999);

    const booked = await Appointment.find({
      start_time: { $gte: dayStart, $lte: dayEnd },
      status: { $nin: ['Cancelled', 'No Show'] },
    }).select('doctor_id start_time').lean();

    const bookedByDoctor = new Map();
    for (const appt of booked) {
      const did = appt.doctor_id.toString();
      if (!bookedByDoctor.has(did)) bookedByDoctor.set(did, new Set());
      const slotKey = `${new Date(appt.start_time).getHours()}:${String(new Date(appt.start_time).getMinutes()).padStart(2,'0')}`;
      bookedByDoctor.get(did).add(slotKey);
    }

    // slotTimeStr → [doctorId, ...]
    const slotDoctorMap = new Map();

    for (const doctor of doctors) {
      // Skip if doctor has this day as a holiday
      const isHoliday = (doctor.holidays || []).some(h => h.date === dateKey);
      if (isHoliday) continue;

      // Prefer bookingWorkingHours; fall back to legacy availability
      const wh = doctor.bookingWorkingHours?.[weekday];
      const isOpen = wh?.isOpen === true;
      const start = wh?.start || (wh?.isOpen ? null : null);
      const end   = wh?.end;

      // If no bookingWorkingHours.isOpen, fall back to legacy availability
      let startMin, endMin;
      if (isOpen && start && end) {
        startMin = toMinutes(start);
        endMin   = toMinutes(end);
      } else if (!wh && doctor.availability?.[weekday]?.start && doctor.availability?.[weekday]?.end) {
        startMin = toMinutes(doctor.availability[weekday].start);
        endMin   = toMinutes(doctor.availability[weekday].end);
      } else {
        continue; // doctor not available this day
      }

      if (startMin === null || endMin === null || startMin >= endMin) continue;

      // Build break intervals in minutes
      const breaks = (wh?.breaks || []).map(b => ({
        start: toMinutes(b.start),
        end:   toMinutes(b.end),
      })).filter(b => b.start !== null && b.end !== null);

      // Individual blocked slots for this doctor on this date
      const blockedStartTimes = new Set(
        (doctor.blockedSlots || [])
          .filter(bs => bs.date === dateKey)
          .map(bs => bs.startTime)
      );

      const bookedTimes = bookedByDoctor.get(doctor._id.toString()) || new Set();

      // Generate slots
      for (let t = startMin; t + slotDuration <= endMin; t += slotDuration) {
        const timeStr = fromMinutes(t);

        // Skip if in a break
        const inBreak = breaks.some(b => t >= b.start && t < b.end);
        if (inBreak) continue;

        // Skip individually blocked slots
        if (blockedStartTimes.has(timeStr)) continue;

        // Skip already-booked slots
        if (bookedTimes.has(timeStr)) continue;

        // Skip past times (30-min buffer)
        const slotDatetime = new Date(date + 'T00:00:00');
        slotDatetime.setHours(Math.floor(t / 60), t % 60, 0, 0);
        if (slotDatetime <= new Date(Date.now() + 30 * 60 * 1000)) continue;

        if (!slotDoctorMap.has(timeStr)) slotDoctorMap.set(timeStr, []);
        slotDoctorMap.get(timeStr).push(doctor._id.toString());
      }
    }

    // Sort slots by time and format display
    const slots = Array.from(slotDoctorMap.entries())
      .sort(([a], [b]) => toMinutes(a) - toMinutes(b))
      .map(([timeStr, doctorIds]) => {
        const [hh, mm] = timeStr.split(':').map(Number);
        const ampm = hh < 12 ? 'AM' : 'PM';
        const h12 = hh % 12 || 12;
        return {
          time:         timeStr,
          display_time: `${h12}:${String(mm).padStart(2,'0')} ${ampm}`,
          doctor_ids:   doctorIds,
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
    const { Patient, Appointment, Doctor, ClinicProfile, BookingSettings } = models;

    const {
      first_name, last_name, phone, email,
      service_id, service_name, notes,
      date, time,   // "YYYY-MM-DD" + "HH:MM"
      doctor_id,
    } = req.body;

    if (!first_name || !phone || !date || !time) {
      return res.status(400).json({ error: 'first_name, phone, date, and time are required' });
    }

    const [settings] = await Promise.all([BookingSettings.findOne({}).lean()]);
    if (settings && settings.isBookingEnabled === false) {
      return res.status(403).json({ error: 'Online booking is currently disabled' });
    }

    // Build slot datetime
    const [hh, mm] = time.split(':').map(Number);
    const slotTime = new Date(date + 'T00:00:00');
    slotTime.setHours(hh, mm, 0, 0);
    if (isNaN(slotTime) || slotTime < new Date()) {
      return res.status(400).json({ error: 'Selected time has already passed' });
    }

    // Normalize phone
    const normalizedPhone = phone.toString().replace(/\D/g, '').replace(/^91/, '').slice(-10);
    if (normalizedPhone.length !== 10) {
      return res.status(400).json({ error: 'Invalid phone number — must be a 10-digit Indian mobile number' });
    }
    const fullPhone = `91${normalizedPhone}`;

    // Find or create patient
    let patient = await Patient.findOne({
      $or: [{ 'contact.mobile': fullPhone }, { 'contact.mobile': normalizedPhone }],
    }).lean();

    let patientId, isNewPatient = false;

    if (patient) {
      patientId = patient._id;
    } else {
      isNewPatient = true;
      const year = new Date().getFullYear();
      const yearPrefix = `PID-${year}-`;
      const last = await Patient.findOne(
        { patientId: { $regex: `^${yearPrefix}` } }, { patientId: 1 }
      ).sort({ patientId: -1 });
      const nextNum = last?.patientId
        ? (parseInt(last.patientId.match(/^PID-\d{4}-(\d+)$/)?.[1] || 0, 10) + 1)
        : 1;
      const newPatient = new Patient({
        patientId: `${yearPrefix}${String(nextNum).padStart(4,'0')}`,
        first_name,
        last_name: last_name || '',
        contact: { mobile: fullPhone, email: email || '' },
      });
      await newPatient.save();
      patientId = newPatient._id;
      patient   = newPatient.toObject();
    }

    // Resolve doctor
    const weekday = WEEKDAYS[slotTime.getDay()];
    let assignedDoctorId = null;

    if (doctor_id) {
      const doc = await Doctor.findOne({ _id: doctor_id, is_active: true, isBookable: true }).lean();
      if (doc) {
        const conflict = await Appointment.findOne({
          doctor_id,
          start_time: slotTime,
          status: { $nin: ['Cancelled', 'No Show'] },
        }).lean();
        if (!conflict) assignedDoctorId = doctor_id;
      }
    }

    if (!assignedDoctorId) {
      const doctors = await Doctor.find({ is_active: true, isBookable: true }).lean();
      const dateKey = toDateKey(slotTime);
      for (const doc of doctors) {
        const wh = doc.bookingWorkingHours?.[weekday];
        const isOpen = wh?.isOpen === true;
        if (!isOpen && !(doc.availability?.[weekday]?.start)) continue;

        const conflict = await Appointment.findOne({
          doctor_id: doc._id,
          start_time: slotTime,
          status: { $nin: ['Cancelled', 'No Show'] },
        }).lean();
        if (!conflict) { assignedDoctorId = doc._id; break; }
      }
    }

    if (!assignedDoctorId) {
      return res.status(409).json({ error: 'This time slot is no longer available. Please pick another time.' });
    }

    const profile      = await ClinicProfile.findOne({}).lean();
    const slotDuration = settings?.slotDurationMinutes || profile?.slot_duration_minutes || 30;
    const endTime      = new Date(slotTime.getTime() + slotDuration * 60 * 1000);
    const patientFullName = `${first_name} ${last_name || ''}`.trim();

    const appointment = new Appointment({
      patient_id:             patientId,
      doctor_id:              assignedDoctorId,
      start_time:             slotTime,
      end_time:               endTime,
      title:                  `${service_name || 'Appointment'} - ${patientFullName}`,
      type:                   service_name || 'Consultation',
      status:                 'Requested',
      booking_source:         'online',
      notes:                  notes || '',
      patient_name_snapshot:  patientFullName,
      patient_phone_snapshot: fullPhone,
    });
    await appointment.save();

    _sendBookingEmails({ models, tenant, patient, appointment, serviceName: service_name })
      .catch(err => console.error('[Booking Email] Error:', err.message));

    res.status(201).json({
      appointment_id:  appointment._id,
      status:          'Requested',
      patient_id:      patientId,
      is_new_patient:  isNewPatient,
      start_time:      appointment.start_time,
      end_time:        appointment.end_time,
      message:         'Appointment request received. The clinic will confirm shortly.',
    });
  } catch (err) {
    console.error('[Booking] requestBooking error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

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
