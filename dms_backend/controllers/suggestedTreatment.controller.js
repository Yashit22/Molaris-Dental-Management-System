import { runBulkInsert } from '../utils/csvBulkUpload.js';

// GET /api/suggested-treatments
export async function getSuggestedTreatments(req, res) {
  const { SuggestedTreatment } = req.tenantModels;
  try {
    const { search } = req.query;
    let query = { is_active: true };

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const treatments = await SuggestedTreatment.find(query).sort({ name: 1 });
    res.json(treatments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/suggested-treatments
export async function createSuggestedTreatment(req, res) {
  const { SuggestedTreatment } = req.tenantModels;
  try {
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const exists = await SuggestedTreatment.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
    if (exists) return res.status(409).json({ error: `"${name}" already exists` });
    const newTreatment = new SuggestedTreatment({ ...req.body, name });
    await newTreatment.save();
    res.status(201).json(newTreatment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// PUT /api/suggested-treatments/:id
export async function updateSuggestedTreatment(req, res) {
  const { SuggestedTreatment } = req.tenantModels;
  try {
    if (req.body.name) {
      const name = req.body.name.trim();
      const exists = await SuggestedTreatment.findOne({ name: { $regex: `^${name}$`, $options: 'i' }, _id: { $ne: req.params.id } });
      if (exists) return res.status(409).json({ error: `"${name}" already exists` });
      req.body.name = name;
    }
    const treatment = await SuggestedTreatment.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!treatment) return res.status(404).json({ error: 'Treatment not found' });
    res.json(treatment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// DELETE /api/suggested-treatments/:id
export async function deleteSuggestedTreatment(req, res) {
  const { SuggestedTreatment } = req.tenantModels;
  try {
    const treatment = await SuggestedTreatment.findByIdAndDelete(req.params.id);
    if (!treatment) return res.status(404).json({ error: 'Treatment not found' });
    res.json({ msg: 'Treatment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/suggested-treatments/bulk-upload
// Accepts { sheetUrl } OR { rows: [{ name, category, cost, description }] }
export async function bulkUploadSuggestedTreatments(req, res) {
  const { SuggestedTreatment } = req.tenantModels;
  try {
    const existing = await SuggestedTreatment.find({}, 'name').lean();
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
        cost: Number(String(row.cost || '0').replace(/[^0-9.]/g, '')) || 0,
        category: row.category || '',
        description: row.description || '',
        is_active: true,
      }),
      Model: SuggestedTreatment,
    });
    res.json(result);
  } catch (err) {
    console.error('bulkUploadSuggestedTreatments error:', err);
    res.status(err.status || 500).json({ error: err.userMessage || err.message });
  }
}
