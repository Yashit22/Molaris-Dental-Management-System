import { runBulkInsert } from '../utils/csvBulkUpload.js';

// GET /api/diagnoses
export async function getDiagnoses(req, res) {
  const { Diagnosis } = req.tenantModels;
  try {
    const { search } = req.query;
    let query = { is_active: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const diagnoses = await Diagnosis.find(query).sort({ name: 1 });
    res.json(diagnoses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/diagnoses
export async function createDiagnosis(req, res) {
  const { Diagnosis } = req.tenantModels;
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const exists = await Diagnosis.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
    if (exists) return res.status(409).json({ error: `"${name}" already exists` });
    const newDiagnosis = new Diagnosis({ ...req.body, name });
    await newDiagnosis.save();
    res.status(201).json(newDiagnosis);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// PUT /api/diagnoses/:id
export async function updateDiagnosis(req, res) {
  const { Diagnosis } = req.tenantModels;
  try {
    if (req.body.name) {
      const name = req.body.name.trim();
      const exists = await Diagnosis.findOne({ name: { $regex: `^${name}$`, $options: 'i' }, _id: { $ne: req.params.id } });
      if (exists) return res.status(409).json({ error: `"${name}" already exists` });
      req.body.name = name;
    }
    const diagnosis = await Diagnosis.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!diagnosis) return res.status(404).json({ error: 'Diagnosis not found' });
    res.json(diagnosis);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// DELETE /api/diagnoses/:id
export async function deleteDiagnosis(req, res) {
  const { Diagnosis } = req.tenantModels;
  try {
    const diagnosis = await Diagnosis.findByIdAndDelete(req.params.id);
    if (!diagnosis) return res.status(404).json({ error: 'Diagnosis not found' });
    res.json({ msg: 'Diagnosis deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/diagnoses/bulk-upload
// Accepts { sheetUrl } OR { rows: [{ name, code, category, description }] }
export async function bulkUploadDiagnoses(req, res) {
  const { Diagnosis } = req.tenantModels;
  try {
    const existing = await Diagnosis.find({}, 'name').lean();
    const existingKeys = new Set(existing.map(i => String(i.name).trim().toLowerCase()));

    const result = await runBulkInsert({
      body: req.body,
      requiredHeaders: ['name'],
      existingKeys,
      validateRow: (row) => {
        if (!row.name) return { column: 'name', value: '', message: 'Name is required' };
        if (row.name.length > 200) return { column: 'name', value: row.name, message: 'Name is too long (max 200 chars)' };
        return null;
      },
      dedupeKey: (row) => row.name,
      transformRow: (row) => ({
        name: row.name,
        code: row.code || '',
        category: row.category || '',
        description: row.description || '',
        is_active: true,
      }),
      Model: Diagnosis,
    });
    res.json(result);
  } catch (err) {
    console.error('bulkUploadDiagnoses error:', err);
    res.status(err.status || 500).json({ error: err.userMessage || err.message });
  }
}
