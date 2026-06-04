const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

const DEFAULT_BOOKING_SETTINGS = {
  isBookingEnabled: false,
  slotDurationMinutes: 30,
  clinicDisplayName: '',
  clinicTagline: '',
  clinicLogoUrl: '',
  workingHours: Object.fromEntries(
    DAYS.map(d => [d, { isOpen: d !== 'sunday', start: '09:00', end: '17:00', breaks: [] }])
  ),
  blockedDates: [],
};

const DEFAULT_DOCTOR_SCHEDULE = {
  monday:    { isOpen: true,  start: '09:00', end: '17:00', breaks: [] },
  tuesday:   { isOpen: true,  start: '09:00', end: '17:00', breaks: [] },
  wednesday: { isOpen: true,  start: '09:00', end: '17:00', breaks: [] },
  thursday:  { isOpen: true,  start: '09:00', end: '17:00', breaks: [] },
  friday:    { isOpen: true,  start: '09:00', end: '17:00', breaks: [] },
  saturday:  { isOpen: true,  start: '10:00', end: '14:00', breaks: [] },
  sunday:    { isOpen: false, start: '09:00', end: '17:00', breaks: [] },
};

// GET /api/settings/booking
export async function getBookingSettings(req, res) {
  try {
    const { BookingSettings } = req.tenantModels;
    const doc = await BookingSettings.findOne({}).lean();
    if (!doc) return res.json(DEFAULT_BOOKING_SETTINGS);
    const { _id, __v, createdAt, updatedAt, ...data } = doc;
    res.json({ ...DEFAULT_BOOKING_SETTINGS, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/settings/booking
export async function saveBookingSettings(req, res) {
  try {
    const { BookingSettings } = req.tenantModels;
    const { _id, __v, createdAt, updatedAt, ...body } = req.body;

    const doc = await BookingSettings.findOneAndUpdate(
      {},
      { $set: body },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    const { _id: id, __v: v, createdAt: ca, updatedAt: ua, ...data } = doc;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/settings/doctors/:id/schedule
export async function getDoctorSchedule(req, res) {
  try {
    const { Doctor } = req.tenantModels;
    const doctor = await Doctor.findById(req.params.id)
      .select('name isBookable useCustomBookingSchedule availability bookingWorkingHours holidays blockedSlots')
      .lean();
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    // Merge stored working hours with defaults so every day is always present
    const bookingWorkingHours = {};
    for (const day of DAYS) {
      bookingWorkingHours[day] = {
        ...DEFAULT_DOCTOR_SCHEDULE[day],
        ...(doctor.bookingWorkingHours?.[day] || {}),
      };
    }

    res.json({
      isBookable: doctor.isBookable || false,
      useCustomBookingSchedule: doctor.useCustomBookingSchedule || false,
      availability: doctor.availability || {},
      bookingWorkingHours,
      holidays:     doctor.holidays     || [],
      blockedSlots: doctor.blockedSlots || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/settings/invoice
export async function getInvoiceSettings(req, res) {
  try {
    const { InvoiceSettings } = req.tenantModels;
    const settings = await InvoiceSettings.findOne().lean();
    res.json(settings || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PUT /api/settings/invoice
export async function saveInvoiceSettings(req, res) {
  try {
    const { InvoiceSettings } = req.tenantModels;
    const { _id, __v, createdAt, updatedAt, ...body } = req.body;
    const settings = await InvoiceSettings.findOneAndUpdate(
      {},
      { $set: body },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// GET /api/settings/prescription
export async function getPrescriptionSettings(req, res) {
  try {
    const { PrescriptionSettings } = req.tenantModels;
    const settings = await PrescriptionSettings.findOne().lean();
    res.json(settings || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PUT /api/settings/prescription
export async function savePrescriptionSettings(req, res) {
  try {
    const { PrescriptionSettings } = req.tenantModels;
    const { _id, __v, createdAt, updatedAt, ...body } = req.body;
    const settings = await PrescriptionSettings.findOneAndUpdate(
      {},
      { $set: body },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// PUT /api/settings/doctors/:id/schedule
export async function saveDoctorSchedule(req, res) {
  try {
    const { Doctor } = req.tenantModels;
    const { isBookable, useCustomBookingSchedule, bookingWorkingHours, holidays, blockedSlots } = req.body;

    const update = {};
    if (isBookable !== undefined) update.isBookable = isBookable;
    if (useCustomBookingSchedule !== undefined) update.useCustomBookingSchedule = useCustomBookingSchedule;
    if (bookingWorkingHours !== undefined) update.bookingWorkingHours = bookingWorkingHours;
    if (holidays !== undefined) update.holidays = holidays;
    if (blockedSlots !== undefined) update.blockedSlots = blockedSlots;

    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    ).select('name isBookable bookingWorkingHours holidays blockedSlots').lean();

    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    res.json(doctor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
