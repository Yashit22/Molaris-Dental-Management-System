import PDFDocument from 'pdfkit';

// ─── Brand palette ────────────────────────────────────────────────────────────
const BRAND_BLUE   = '#137fec';
const BRAND_DARK   = '#0d1b2a';
const BODY_TEXT    = '#2d3748';
const MUTED        = '#718096';
const BORDER_LIGHT = '#e2e8f0';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function htmlToText(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Fetch a remote image (clinic logo / QR) as a Buffer for pdfkit. Never throws.
async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

function age(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const diff = Date.now() - d.getTime();
  return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

function fmtDate(d) {
  return new Date(d || Date.now()).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ─── Branded clinic header (shared by all document types) ───────────────────────
// Returns the Y coordinate where body content should begin.
function drawClinicHeader(doc, ds, logoBuf, { showLogo = true } = {}) {
  const ML = doc.page.margins.left;
  const MR = doc.page.margins.right;
  const PW = doc.page.width;
  const contentWidth = PW - ML - MR;

  let textX = ML;
  if (showLogo && logoBuf) {
    try {
      doc.image(logoBuf, ML, 40, { fit: [70, 70] });
      textX = ML + 84;
    } catch { /* bad image — ignore */ }
  }

  doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(18)
     .text(ds.clinic_name || 'Dental Clinic', textX, 44, { width: contentWidth - (textX - ML) });

  let y = doc.y + 1;
  if (ds.tagline) {
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9)
       .text(ds.tagline, textX, y, { width: contentWidth - (textX - ML) });
    y = doc.y;
  }

  const line2 = [
    [ds.address, ds.city, ds.state, ds.pincode].filter(Boolean).join(', '),
  ].filter(Boolean).join('');
  const line3 = [
    ds.phone && `Ph: ${ds.phone}`,
    ds.email,
    ds.website,
  ].filter(Boolean).join('  ·  ');

  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5);
  if (line2) { doc.text(line2, textX, doc.y + 1, { width: contentWidth - (textX - ML) }); }
  if (line3) { doc.text(line3, textX, doc.y + 1, { width: contentWidth - (textX - ML) }); }
  if (ds.gstin) { doc.text(`GSTIN: ${ds.gstin}`, textX, doc.y + 1); }

  const headerBottom = Math.max(doc.y, showLogo && logoBuf ? 110 : 0) + 8;
  doc.moveTo(ML, headerBottom).lineTo(ML + contentWidth, headerBottom).strokeColor(BRAND_BLUE).lineWidth(1.5).stroke();
  doc.lineWidth(1);
  return headerBottom + 14;
}

// Patient identity strip — returns next Y.
function drawPatientStrip(doc, patient, startY, extra = []) {
  const ML = doc.page.margins.left;
  const MR = doc.page.margins.right;
  const contentWidth = doc.page.width - ML - MR;

  const name = `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim() || '—';
  const a = age(patient?.dob);
  const meta = [
    patient?.patientId,
    patient?.gender,
    a != null ? `${a} yrs` : null,
    patient?.contact?.mobile,
  ].filter(Boolean).join('  ·  ');

  doc.rect(ML, startY, contentWidth, 44).fill('#f7fafc').strokeColor(BORDER_LIGHT).stroke();
  doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(12)
     .text(name, ML + 12, startY + 9, { width: contentWidth - 24 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
     .text(meta, ML + 12, startY + 27, { width: contentWidth - 200 });

  const rightLines = [`Date: ${fmtDate(Date.now())}`, ...extra].filter(Boolean);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
     .text(rightLines.join('\n'), ML + contentWidth - 200, startY + 9, { width: 188, align: 'right' });

  return startY + 58;
}

function sectionTitle(doc, title, y) {
  const ML = doc.page.margins.left;
  doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').fontSize(11).text(title, ML, y);
  return doc.y + 4;
}

// Doctor sign-off block (name, qualification, reg number) — right-aligned.
function drawDoctorSignOff(doc, doctor, ds) {
  const docName = doctor?.name;
  const qual    = doctor?.qualification;
  const reg     = doctor?.license_number;
  if (!docName && !reg) return;
  const rightX = doc.page.width - doc.page.margins.right - 200;
  const signY  = Math.min(doc.y + 40, doc.page.height - 110);
  doc.moveTo(rightX, signY).lineTo(rightX + 200, signY).strokeColor(BORDER_LIGHT).stroke();
  if (docName) doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(10).text(docName, rightX, signY + 4, { width: 200, align: 'center' });
  if (qual)    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(qual, rightX, doc.y, { width: 200, align: 'center' });
  if (reg)     doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(`Reg: ${reg}`, rightX, doc.y, { width: 200, align: 'center' });
}

function drawFooter(doc, ds, footerText) {
  const ML = doc.page.margins.left;
  const MR = doc.page.margins.right;
  const contentWidth = doc.page.width - ML - MR;
  const footerY = doc.page.height - 42;
  doc.moveTo(ML, footerY - 6).lineTo(ML + contentWidth, footerY - 6).strokeColor(BORDER_LIGHT).stroke();
  const parts = [footerText, ds.clinic_name, ds.phone, ds.email].filter(Boolean).join('  ·  ');
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(parts, ML, footerY, { width: contentWidth });
}

// ─── Dental tooth chart ─────────────────────────────────────────────────────────
// Draws a compact FDI chart (upper + lower rows) with treated teeth highlighted.
// Call at current doc.y; advances doc.y past the chart on return.
const TOOTH_CFGS = {
  Adult: {
    upper: [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],
    lower: [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38],
  },
  Pedo: {
    upper: [55,54,53,52,51,61,62,63,64,65],
    lower: [85,84,83,82,81,71,72,73,74,75],
  },
  Mixed: {
    upper: [16,55,54,53,12,11,21,22,63,64,65,26],
    lower: [46,85,84,83,42,41,31,32,73,74,75,36],
  },
};

// isToothId: numeric entry in teeth_numbers is a real tooth ID
const isToothId = n => n != null && !isNaN(Number(n)) && String(n).trim() !== '';

// toothStatuses: { [toothId]: string[] } — statuses accumulated per tooth from
// both treatments and per-tooth findings/diagnoses. Any tooth present here is
// highlighted; a tooth noted with only a finding/diagnosis (status 'Noted') is
// marked too, so the chart reflects everything clinically recorded on the visit.
function drawToothChart(doc, toothStatuses = {}, dentitionType = 'Adult') {
  const cfg = TOOTH_CFGS[dentitionType] || TOOTH_CFGS.Adult;
  if (!Object.keys(toothStatuses).length) return;

  const priorityClr = (statuses) => {
    if (!statuses?.length)                               return { bg: '#f1f5f9', border: '#cbd5e0', txt: '#718096' };
    if (statuses.includes('In Progress'))               return { bg: '#137fec', border: '#137fec', txt: '#ffffff' };
    if (statuses.some(s => s === 'Planned' || s === 'Recommended')) return { bg: '#f59e0b', border: '#f59e0b', txt: '#ffffff' };
    if (statuses.includes('Completed'))                 return { bg: '#16a34a', border: '#16a34a', txt: '#ffffff' };
    if (statuses.some(s => s === 'Missing' || s === 'DirectMissing')) return { bg: '#f1f5f9', border: '#94a3b8', txt: '#94a3b8' };
    if (statuses.includes('Noted'))                     return { bg: '#e0edff', border: '#137fec', txt: '#137fec' };
    return { bg: '#137fec', border: '#137fec', txt: '#ffffff' };
  };

  const TW = 20, TH = 14, TG = 2, ML = doc.page.margins.left;
  const HALF = Math.ceil(cfg.upper.length / 2);

  const drawRow = (teeth, yRow) => {
    teeth.forEach((id, i) => {
      const x = ML + i * (TW + TG) + (i >= HALF ? 5 : 0);
      const c = priorityClr(toothStatuses[id]);
      doc.save()
        .rect(x, yRow, TW, TH).fillColor(c.bg).fill()
        .rect(x, yRow, TW, TH).strokeColor(c.border).lineWidth(0.5).stroke()
        .restore();
      doc.fillColor(c.txt)
        .font(toothStatuses[id]?.length ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(6.5)
        .text(String(id), x, yRow + 4, { width: TW, align: 'center', lineBreak: false });
    });
  };

  const y0 = doc.y;
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text('Upper', ML, y0, { lineBreak: false });
  drawRow(cfg.upper, y0 + 9);
  const y1 = y0 + 9 + TH + 7;
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text('Lower', ML, y1 - 8, { lineBreak: false });
  drawRow(cfg.lower, y1);
  doc.y = y1 + TH + 10;
  doc.moveDown(0.2);
}

// ─── Document sections ──────────────────────────────────────────────────────────

function drawPrescription(doc, { visit, patient, doctor, ds }) {
  let y = drawClinicHeader(doc, ds, doc._logoBuf, { showLogo: ds.prescription_show_logo !== false });
  const a = visit?.chief_complaint ? [`Chief complaint: ${visit.chief_complaint}`] : [];
  y = drawPatientStrip(doc, patient, y, a);

  const ML  = doc.page.margins.left;
  const MR  = doc.page.margins.right;
  const PW  = doc.page.width;
  const CW  = PW - ML - MR;

  // ── Doctor identity strip (below patient strip) ─────────────────────────────
  if (doctor?.name) {
    const rightCols = [
      doctor.name,
      ds.prescription_show_qualification !== false ? doctor.qualification : null,
      ds.prescription_show_reg !== false && doctor.license_number ? `Reg. No: ${doctor.license_number}` : null,
    ].filter(Boolean);
    const stripY = y;
    doc.rect(ML, stripY, CW, 36).fill('#f0f7ff');
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(11)
       .text(rightCols[0], ML + 10, stripY + 7, { width: CW - 20, align: 'right' });
    if (rightCols.length > 1) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
         .text(rightCols.slice(1).join('  ·  '), ML + 10, doc.y + 1, { width: CW - 20, align: 'right' });
    }
    y = Math.max(doc.y, stripY + 36) + 10;
  }

  // ── Section heading ─────────────────────────────────────────────────────────
  doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(13).text('Prescription', ML, y);
  doc.moveTo(ML, doc.y + 2).lineTo(ML + CW, doc.y + 2).strokeColor(BORDER_LIGHT).lineWidth(0.8).stroke();
  doc.lineWidth(1);
  y = doc.y + 8;

  // ── Medications ─────────────────────────────────────────────────────────────
  const presc = visit?.prescriptions || [];
  if (presc.length) {
    presc.forEach((p, i) => {
      const numX    = ML;
      const drugX   = ML + 24;
      const drugW   = CW - 24;

      // Row number
      doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').fontSize(9)
         .text(`${i + 1}`, numX, y + 2, { width: 20, align: 'center' });

      // Drug name
      doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(11)
         .text(p.drug_name || '—', drugX, y, { width: drugW });
      const afterName = doc.y;

      // Detail chips: Dosage | Duration | Instructions
      const chips = [
        p.dosage      ? `Dosage: ${p.dosage}`      : null,
        p.duration    ? `Duration: ${p.duration}`  : null,
        p.instructions ? p.instructions            : null,
      ].filter(Boolean);

      if (chips.length) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(9)
           .text(chips.join('   ·   '), drugX, afterName + 1, { width: drugW });
      }

      y = doc.y + 7;
      doc.moveTo(drugX, y - 3).lineTo(ML + CW, y - 3).strokeColor(BORDER_LIGHT).lineWidth(0.3).stroke();
      doc.lineWidth(1);
    });
    y += 4;
  } else {
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(10).text('No medications prescribed.', ML, y);
    y = doc.y + 8;
  }

  // ── Advice ──────────────────────────────────────────────────────────────────
  const advices = visit?.advices || [];
  if (advices.length && ds.prescription_show_advice !== false) {
    doc.moveDown(0.5);
    y = sectionTitle(doc, 'Advice', doc.y);
    advices.forEach(av => {
      doc.fillColor(BODY_TEXT).font('Helvetica').fontSize(10).text(htmlToText(av.content), { width: CW });
      doc.moveDown(0.3);
    });
  }

  // ── Signature & Stamp box (bottom-right) ────────────────────────────────────
  const stampH  = 90;
  const stampW  = 210;
  const stampX  = PW - MR - stampW;
  const stampY  = Math.min(doc.y + 30, PW - 160);   // A4 is tall; keep within page

  doc.rect(stampX, stampY, stampW, stampH)
     .dash(4, { space: 3 }).strokeColor(BORDER_LIGHT).lineWidth(0.8).stroke();
  doc.undash().lineWidth(1);

  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
     .text('Signature & Stamp', stampX, stampY + stampH - 13, { width: stampW, align: 'center' });

  // Doctor details below stamp box
  let infoY = stampY + stampH + 5;
  if (doctor?.name) {
    doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(10)
       .text(doctor.name, stampX, infoY, { width: stampW, align: 'center' });
    infoY = doc.y;
  }
  if (doctor?.qualification && ds.prescription_show_qualification !== false) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
       .text(doctor.qualification, stampX, infoY, { width: stampW, align: 'center' });
    infoY = doc.y;
  }
  if (doctor?.license_number && ds.prescription_show_reg !== false) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
       .text(`Reg. No: ${doctor.license_number}`, stampX, infoY, { width: stampW, align: 'center' });
  }

  if (ds.prescription_show_footer !== false) drawFooter(doc, ds, ds.prescription_footer_text);
}

// Visit Summary = patient take-home (treatments done + advice)
// No clinical examination data, no prescription duplicate.
function drawSmartReport(doc, { visit, patient, doctor, ds }) {
  let y = drawClinicHeader(doc, ds, doc._logoBuf, { showLogo: ds.smart_show_logo !== false });
  y = drawPatientStrip(doc, patient, y, doctor?.name ? [`Doctor: ${doctor.name}`] : []);

  doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(13).text('Visit Summary', doc.page.margins.left, y);
  doc.moveDown(0.4);

  // ── Patient History section ────────────────────────────────────────────────
  const conditions = (patient?.medical_history || []).filter(Boolean);
  const allergies  = (patient?.allergies       || []).filter(Boolean);
  const dentalHx   = (patient?.dental_history  || '').trim();
  const habits = [
    patient?.tobacco_smoking    ? 'Tobacco (Smoking)'    : null,
    patient?.tobacco_smokeless  ? 'Tobacco (Smokeless)'  : null,
    patient?.tea_consumption    ? `Tea: ${patient.tea_consumption}`     : null,
    patient?.coffee_consumption ? `Coffee: ${patient.coffee_consumption}` : null,
  ].filter(Boolean);

  if (conditions.length || allergies.length || dentalHx || habits.length) {
    sectionTitle(doc, 'Patient History', doc.y);
    const printRow = (label, val) => {
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text(label.toUpperCase());
      doc.fillColor(BODY_TEXT).font('Helvetica').fontSize(10).text(val, { width: 495 });
      doc.moveDown(0.3);
    };
    if (conditions.length) printRow('Medical History', conditions.join('  ·  '));
    if (allergies.length)  printRow('Allergies',       allergies.join('  ·  '));
    if (dentalHx)          printRow('Dental History',  dentalHx);
    if (habits.length)     printRow('Lifestyle Habits', habits.join('  ·  '));
    doc.moveDown(0.2);
  }

  // ── Examination, Diagnosis & Treatment (unified per-target model) ───────────
  // Every clinically-noted target (tooth / soft-tissue / TMJ) becomes one row
  // carrying its findings, diagnoses and treatments together. The same model
  // feeds the FDI chart so a tooth noted with only a finding is still marked.
  const findings = visit?.findings || {};
  const toothFindings  = (findings.tooth_findings  || []).filter(x => x?.name);
  const toothDiagnoses = (findings.tooth_diagnoses || []).filter(x => x?.name);
  const treatments     = visit?.treatments || [];

  const byTarget = {};
  const targetOf = (tt) => (byTarget[String(tt)] ||= { findings: new Set(), diagnoses: new Set(), treatments: [] });
  const addNamed = (arr, key) => arr.forEach(e => (e.teeth_numbers || []).forEach(tt => targetOf(tt)[key].add(e.name)));
  addNamed(toothFindings,  'findings');
  addNamed(toothDiagnoses, 'diagnoses');
  treatments.forEach(t => {
    const status = (t.treatment_name === 'Missing' || t.treatment_name === 'Extraction' || t.status === 'DirectMissing')
      ? 'Missing' : t.status;
    (t.teeth_numbers || []).forEach(tt => targetOf(tt).treatments.push({ name: t.treatment_name, status }));
  });

  const targetKeys = Object.keys(byTarget).sort((a, b) => {
    const na = isToothId(a), nb = isToothId(b);
    if (na && nb) return Number(a) - Number(b);
    if (na) return -1; if (nb) return 1;
    return a.localeCompare(b);
  });

  if (targetKeys.length) {
    // Feed all noted teeth into the chart. Findings/diagnosis-only teeth get
    // the 'Noted' status so they still light up.
    const toothStatuses = {};
    targetKeys.filter(isToothId).forEach(tt => {
      const g = byTarget[tt];
      const statuses = g.treatments.map(x => x.status).filter(Boolean);
      if (!statuses.length && (g.findings.size || g.diagnoses.size)) statuses.push('Noted');
      if (statuses.length) toothStatuses[Number(tt)] = [...new Set(statuses)];
    });
    drawToothChart(doc, toothStatuses, visit?.dentition_type || patient?.dentition_type);

    sectionTitle(doc, 'Examination, Diagnosis & Treatment', doc.y);

    // ── Table: Tooth | Findings | Diagnosis | Treatment ───────────────────────
    const ML = doc.page.margins.left;
    const CW = doc.page.width - ML - doc.page.margins.right;
    const COLS = [
      { key: 'label',   title: 'Site',      w: Math.round(CW * 0.14) },
      { key: 'find',    title: 'Findings',  w: Math.round(CW * 0.26) },
      { key: 'dx',      title: 'Diagnosis', w: Math.round(CW * 0.26) },
      { key: 'tx',      title: 'Treatment', w: 0 },
    ];
    COLS[3].w = CW - COLS[0].w - COLS[1].w - COLS[2].w;
    const PAD = 5;

    const drawRow = (cells, { header = false } = {}) => {
      const font = header ? 'Helvetica-Bold' : 'Helvetica';
      const size = header ? 8.5 : 9;
      doc.font(font).fontSize(size);
      // Measure tallest cell for row height.
      let x = ML, h = 0;
      COLS.forEach((c, i) => { h = Math.max(h, doc.heightOfString(cells[i] || '', { width: c.w - PAD * 2 })); });
      h += PAD * 2;
      if (doc.y + h > doc.page.height - doc.page.margins.bottom) { doc.addPage(); }
      const y = doc.y;
      if (header) doc.save().rect(ML, y, CW, h).fill('#f0f7ff').restore();
      x = ML;
      COLS.forEach((c, i) => {
        doc.fillColor(header ? BRAND_DARK : BODY_TEXT).font(font).fontSize(size)
           .text(cells[i] || '', x + PAD, y + PAD, { width: c.w - PAD * 2 });
        x += c.w;
      });
      // Cell borders.
      doc.save().strokeColor(BORDER_LIGHT).lineWidth(0.5);
      doc.rect(ML, y, CW, h).stroke();
      let bx = ML;
      COLS.slice(0, -1).forEach(c => { bx += c.w; doc.moveTo(bx, y).lineTo(bx, y + h).stroke(); });
      doc.restore();
      doc.y = y + h;
    };

    drawRow(COLS.map(c => c.title), { header: true });
    targetKeys.forEach(tt => {
      const g = byTarget[tt];
      const label = isToothId(tt) ? `Tooth ${tt}` : tt;
      const find  = [...g.findings].join(', ') || '—';
      const dx    = [...g.diagnoses].join(', ') || '—';
      const tx    = g.treatments.length
        ? g.treatments.map(t => `${t.name}${t.status ? ` (${t.status})` : ''}`).join('; ')
        : '—';
      drawRow([label, find, dx, tx]);
    });
    doc.moveDown(0.4);
  } else {
    // Legacy flat (no per-tooth) findings/diagnosis.
    const clinicalFindings = (findings.clinical_findings || []).filter(Boolean);
    const diagnosis = (findings.diagnosis_notes || '').trim();
    if (clinicalFindings.length || diagnosis) {
      sectionTitle(doc, 'Examination & Diagnosis', doc.y);
      if (clinicalFindings.length) {
        doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('CLINICAL FINDINGS');
        doc.fillColor(BODY_TEXT).font('Helvetica').fontSize(10).text(clinicalFindings.join('  ·  '), { width: 495 });
        doc.moveDown(0.3);
      }
      if (diagnosis) {
        doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('DIAGNOSIS');
        doc.fillColor(BODY_TEXT).font('Helvetica').fontSize(10).text(diagnosis, { width: 495 });
        doc.moveDown(0.3);
      }
      doc.moveDown(0.2);
    }
  }

  const advices    = visit?.advices || [];
  const postcare   = ds.postcare_template || '';
  const hasAdvice  = advices.length || postcare.trim();
  if (hasAdvice) {
    sectionTitle(doc, 'Advice & Post-Care', doc.y);
    advices.forEach(a => {
      doc.fillColor(BODY_TEXT).font('Helvetica').fontSize(10).text(htmlToText(a.content), { width: 495 });
      doc.moveDown(0.3);
    });
    if (postcare.trim()) {
      postcare.split('\n').filter(l => l.trim()).forEach(line => {
        doc.fillColor(BODY_TEXT).font('Helvetica').fontSize(10).text(line.trim(), { width: 495 });
        doc.moveDown(0.15);
      });
    }
    doc.moveDown(0.2);
  }

  drawDoctorSignOff(doc, doctor, ds);
  if (ds.smart_show_footer !== false) drawFooter(doc, ds, ds.report_footer_text);
}

function drawInvoice(doc, { invoice, patient, doctor, ds }) {
  let y = drawClinicHeader(doc, ds, doc._logoBuf, { showLogo: ds.invoice_show_logo !== false });
  const cur = ds.currency_symbol || '₹';

  doc.fillColor(BRAND_DARK).font('Helvetica-Bold').fontSize(15).text('INVOICE', doc.page.margins.left, y);
  y = drawPatientStrip(doc, patient, doc.y + 4, [
    `Invoice #: ${invoice.invoice_id || '—'}`,
  ]);

  const ML = doc.page.margins.left;
  const col = { item: ML, qty: ML + 280, rate: ML + 340, total: ML + 420 };
  const rowW = doc.page.width - ML - doc.page.margins.right;

  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9);
  doc.text('ITEM', col.item, y, { width: 270 });
  doc.text('QTY', col.qty, y, { width: 50, align: 'right' });
  doc.text('RATE', col.rate, y, { width: 70, align: 'right' });
  doc.text('TOTAL', col.total, y, { width: 75, align: 'right' });
  y = doc.y + 4;
  doc.moveTo(ML, y).lineTo(ML + rowW, y).strokeColor(BORDER_LIGHT).stroke();
  y += 6;

  doc.font('Helvetica').fontSize(10).fillColor(BODY_TEXT);
  (invoice.items || []).forEach(it => {
    doc.text(it.name, col.item, y, { width: 270 });
    const rowH = doc.y - y;
    doc.text(String(it.quantity), col.qty, y, { width: 50, align: 'right' });
    doc.text(`${cur}${it.rate}`, col.rate, y, { width: 70, align: 'right' });
    doc.text(`${cur}${it.total}`, col.total, y, { width: 75, align: 'right' });
    y += Math.max(rowH, 16);
  });

  doc.moveTo(ML, y).lineTo(ML + rowW, y).strokeColor(BORDER_LIGHT).stroke();
  y += 8;

  const totalsX = col.rate - 40;
  const drawTotal = (label, val, bold, color) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor(color || BODY_TEXT);
    doc.text(label, totalsX, y, { width: 110, align: 'right' });
    doc.text(`${cur}${val}`, col.total, y, { width: 75, align: 'right' });
    y = doc.y + 3;
  };
  if (invoice.subtotal != null && invoice.subtotal !== invoice.total_amount)
    drawTotal('Subtotal', invoice.subtotal, false);
  if (ds.invoice_show_gst !== false && invoice.tax) drawTotal(ds.gstin ? 'GST' : 'Tax', invoice.tax, false);
  drawTotal('Total', invoice.total_amount, true, BRAND_DARK);

  // Payment info / QR
  if (ds.invoice_show_payment !== false && (ds.payment_modes || []).length) {
    y += 14;
    sectionTitle(doc, 'Payment Options', y);
    y = doc.y + 2;
    let qrX = ML;
    for (const pm of ds.payment_modes) {
      doc.fillColor(BODY_TEXT).font('Helvetica-Bold').fontSize(9.5).text(pm.label, qrX, y);
      const isBank = (pm.type || 'upi') === 'bank';
      if (isBank) {
        const lines = [
          pm.beneficiary && `Beneficiary: ${pm.beneficiary}`,
          pm.details     && `A/C No: ${pm.details}`,
          pm.bank_name   && `Bank: ${pm.bank_name}`,
          pm.branch      && `Branch: ${pm.branch}`,
          pm.ifsc        && `IFSC: ${pm.ifsc}`,
        ].filter(Boolean);
        for (const line of lines) {
          doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(line, qrX, doc.y, { width: 145 });
        }
      } else {
        if (pm.details) doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(pm.details, qrX, doc.y);
        const buf = doc._qrBufs?.[pm.qr_url];
        if (buf) { try { doc.image(buf, qrX, doc.y + 2, { fit: [80, 80] }); } catch { /* ignore */ } }
      }
      qrX += 150;
    }
  }

  if (doctor?.name || doctor?.license_number) drawDoctorSignOff(doc, doctor, ds);
  if (ds.invoice_show_footer !== false) drawFooter(doc, ds, ds.invoice_footer_text);
}

function drawAiReport(doc, { reportText, templateName, patient, doctor, ds }) {
  let y = drawClinicHeader(doc, ds, doc._logoBuf, { showLogo: ds.report_show_logo !== false });
  if (ds.report_show_patient !== false) {
    y = drawPatientStrip(doc, patient, y, [
      templateName ? `Report: ${templateName}` : null,
      doctor?.name ? `Doctor: ${doctor.name}` : null,
    ]);
  }
  if (ds.report_show_header !== false && ds.report_header_text) {
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text(ds.report_header_text, doc.page.margins.left, y, { width: 495 });
    y = doc.y + 6;
  }
  sectionTitle(doc, templateName || 'Clinical Report', y);
  doc.fillColor(BODY_TEXT).font('Helvetica').fontSize(10)
     .text(htmlToText(reportText), { width: 495, lineGap: 3, paragraphGap: 6 });
  drawDoctorSignOff(doc, doctor, ds);
  if (ds.report_show_footer !== false) drawFooter(doc, ds, ds.report_footer_text);
}

// ─── Public: build a combined multi-document PDF from DB ids ─────────────────────
/**
 * @param tenantModels  req.tenantModels
 * @param opts {
 *   visitId, patientId, invoiceId, reportJobId, reportTemplateId,
 *   include: string[]  // any of: 'prescription','smartReport','invoice','report'
 * }
 * Returns a Buffer.
 */
export async function buildVisitDocumentPdfFromIds(tenantModels, opts, tenantConfig = null) {
  const { Visit, Patient, Invoice, Doctor, DocumentSettings, ReportJob } = tenantModels;
  const include = (opts.include || []).filter(Boolean);
  if (!include.length) throw new Error('No document types selected');

  const ds = await loadDocumentBranding(tenantModels);

  const visit = opts.visitId
    ? await Visit.findById(opts.visitId).lean()
    : null;
  const patient = opts.patientId
    ? await Patient.findById(opts.patientId).lean()
    : (visit?.patient_id ? await Patient.findById(visit.patient_id).lean() : null);

  let doctor = null;
  if (visit?.doctor_id && Doctor) {
    doctor = await Doctor.findById(visit.doctor_id).lean().catch(() => null);
  }

  const invoice = opts.invoiceId ? await Invoice.findById(opts.invoiceId).lean() : null;

  let reportText = '', reportTemplateName = '';
  if (include.includes('report') && opts.reportJobId && ReportJob) {
    const job = await ReportJob.findById(opts.reportJobId).lean().catch(() => null);
    if (job) {
      reportText = job.reportText || '';
      reportTemplateName = job.templateName || '';   // optional label
    }
  }

  return renderDocsToBuffer(ds, { include, visit, patient, doctor, invoice, reportText, reportTemplateName }, tenantConfig);
}

// ─── Shared core renderer ───────────────────────────────────────────────────────
// Prefetches branding images and assembles the selected document sections.
async function renderDocsToBuffer(ds, { include, visit, patient, doctor, invoice, reportText, reportTemplateName }, tenantConfig = null) {
  const wantLogo = ds.invoice_show_logo !== false || ds.prescription_show_logo !== false
    || ds.report_show_logo !== false || ds.smart_show_logo !== false;
  const logoBuf = wantLogo ? await fetchImageBuffer(ds.clinic_logo_url) : null;

  const qrBufs = {};
  if (include.includes('invoice') && ds.invoice_show_payment !== false) {
    for (const pm of (ds.payment_modes || [])) {
      if (pm.qr_url) qrBufs[pm.qr_url] = await fetchImageBuffer(pm.qr_url);
    }
  }


  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc._logoBuf = logoBuf;
    doc._qrBufs = qrBufs;

    let first = true;
    const page = (fn) => {
      if (!first) doc.addPage();
      first = false;
      fn();
    };

    if (include.includes('prescription')) page(() => drawPrescription(doc, { visit, patient, doctor, ds }));
    if (include.includes('smartReport')) page(() => drawSmartReport(doc, { visit, patient, doctor, ds }));
    if (include.includes('invoice') && invoice) page(() => drawInvoice(doc, { invoice, patient, doctor, ds }));
    if (include.includes('report') && reportText) page(() => drawAiReport(doc, { reportText, templateName: reportTemplateName, patient, doctor, ds }));

    if (first) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(12).text('No document content available for the selection.', 50, 80);
    }

    doc.end();
  });
}

// ─── Single source of branding ──────────────────────────────────────────────────
// Every document path in the app resolves branding through this one function.
// Returns the tenant's DocumentSettings, seeding from legacy Invoice/Prescription
// settings the first time (before the user has saved the new Branding page).
export async function loadDocumentBranding(tenantModels) {
  const { DocumentSettings, InvoiceSettings, PrescriptionSettings } = tenantModels;
  const ds = await DocumentSettings.findOne({}).lean();
  if (ds) return ds;

  const [inv, pr] = await Promise.all([
    InvoiceSettings ? InvoiceSettings.findOne({}).lean() : null,
    PrescriptionSettings ? PrescriptionSettings.findOne({}).lean() : null,
  ]);
  const i = inv?.clinic || {}, p = pr?.clinic || {};
  return {
    clinic_name:     i.name || p.name || '',
    tagline:         p.tagline || '',
    address:         (i.addressLines || p.addressLines || []).join(', '),
    phone:           i.phone || p.phone || '',
    email:           i.email || p.email || '',
    clinic_logo_url: i.logoUrl || p.logoUrl || '',
    currency_symbol: inv?.currencySymbol || '₹',
    gstin:           i.gstNumber || '',
    invoice_footer_text:      inv?.footerText || '',
    prescription_footer_text: pr?.footerText || '',
  };
}

// ─── Single-document PDF for legacy callers passing already-fetched objects ──────
// type: 'smartReport' | 'prescription' | 'invoice' | 'report'
export async function buildSingleDocPdf(tenantModels, { type, visit, patient, doctor, doctorName, invoice, reportText, reportTemplateName }) {
  const ds = await loadDocumentBranding(tenantModels);
  if (!doctor && doctorName) doctor = { name: doctorName };
  return renderDocsToBuffer(ds, { include: [type], visit, patient, doctor, invoice, reportText, reportTemplateName });
}
