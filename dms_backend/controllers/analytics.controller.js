
function startOfCurrentMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Visit.doctor_id stores a Doctor _id, but the schema mislabels its ref as
// 'User', so Mongoose populate() resolves nothing. Resolve names directly from
// the Doctor collection instead. Returns a Map<doctorIdString, name>.
async function buildDoctorNameMap(models) {
  const map = new Map();
  if (!models.Doctor) return map;
  const doctors = await models.Doctor.find({}).select('name').lean();
  doctors.forEach(d => map.set(d._id.toString(), d.name || 'Unknown Doctor'));
  return map;
}

// Group array of {date, amount} by day label
function groupByDay(items, dateField, valueField) {
  const map = {};
  items.forEach(item => {
    const d = new Date(item[dateField]);
    const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    map[label] = (map[label] || 0) + (item[valueField] || 0);
  });
  return Object.entries(map).map(([date, amount]) => ({ date, amount }));
}

function groupByMonth(items, dateField, valueField) {
  const map = {};
  items.forEach(item => {
    const d = new Date(item[dateField]);
    const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    map[label] = (map[label] || 0) + (item[valueField] || 0);
  });
  return Object.entries(map).map(([month, total]) => ({ month, total }));
}

// ── SUMMARY ──────────────────────────────────────────────────────────────────
async function getSummary(models, start, end) {
  const { Invoice, Appointment, Patient, LabOrder } = models;
  const [invoices, appointments, newPatients, pendingLabs] = await Promise.all([
    Invoice.find({ createdAt: { $gte: start, $lte: end } }).lean(),
    Appointment.find({ start_time: { $gte: start, $lte: end } }).lean(),
    Patient.find({ createdAt: { $gte: start, $lte: end } }).lean(),
    LabOrder.find({ status: { $in: ['Sent', 'In Process'] } }).lean(),
  ]);

  const total_revenue = invoices.reduce((s, inv) => s + (inv.total_amount || 0), 0);
  const revenue_trend = groupByDay(invoices, 'createdAt', 'total_amount');

  return {
    total_revenue,
    total_appointments: appointments.length,
    new_patients: newPatients.length,
    pending_labs: pendingLabs.length,
    revenue_trend,
  };
}

// ── REVENUE ───────────────────────────────────────────────────────────────────
async function getRevenue(models, start, end) {
  const { Invoice, Visit } = models;
  const [invoices, visits, doctorNames] = await Promise.all([
    Invoice.find({ createdAt: { $gte: start, $lte: end } }).lean(),
    Visit.find({ date: { $gte: start, $lte: end } }).lean(),
    buildDoctorNameMap(models),
  ]);

  const total = invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
  const collected = total;
  const pending = 0;
  const by_payment_method = [];

  const trend = groupByMonth(invoices, 'createdAt', 'total_amount');

  // Top patients by revenue
  const patientMap = {};
  invoices.forEach(inv => {
    const key = inv.patient_id?.toString();
    if (!key) return;
    if (!patientMap[key]) patientMap[key] = { name: inv.patient_name || 'Unknown', total: 0 };
    patientMap[key].total += inv.total_amount || 0;
  });
  const top_patients = Object.values(patientMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Revenue by doctors — attribute each invoice to its visit's treating doctor.
  // Invoices link to a visit via `visit_id`; the visit carries `doctor_id`.
  // (Invoice item_id refs the InventoryItem catalog, NOT a visit treatment, so
  //  it can't be used to map revenue back to a doctor.)
  const visitById = {};
  visits.forEach(v => { visitById[v._id.toString()] = v; });

  const doctorMap = {};
  const ensureDoctor = (v) => {
    const doctorId = v?.doctor_id?.toString();
    if (!doctorId) return null;
    if (!doctorMap[doctorId]) {
      doctorMap[doctorId] = { name: doctorNames.get(doctorId) || 'Unknown Doctor', count: 0, total: 0 };
    }
    return doctorMap[doctorId];
  };

  // Count visits handled per doctor in the period.
  visits.forEach(v => { const e = ensureDoctor(v); if (e) e.count += 1; });

  // Sum invoice revenue against the treating doctor of the linked visit.
  invoices.forEach(inv => {
    const v = inv.visit_id ? visitById[inv.visit_id.toString()] : null;
    const e = v ? ensureDoctor(v) : null;
    if (e) e.total += inv.total_amount || 0;
  });

  const by_doctors = Object.values(doctorMap)
    .filter(d => d.total > 0 || d.count > 0)
    .sort((a, b) => b.total - a.total);

  return { total, collected, pending, trend, by_payment_method, top_patients, by_doctors };
}

// ── DOCTORS ───────────────────────────────────────────────────────────────────
async function getDoctors(models, tenantId, start, end) {
  const { Visit } = models;

  // Visits reference the Doctor collection via doctor_id. The schema mislabels
  // its ref as 'User' so populate() fails — resolve names via buildDoctorNameMap.
  const [visits, doctorNames] = await Promise.all([
    Visit.find({ date: { $gte: start, $lte: end } }).lean(),
    buildDoctorNameMap(models),
  ]);

  const doctorMap = {};
  visits.forEach(v => {
    const key = v.doctor_id?.toString();
    if (!key) return;
    if (!doctorMap[key]) {
      doctorMap[key] = { name: doctorNames.get(key) || 'Unknown Doctor', patient_count: 0, treatment_count: 0 };
    }
    doctorMap[key].patient_count += 1;
    doctorMap[key].treatment_count += (v.treatments?.length || 0);
  });

  const rows = Object.values(doctorMap).sort((a, b) => b.patient_count - a.patient_count);
  const chart = rows.filter(d => d.patient_count > 0 || d.treatment_count > 0);

  return { chart, rows };
}

// ── LAB ───────────────────────────────────────────────────────────────────────
async function getLab(models, start, end) {
  const { LabOrder } = models;
  const labOrders = await LabOrder.find({ order_date: { $gte: start, $lte: end } })
    .populate('vendor_id', 'name')
    .populate('patient_id', 'first_name last_name')
    .lean();

  const statusMap = {};
  labOrders.forEach(o => {
    statusMap[o.status] = (statusMap[o.status] || 0) + 1;
  });
  const by_status = Object.entries(statusMap).map(([name, count]) => ({ name, count }));

  const vendorMap = {};
  labOrders.forEach(o => {
    const v = o.vendor_id?.name || 'Unknown';
    if (!vendorMap[v]) vendorMap[v] = { name: v, count: 0, cost: 0 };
    vendorMap[v].count += 1;
    vendorMap[v].cost += o.cost_to_clinic || 0;
  });
  const by_vendor = Object.values(vendorMap);

  const rows = labOrders.slice(0, 50).map(o => ({
    _id: o._id,
    patient_name: o.patient_id ? `${o.patient_id.first_name} ${o.patient_id.last_name || ''}`.trim() : 'Unknown',
    vendor_name: o.vendor_id?.name || 'N/A',
    order_date: o.order_date,
    expected_delivery: o.expected_delivery,
    status: o.status,
    cost_to_clinic: o.cost_to_clinic || 0,
    items: o.items || [],
  }));

  return { by_status, by_vendor, rows };
}

// ── APPOINTMENTS ──────────────────────────────────────────────────────────────
async function getAppointments(models, start, end) {
  const { Appointment } = models;
  const appointments = await Appointment.find({ start_time: { $gte: start, $lte: end } }).lean();

  const total = appointments.length;
  const completed = appointments.filter(a => a.status === 'Completed').length;
  const cancelled = appointments.filter(a => a.status === 'Cancelled').length;
  const no_show = appointments.filter(a => a.status === 'No Show').length;

  const statusMap = {};
  appointments.forEach(a => {
    statusMap[a.status] = (statusMap[a.status] || 0) + 1;
  });
  const by_status = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

  const dayMap = {};
  appointments.forEach(a => {
    const label = new Date(a.start_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    dayMap[label] = (dayMap[label] || 0) + 1;
  });
  const trend = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

  return { total, completed, cancelled, no_show, by_status, trend };
}

// ── PATIENTS ──────────────────────────────────────────────────────────────────
async function getPatients(models, start, end) {
  const { Patient, Visit } = models;
  const [newPatients, allVisits] = await Promise.all([
    Patient.find({ createdAt: { $gte: start, $lte: end } }).lean(),
    Visit.find({ date: { $gte: start, $lte: end } }).lean(),
  ]);

  const newPatientIds = new Set(newPatients.map(p => p._id.toString()));
  const visitPatientIds = new Set(allVisits.map(v => v.patient_id?.toString()).filter(Boolean));
  const returningIds = [...visitPatientIds].filter(id => !newPatientIds.has(id));
  const returning = returningIds.length;

  // Build display rows for the drill-down lists (clickable New / Return boxes).
  const fmtRow = (p) => ({
    _id: p._id,
    patientId: p.patientId,
    name: `${p.first_name} ${p.last_name || ''}`.trim(),
    mobile: p.contact?.mobile || '',
    created_at: p.createdAt || null,
    last_visit_date: p.last_visit_date || null,
  });

  const new_patient_rows = newPatients
    .map(fmtRow)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Returning = patients with a visit in the period who were NOT created in it.
  const returnPatients = returningIds.length
    ? await Patient.find({ _id: { $in: returningIds } })
        .select('first_name last_name patientId contact last_visit_date createdAt')
        .lean()
    : [];
  const return_patient_rows = returnPatients
    .map(fmtRow)
    .sort((a, b) => new Date(b.last_visit_date) - new Date(a.last_visit_date));

  const monthMap = {};
  newPatients.forEach(p => {
    const label = new Date(p.createdAt).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    if (!monthMap[label]) monthMap[label] = { month: label, new: 0, returning: 0 };
    monthMap[label].new += 1;
  });
  const trend = Object.values(monthMap);

  const treatMap = {};
  allVisits.forEach(v => {
    (v.treatments || []).forEach(t => {
      const name = t.treatment_name || 'Unknown';
      treatMap[name] = (treatMap[name] || 0) + 1;
    });
  });
  const top_treatments = Object.entries(treatMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    new_patients: newPatients.length,
    return_patients: returning,
    new_patient_rows,
    return_patient_rows,
    trend,
    top_treatments,
  };
}

// ── RECALL ────────────────────────────────────────────────────────────────────
async function getRecall(models) {
  const { Patient } = models;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const patients = await Patient.find({
    $or: [
      { last_visit_date: { $lt: sixMonthsAgo } },
      { last_visit_date: null },
    ],
  })
    .select('first_name last_name patientId last_visit_date contact')
    .lean();

  const rows = patients.map(p => ({
    _id: p._id,
    name: `${p.first_name} ${p.last_name || ''}`.trim(),
    patientId: p.patientId,
    last_visit_date: p.last_visit_date || null,
    mobile: p.contact?.mobile || '',
  }));

  return { rows };
}

// ── TREATMENT REVENUE ─────────────────────────────────────────────────────────
async function getTreatmentRevenue(models, start, end) {
  const { Visit } = models;
  const visits = await Visit.find({ date: { $gte: start, $lte: end } }).lean();

  const map = {};
  visits.forEach(v => {
    (v.treatments || []).forEach(t => {
      const name = t.treatment_name || 'Unknown';
      if (!map[name]) map[name] = { name, total_cost: 0, count: 0 };
      map[name].total_cost += (t.cost || 0) * (t.qty || 1);
      map[name].count += 1;
    });
  });

  const by_treatment = Object.values(map).sort((a, b) => b.total_cost - a.total_cost).slice(0, 15);
  return { by_treatment };
}

// ── NO-SHOW ───────────────────────────────────────────────────────────────────
async function getNoShow(models, start, end) {
  const { Appointment } = models;
  const appointments = await Appointment.find({ start_time: { $gte: start, $lte: end } }).lean();

  const total = appointments.length;
  const no_show_count = appointments.filter(a => a.status === 'No Show').length;
  const cancelled_count = appointments.filter(a => a.status === 'Cancelled').length;

  const no_show_rate = total > 0 ? ((no_show_count / total) * 100).toFixed(1) : 0;
  const cancelled_rate = total > 0 ? ((cancelled_count / total) * 100).toFixed(1) : 0;

  const monthMap = {};
  appointments.forEach(a => {
    const label = new Date(a.start_time).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    if (!monthMap[label]) monthMap[label] = { month: label, total: 0, no_show: 0, cancelled: 0 };
    monthMap[label].total += 1;
    if (a.status === 'No Show') monthMap[label].no_show += 1;
    if (a.status === 'Cancelled') monthMap[label].cancelled += 1;
  });
  const by_month = Object.values(monthMap);

  return { total, no_show_count, cancelled_count, no_show_rate, cancelled_rate, by_month };
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
export async function getAnalytics(req, res) {
  const { section, from, to } = req.query;
  const { tenantModels: models, user } = req;
  const start = from ? new Date(from) : startOfCurrentMonth();
  const end = to ? new Date(to + 'T23:59:59.999Z') : new Date();

  try {
    switch (section) {
      case 'summary':           return res.json(await getSummary(models, start, end));
      case 'revenue':           return res.json(await getRevenue(models, start, end));
      case 'doctors':           return res.json(await getDoctors(models, user.tenantId, start, end));
      case 'lab':               return res.json(await getLab(models, start, end));
      case 'appointments':      return res.json(await getAppointments(models, start, end));
      case 'patients':          return res.json(await getPatients(models, start, end));
      case 'recall':            return res.json(await getRecall(models));
      case 'treatment_revenue': return res.json(await getTreatmentRevenue(models, start, end));
      case 'no_show':           return res.json(await getNoShow(models, start, end));
      default: return res.status(400).json({ error: `Unknown section: ${section}` });
    }
  } catch (err) {
    console.error('[Analytics]', err.message);
    res.status(500).json({ error: err.message });
  }
}
