import mongoose from 'mongoose';
import { getAnalyticsDb } from '../config/analyticsDb.js';

function startOfCurrentMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
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
  const invoices = await Invoice.find({ createdAt: { $gte: start, $lte: end } }).lean();
  const visits = await Visit.find({ date: { $gte: start, $lte: end } }).populate('doctor_id', 'name').lean();

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

  // Revenue by doctors
  const doctorMap = {};
  visits.forEach(v => {
    const doctorId = v.doctor_id?._id?.toString() || 'Unknown';
    const doctorName = v.doctor_id?.name || 'Unknown Doctor';
    if (!doctorMap[doctorId]) {
      doctorMap[doctorId] = { name: doctorName, count: 0, total: 0 };
    }
    doctorMap[doctorId].count += 1;
  });

  invoices.forEach(inv => {
    const treatments = inv.items || [];
    treatments.forEach(item => {
      if (item.item_id) {
        const visit = visits.find(v => v.treatments?.some(t => t._id?.toString() === item.item_id?.toString()));
        if (visit && visit.doctor_id) {
          const doctorId = visit.doctor_id._id?.toString();
          if (doctorMap[doctorId]) {
            doctorMap[doctorId].total += item.total || 0;
          }
        }
      }
    });
  });

  const by_doctors = Object.values(doctorMap).sort((a, b) => b.total - a.total);

  return { total, collected, pending, trend, by_payment_method, top_patients, by_doctors };
}

// ── DOCTORS ───────────────────────────────────────────────────────────────────
async function getDoctors(models, tenantId, start, end) {
  const { Visit } = models;
  const analyticsDb = getAnalyticsDb();

  const [visits, doctors] = await Promise.all([
    Visit.find({ date: { $gte: start, $lte: end } }).lean(),
    analyticsDb.collection('dms_users').find({
      product: 'dms',
      tenantId: new mongoose.Types.ObjectId(tenantId),
      role: 'Doctor',
      status: 'active'
    }).toArray()
  ]);

  const doctorMap = {};
  doctors.forEach(d => {
    doctorMap[d._id.toString()] = { name: `${d.firstName} ${d.lastName}`.trim(), patient_count: 0, treatment_count: 0 };
  });

  visits.forEach(v => {
    const key = v.doctor_id?.toString();
    if (!key || !doctorMap[key]) return;
    doctorMap[key].patient_count += 1;
    doctorMap[key].treatment_count += (v.treatments?.length || 0);
  });

  const chart = Object.values(doctorMap).filter(d => d.patient_count > 0 || d.treatment_count > 0);
  const rows = Object.values(doctorMap);

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
  const visitPatientIds = new Set(allVisits.map(v => v.patient_id?.toString()));
  const returning = [...visitPatientIds].filter(id => !newPatientIds.has(id)).length;

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

  return { new_patients: newPatients.length, return_patients: returning, trend, top_treatments };
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
