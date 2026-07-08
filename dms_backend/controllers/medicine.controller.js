import { runBulkInsert } from '../utils/csvBulkUpload.js';

// GET /api/medicines
export async function getMedicines(req, res) {
  const { Medicine } = req.tenantModels;
  try {
    const { search } = req.query;
    let query = { is_active: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { composition: { $regex: search, $options: 'i' } },
      ];
    }

    const medicines = await Medicine.find(query).sort({ name: 1 });
    res.json(medicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/medicines
export async function createMedicine(req, res) {
  const { Medicine } = req.tenantModels;
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const exists = await Medicine.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
    if (exists) return res.status(409).json({ error: `"${name}" already exists` });
    const newMedicine = new Medicine({ ...req.body, name });
    await newMedicine.save();
    res.status(201).json(newMedicine);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// PUT /api/medicines/:id
export async function updateMedicine(req, res) {
  const { Medicine } = req.tenantModels;
  try {
    if (req.body.name) {
      const name = req.body.name.trim();
      const exists = await Medicine.findOne({ name: { $regex: `^${name}$`, $options: 'i' }, _id: { $ne: req.params.id } });
      if (exists) return res.status(409).json({ error: `"${name}" already exists` });
      req.body.name = name;
    }
    const medicine = await Medicine.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!medicine) return res.status(404).json({ error: 'Medicine not found' });
    res.json(medicine);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// DELETE /api/medicines/:id
export async function deleteMedicine(req, res) {
  const { Medicine } = req.tenantModels;
  try {
    const medicine = await Medicine.findByIdAndDelete(req.params.id);
    if (!medicine) return res.status(404).json({ error: 'Medicine not found' });
    res.json({ msg: 'Medicine deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/medicines/bulk-upload
// Accepts { sheetUrl } OR { rows: [{ name, composition, strength, form, category,
//   default_dosage, default_duration, default_instructions, cost }] }
export async function bulkUploadMedicines(req, res) {
  const { Medicine } = req.tenantModels;
  try {
    const existing = await Medicine.find({}, 'name').lean();
    const existingKeys = new Set(existing.map(i => String(i.name).trim().toLowerCase()));

    const result = await runBulkInsert({
      body: req.body,
      requiredHeaders: ['name'],
      existingKeys,
      validateRow: (row) => {
        if (!row.name) return { column: 'name', value: '', message: 'Name is required' };
        if (row.name.length > 200) return { column: 'name', value: row.name, message: 'Name is too long (max 200 chars)' };
        if (row.cost && isNaN(Number(String(row.cost).replace(/[^0-9.]/g, '')))) {
          return { column: 'cost', value: row.cost, message: 'Cost must be a number' };
        }
        return null;
      },
      dedupeKey: (row) => row.name,
      transformRow: (row) => ({
        name: row.name,
        composition: row.composition || '',
        strength: row.strength || '',
        form: row.form || '',
        category: row.category || '',
        default_dosage: row.default_dosage || '',
        default_duration: row.default_duration || '',
        default_instructions: row.default_instructions || '',
        cost: Number(String(row.cost || '0').replace(/[^0-9.]/g, '')) || 0,
        is_active: true,
      }),
      Model: Medicine,
    });
    res.json(result);
  } catch (err) {
    console.error('bulkUploadMedicines error:', err);
    res.status(err.status || 500).json({ error: err.userMessage || err.message });
  }
}
