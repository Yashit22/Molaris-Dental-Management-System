import { logEvent } from '../services/analyticsLogger.js';
import { triggerWhatsApp } from '../services/whatsapp.service.js';

// Helper: Generate ID
const generateInvoiceId = async (Invoice) => {
  const count = await Invoice.countDocuments();
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count + 1).padStart(3, '0')}`;
};

// ==========================================
//               INVOICE LOGIC
// ==========================================

// GET /api/invoices
export async function getInvoices(req, res) {
  const { Invoice } = req.tenantModels;
  try {
    const filter = {};
    if (req.query.patient_id)     filter.patient_id     = req.query.patient_id;
    if (req.query.visit_id)       filter.visit_id       = req.query.visit_id;
    if (req.query.appointment_id) filter.appointment_id = req.query.appointment_id;
    const invoices = await Invoice.find(filter).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/invoices/:id
export async function getInvoiceById(req, res) {
  const { Invoice } = req.tenantModels;
  try {
      const invoice = await Invoice.findById(req.params.id);
      if(!invoice) return res.status(404).json({error: "Invoice not found"});
      res.json(invoice);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/invoices
export async function createInvoice(req, res) {
  const { Invoice, LabOrder } = req.tenantModels;
  try {
    const {
        patient_id, patient_name, patient_phone, date, items,
        subtotal, total_amount, visit_id, appointment_id,
    } = req.body;

    // One-and-only-one invoice per appointment. If one already exists for this
    // appointment, update it in place instead of creating a duplicate — so both
    // generation paths (treatment page + completed-appointments section) converge
    // on the single invoice. Items can only be added/edited post-creation.
    if (appointment_id) {
      const existing = await Invoice.findOne({ appointment_id });
      if (existing) {
        req.params = { ...req.params, id: existing._id };
        return updateInvoice(req, res);
      }
    }

    // 1. Generate ID
    const invoice_id = await generateInvoiceId(Invoice);

    // 2. Save Invoice
    const newInvoice = new Invoice({
        invoice_id,
        patient_id,
        patient_name,
        patient_phone,
        visit_id: visit_id || null,
        appointment_id: appointment_id || null,
        date,
        items,
        subtotal,
        total_amount,
    });

    await newInvoice.save();

    // 4. Create LabOrder documents for each Lab item so they appear in Lab Orders section
    for (const item of items) {
      if (item.type === 'Lab') {
        await LabOrder.create({
          patient_id,
          visit_id:       visit_id || null,
          appointment_id: appointment_id || null,
          invoice_id:     newInvoice._id,
          order_date:     date || new Date(),
          items: [{
            item_name:    item.name,
            cost:         item.rate,
          }],
          cost_to_clinic: item.rate * (item.quantity || 1),
          status:         'Sent',
        });
      }
    }

    // Fire-and-forget WhatsApp notification (invoice + latest prescription)
    if (newInvoice.patient_phone && newInvoice.patient_id) {
      const patientIdStr = newInvoice.patient_id?.toString();
      // Fetch patient details and latest prescription from today's visit
      const today = new Date(); today.setHours(0, 0, 0, 0);
      Promise.all([
        req.tenantModels.Patient.findById(newInvoice.patient_id).select('first_name last_name patientId contact').lean(),
        req.tenantModels.Visit.findOne({
          patient_id: newInvoice.patient_id,
          date: { $gte: today },
        }).sort({ date: -1 }).lean(),
      ])
        .then(([patient, visit]) => {
          if (!patient) return;
          const firstName = patient.first_name;
          const fullName = `${firstName} ${patient.last_name || ''}`.trim();
          const rx = visit?.prescriptions?.[visit.prescriptions.length - 1];
          const amount = Number(newInvoice.total_amount) || 0;
          const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
          triggerWhatsApp(
            req.tenantModels, req.user.tenantId, process.env.WAAPI_BASE_URL,
            'invoiceAndPrescription',
            newInvoice.patient_phone,
            {
              name: fullName,
              firstName,
              patientId: patient.patientId,
              mobile: patient.contact?.mobile || '',
              amount: formatted,
              invoiceId: newInvoice.invoice_id,
              drug: rx?.drug_name || '',
              dosage: rx?.dosage || '',
              duration: rx?.duration || '',
            },
            patientIdStr,
            null, null, null,
            `invoice:${newInvoice.invoice_id}`
          );
        })
        .catch(() => {});
    }

    res.status(201).json(newInvoice);

  } catch (err) {
    // Lost a race against a concurrent create for the same appointment (the
    // partial-unique index on appointment_id fired). Converge onto the invoice
    // that won by updating it instead of erroring — keeps one-per-appointment.
    if (err?.code === 11000 && req.body.appointment_id) {
      const existing = await Invoice.findOne({ appointment_id: req.body.appointment_id });
      if (existing) {
        req.params = { ...req.params, id: existing._id };
        return updateInvoice(req, res);
      }
    }
    console.error("Create Invoice Error:", err);
    res.status(400).json({ error: err.message });
  }
}

// PUT /api/invoices/:id (Manual Update)
export async function updateInvoice(req, res) {
  const { Invoice, LabOrder } = req.tenantModels;
  try {
      const invoice = await Invoice.findById(req.params.id);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      const { subtotal, total_amount, items, notes, date, appointment_id, visit_id } = req.body;
      if (subtotal !== undefined)     invoice.subtotal     = subtotal;
      if (total_amount !== undefined) invoice.total_amount = total_amount;
      if (items !== undefined)        invoice.items        = items;
      if (notes !== undefined)        invoice.notes        = notes;
      if (date !== undefined)         invoice.date         = date;
      // Backfill the appointment/visit link if this invoice predates it.
      if (appointment_id && !invoice.appointment_id) invoice.appointment_id = appointment_id;
      if (visit_id && !invoice.visit_id)             invoice.visit_id       = visit_id;
      await invoice.save();

      // Reconcile LabOrder documents with the invoice's current Lab items.
      // Preserve existing orders (and their status) matched by item name; create
      // only genuinely new ones; remove orders whose item no longer appears.
      if (items !== undefined) {
        const labItems = items.filter(it => it.type === 'Lab' && it.name?.trim());
        const existing = await LabOrder.find({ invoice_id: invoice._id });

        const wantNames = new Set(labItems.map(it => it.name.trim().toLowerCase()));
        const haveNames = new Set();

        // Remove orders no longer on the invoice
        for (const ord of existing) {
          const nm = (ord.items?.[0]?.item_name || '').trim().toLowerCase();
          if (!wantNames.has(nm)) {
            await LabOrder.deleteOne({ _id: ord._id });
          } else {
            haveNames.add(nm);
          }
        }

        // Create orders for new lab items only
        for (const item of labItems) {
          const nm = item.name.trim().toLowerCase();
          if (haveNames.has(nm)) continue;
          await LabOrder.create({
            patient_id:     invoice.patient_id,
            visit_id:       invoice.visit_id || null,
            appointment_id: invoice.appointment_id || null,
            invoice_id:     invoice._id,
            order_date:     invoice.date || new Date(),
            items: [{ item_name: item.name, cost: item.rate }],
            cost_to_clinic: item.rate * (item.quantity || 1),
            status:         'Sent',
          });
          haveNames.add(nm);
        }
      }

      res.json(invoice);
  } catch (err) { res.status(400).json({ error: err.message }); }
}

