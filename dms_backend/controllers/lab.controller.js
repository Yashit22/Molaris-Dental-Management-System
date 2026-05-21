import { runBulkInsert } from '../utils/csvBulkUpload.js';

// =======================
// 1. LAB ORDERS
// =======================

export async function getOrders(req, res) {
  const { LabOrder } = req.tenantModels;
  try {
    const orders = await LabOrder.find()
      .populate('patient_id', 'first_name last_name patientId')
      .populate('vendor_id', 'name')
      .populate('invoice_id', 'status paid_amount total_amount')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createOrder(req, res) {
  const { LabOrder } = req.tenantModels;
  try {
    const { patient_id, vendor_id, item_name, shade, cost_to_clinic, order_date, expected_delivery, notes } = req.body;

    const newOrder = new LabOrder({
      patient_id,
      vendor_id: vendor_id || undefined,
      order_date: order_date || new Date(),
      expected_delivery: expected_delivery || undefined,
      items: [{ item_name, shade, instructions: notes, cost: cost_to_clinic }],
      cost_to_clinic,
      status: 'Sent',
    });

    const saved = await newOrder.save();
    const populated = await LabOrder.findById(saved._id)
      .populate('patient_id', 'first_name last_name patientId')
      .populate('vendor_id', 'name');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// PATCH /api/labs/orders/:id — status-only update (inline table)
export async function updateOrderStatus(req, res) {
  const { LabOrder } = req.tenantModels;
  try {
    const { status } = req.body;
    const updated = await LabOrder.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )
      .populate('patient_id', 'first_name last_name patientId')
      .populate('vendor_id', 'name');
    if (!updated) return res.status(404).json({ error: 'Order not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// PUT /api/labs/orders/:id — full update (from edit modal)
export async function updateOrderFull(req, res) {
  const { LabOrder } = req.tenantModels;
  try {
    const { patient_id, vendor_id, item_name, shade, cost_to_clinic, order_date, expected_delivery, notes, status } = req.body;

    const updated = await LabOrder.findByIdAndUpdate(
      req.params.id,
      {
        patient_id,
        vendor_id: vendor_id || undefined,
        order_date,
        expected_delivery: expected_delivery || undefined,
        items: [{ item_name, shade, instructions: notes, cost: cost_to_clinic }],
        cost_to_clinic,
        status,
      },
      { new: true }
    )
      .populate('patient_id', 'first_name last_name patientId')
      .populate('vendor_id', 'name');

    if (!updated) return res.status(404).json({ error: 'Order not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// =======================
// 2. LAB CATALOG
// =======================

export async function getCatalog(req, res) {
  const { LabCatalogItem } = req.tenantModels;
  try {
    const items = await LabCatalogItem.find().populate('preferred_vendor_id', 'name');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createCatalogItem(req, res) {
  const { LabCatalogItem } = req.tenantModels;
  try {
    const payload = {
      ...req.body,
      preferred_vendor_id: req.body.preferred_vendor_id || undefined,
    };
    const newItem = new LabCatalogItem(payload);
    await newItem.save();
    const populated = await LabCatalogItem.findById(newItem._id).populate('preferred_vendor_id', 'name');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateCatalogItem(req, res) {
  const { LabCatalogItem } = req.tenantModels;
  try {
    const payload = {
      ...req.body,
      preferred_vendor_id: req.body.preferred_vendor_id || undefined,
    };
    const updated = await LabCatalogItem.findByIdAndUpdate(req.params.id, payload, { new: true })
      .populate('preferred_vendor_id', 'name');
    if (!updated) return res.status(404).json({ error: 'Item not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// =======================
// 3. BULK UPLOAD
// =======================

function parseMoney(v) {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function isUnparsableNumber(v) {
  if (v == null || v === '') return false;
  return !/[0-9]/.test(String(v));
}

// POST /api/labs/bulk-upload-items
// Accepts { sheetUrl } OR { rows: [...] }
export async function bulkUploadLabItems(req, res) {
  const { LabCatalogItem } = req.tenantModels;
  try {
    const existing = await LabCatalogItem.find({}, 'name').lean();
    const existingKeys = new Set(existing.map(i => String(i.name).trim().toLowerCase()));

    const result = await runBulkInsert({
      body: req.body,
      requiredHeaders: ['name'],
      existingKeys,
      validateRow: (row) => {
        if (!row.name) return { column: 'name', value: '', message: 'Name is required' };
        const costCell = row.cost ?? row.price;
        if (isUnparsableNumber(costCell)) return { column: 'cost', value: costCell, message: 'Cost must be a number' };
        return null;
      },
      dedupeKey: (row) => row.name,
      transformRow: (row) => ({
        name: row.name,
        category: row.category || 'Other',
        price:    parseMoney(row.cost ?? row.price),
        turnaround_time: row.turnaround || row['turnaround time'] || row['turnaround_time'] || '',
      }),
      Model: LabCatalogItem,
    });
    res.json(result);
  } catch (err) {
    console.error('bulkUploadLabItems error:', err);
    res.status(err.status || 500).json({ error: err.userMessage || err.message });
  }
}

// POST /api/labs/bulk-upload-vendors
// Accepts { sheetUrl } OR { rows: [...] }
export async function bulkUploadLabVendors(req, res) {
  const { Vendor } = req.tenantModels;
  try {
    const existing = await Vendor.find({ type: 'Lab' }, 'name').lean();
    const existingKeys = new Set(existing.map(v => String(v.name).trim().toLowerCase()));

    const result = await runBulkInsert({
      body: req.body,
      requiredHeaders: ['name'],
      existingKeys,
      validateRow: (row) => {
        if (!row.name) return { column: 'name', value: '', message: 'Name is required' };
        if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
          return { column: 'email', value: row.email, message: 'Invalid email format' };
        }
        return null;
      },
      dedupeKey: (row) => row.name,
      transformRow: (row) => ({
        name: row.name,
        type: 'Lab',
        contact_person: row['contact person'] || row.contact_person || row.contact || '',
        phone:          row.phone || row.mobile || '',
        email:          row.email   || '',
        address:        row.address || '',
      }),
      Model: Vendor,
    });
    res.json(result);
  } catch (err) {
    console.error('bulkUploadLabVendors error:', err);
    res.status(err.status || 500).json({ error: err.userMessage || err.message });
  }
}
