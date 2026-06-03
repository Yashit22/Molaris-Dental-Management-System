import { runBulkInsert } from '../utils/csvBulkUpload.js';

// GET /api/clinical-findings
export async function getClinicalFindings(req, res) {
  const { ClinicalFinding } = req.tenantModels;
  try {
    const { search } = req.query;
    let query = { is_active: true };

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const findings = await ClinicalFinding.find(query).sort({ name: 1 });
    res.json(findings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/clinical-findings
export async function createClinicalFinding(req, res) {
  const { ClinicalFinding } = req.tenantModels;
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const exists = await ClinicalFinding.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
    if (exists) return res.status(409).json({ error: `"${name}" already exists` });
    const newFinding = new ClinicalFinding({ ...req.body, name });
    await newFinding.save();
    res.status(201).json(newFinding);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// PUT /api/clinical-findings/:id
export async function updateClinicalFinding(req, res) {
  const { ClinicalFinding } = req.tenantModels;
  try {
    if (req.body.name) {
      const name = req.body.name.trim();
      const exists = await ClinicalFinding.findOne({ name: { $regex: `^${name}$`, $options: 'i' }, _id: { $ne: req.params.id } });
      if (exists) return res.status(409).json({ error: `"${name}" already exists` });
      req.body.name = name;
    }
    const finding = await ClinicalFinding.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!finding) return res.status(404).json({ error: 'Finding not found' });
    res.json(finding);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// DELETE /api/clinical-findings/:id
export async function deleteClinicalFinding(req, res) {
  const { ClinicalFinding } = req.tenantModels;
  try {
    const finding = await ClinicalFinding.findByIdAndDelete(req.params.id);
    if (!finding) return res.status(404).json({ error: 'Finding not found' });
    res.json({ msg: 'Finding deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/clinical-findings/bulk-upload
// Accepts { sheetUrl } OR { rows: [{ name, category, description }] }
export async function bulkUploadClinicalFindings(req, res) {
  const { ClinicalFinding } = req.tenantModels;
  try {
    const existing = await ClinicalFinding.find({}, 'name').lean();
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
        category: row.category || '',
        description: row.description || '',
        is_active: true,
      }),
      Model: ClinicalFinding,
    });
    res.json(result);
  } catch (err) {
    console.error('bulkUploadClinicalFindings error:', err);
    res.status(err.status || 500).json({ error: err.userMessage || err.message });
  }
}
