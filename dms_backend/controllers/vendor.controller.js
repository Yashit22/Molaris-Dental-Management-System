import { runBulkInsert } from '../utils/csvBulkUpload.js';

// GET /api/vendors
export async function getVendors(req, res) {
  const { Vendor } = req.tenantModels;
  try {
    const { type } = req.query;
    const query = type ? { type } : { type: { $in: ['Lab', 'General', 'Consumable'] } };
    const vendors = await Vendor.find(query);
    res.json(vendors);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/vendors
export async function createVendor(req, res) {
  const { Vendor } = req.tenantModels;
  try {
    const newVendor = new Vendor(req.body);
    await newVendor.save();
    res.status(201).json(newVendor);
  } catch (err) { res.status(400).json({ error: err.message }); }
}

// PUT /api/vendors/:id
export async function updateVendor(req, res) {
  const { Vendor } = req.tenantModels;
  try {
    const updatedVendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedVendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(updatedVendor);
  } catch (err) { res.status(400).json({ error: err.message }); }
}

// DELETE /api/vendors/:id
export async function deleteVendor(req, res) {
  const { Vendor } = req.tenantModels;
  try {
    const deletedVendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!deletedVendor) return res.status(404).json({ error: "Vendor not found" });
    res.json({ message: "Vendor deleted successfully" });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/vendors/bulk-upload
// Accepts { sheetUrl } OR { rows: [...] }
export async function bulkUploadVendors(req, res) {
  const { Vendor } = req.tenantModels;
  try {
    const existing = await Vendor.find({}, 'name').lean();
    const existingKeys = new Set(existing.map(v => String(v.name).trim().toLowerCase()));
    const validTypes = ['Pharmacy', 'Consumable', 'Lab', 'General'];

    const result = await runBulkInsert({
      body: req.body,
      requiredHeaders: ['name'],
      existingKeys,
      validateRow: (row) => {
        if (!row.name) return { column: 'name', value: '', message: 'Name is required' };
        if (row.type && !validTypes.includes(row.type)) {
          return { column: 'type', value: row.type, message: `Type must be one of: ${validTypes.join(', ')}` };
        }
        if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
          return { column: 'email', value: row.email, message: 'Invalid email format' };
        }
        return null;
      },
      dedupeKey: (row) => row.name,
      transformRow: (row) => ({
        name: row.name,
        type: validTypes.includes(row.type) ? row.type : 'General',
        contact_person: row['contact person'] || row.contactperson || '',
        phone:          row.phone   || '',
        email:          row.email   || '',
        address:        row.address || '',
        gst_number:     row['gst number'] || row.gstnumber || row.gst || '',
      }),
      Model: Vendor,
    });
    res.json(result);
  } catch (err) {
    console.error('bulkUploadVendors error:', err);
    res.status(err.status || 500).json({ error: err.userMessage || err.message });
  }
}
