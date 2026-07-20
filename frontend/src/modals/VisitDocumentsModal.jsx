import { useState, useEffect } from 'react';
import { X, Printer, Download, Share2, Mail, FileText, Loader2 } from 'lucide-react';
import api from '../services/api';

// ─── HTML render helpers (client-side print engine) ─────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const cur = (ds) => ds.currency_symbol || '₹';

// A file belongs to a visit ONLY when both carry the same appointment_id —
// appointment_id is the single source of truth for linking documents to an
// appointment. visit_id is no longer used for matching (only ever kept as an
// internal data anchor). Guards against the String(undefined)==='undefined' trap
// that would match appointment-less files whenever the modal's visit is null.
const idOf = (x) => (x == null ? null : String(typeof x === 'object' ? (x._id || x) : x));
const fileBelongsToVisit = (pf, visit) => {
  if (!pf || !visit) return false;
  const fAppt = idOf(pf.appointment_id);
  const vAppt = idOf(visit.appointment_id);
  return !!(fAppt && vAppt && fAppt === vAppt);
};

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  return Math.abs(new Date(Date.now() - d.getTime()).getUTCFullYear() - 1970);
}

function clinicHeaderHtml(ds, showLogo) {
  const logo = showLogo && ds.clinic_logo_url
    ? `<img src="${esc(ds.clinic_logo_url)}" style="height:64px;width:auto;object-fit:contain" crossorigin="anonymous"/>`
    : '';
  const addr = [ds.address, ds.city, ds.state, ds.pincode].filter(Boolean).join(', ');
  const contact = [ds.phone && `Ph: ${ds.phone}`, ds.email, ds.website].filter(Boolean).join(' · ');
  return `
  <div style="display:flex;gap:16px;align-items:flex-start;border-bottom:2px solid #137fec;padding-bottom:12px;margin-bottom:16px">
    ${logo}
    <div style="flex:1">
      <div style="font-size:20px;font-weight:800;color:#0d1b2a">${esc(ds.clinic_name || 'Dental Clinic')}</div>
      ${ds.tagline ? `<div style="font-size:11px;color:#718096;font-style:italic">${esc(ds.tagline)}</div>` : ''}
      ${addr ? `<div style="font-size:10px;color:#718096;margin-top:2px">${esc(addr)}</div>` : ''}
      ${contact ? `<div style="font-size:10px;color:#718096">${esc(contact)}</div>` : ''}
      ${ds.gstin ? `<div style="font-size:10px;color:#718096">GSTIN: ${esc(ds.gstin)}</div>` : ''}
    </div>
  </div>`;
}

function patientStripHtml(patient, extraRight = []) {
  const name = `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim() || '—';
  const a = ageFromDob(patient?.dob);
  const meta = [patient?.patientId, patient?.gender, a != null ? `${a} yrs` : null, patient?.contact?.mobile].filter(Boolean).join(' · ');
  const right = [`Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, ...extraRight].filter(Boolean);
  return `
  <div style="display:flex;justify-content:space-between;background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:14px">
    <div>
      <div style="font-size:14px;font-weight:700;color:#0d1b2a">${esc(name)}</div>
      <div style="font-size:10px;color:#718096;margin-top:2px">${esc(meta)}</div>
    </div>
    <div style="font-size:10px;color:#718096;text-align:right">${right.map(esc).join('<br/>')}</div>
  </div>`;
}

const sectionTitle = (t) => `<div style="font-size:12px;font-weight:700;color:#137fec;margin:14px 0 6px">${esc(t)}</div>`;

// ── Section icons ────────────────────────────────────────────────────────────
// Inline SVG (not emoji) so icons render consistently in the server-side
// Puppeteer/Chromium PDF pipeline, which has no guaranteed color-emoji font.
const CARD_ICONS = {
  clipboard: '<path d="M9 2a1 1 0 0 0-1 1v1H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V3a1 1 0 0 0-1-1H9Zm1 2h4v2h-4V4ZM6 8h12v12H6V8Zm2 3h8v1.5H8V11Zm0 3h8v1.5H8V14Zm0 3h5v1.5H8V17Z"/>',
  scope: '<path d="M11 2a7 7 0 0 0-5.6 11.2L2 17.6 4.4 20l4.4-3.4A7 7 0 1 0 11 2Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>',
  tooth: '<path d="M12 2c-1.5 0-2.6.7-3.5 1.4C7.7 2.7 6.6 2 5 2 3 2 2 3.6 2 6c0 2.1.9 3.7 1.6 5.3.6 1.4 1.1 2.7 1.2 4.4.1 1.7.4 4.3 2.2 4.3 1.4 0 1.7-1.7 2-3.2.2-1.2.5-2.5 1-2.5s.8 1.3 1 2.5c.3 1.5.6 3.2 2 3.2 1.8 0 2.1-2.6 2.2-4.3.1-1.7.6-3 1.2-4.4.7-1.6 1.6-3.2 1.6-5.3 0-2.4-1-4-3-4-1.6 0-2.7.7-3.5 1.4C14.6 2.7 13.5 2 12 2Z"/>',
  note: '<path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-6-6H5Zm0 2h9v5h5v11H5V5Zm2 8h10v1.5H7V13Zm0 3h10v1.5H7V16Zm0 3h6v1.5H7V19Z"/>',
  bulb: '<path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2Zm-2 17h4v1H10v-1Zm.5 2h3v1h-3v-1Z"/>',
  image: '<path d="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4Zm0 2h16v12H4V6Zm3 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 18l4.5-5 3 3.2 3-4L19 18H5Z"/>',
};
function iconSvg(name, color) {
  const path = CARD_ICONS[name];
  if (!path) return '';
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">${path}</svg>`;
}

// ── Patient-facing "card" helpers ────────────────────────────────────────────
// A rounded, soft-shadowed container with an accent header bar + icon.
function card({ title, accent = '#137fec', icon = '', body, tint = '#ffffff' }) {
  return `
  <div style="border:1px solid #e8eef5;border-radius:14px;background:${tint};overflow:hidden;margin-bottom:16px;box-shadow:0 1px 3px rgba(16,42,67,0.06)">
    <div style="display:flex;align-items:center;gap:8px;padding:9px 16px;background:${accent}12;border-bottom:1px solid ${accent}22">
      ${icon ? `<span style="display:inline-flex;line-height:1">${iconSvg(icon, accent)}</span>` : ''}
      <span style="font-size:11px;font-weight:800;color:${accent};text-transform:uppercase;letter-spacing:0.06em">${esc(title)}</span>
    </div>
    <div style="padding:14px 16px">${body}</div>
  </div>`;
}

// A big centered document title with a subtitle line and accent underline.
function docHeroTitle(title, subtitle = '') {
  return `
  <div style="text-align:center;margin:6px 0 18px">
    <div style="font-size:22px;font-weight:800;color:#0d1b2a;letter-spacing:-0.01em">${esc(title)}</div>
    ${subtitle ? `<div style="font-size:11px;color:#94a3b8;margin-top:3px">${esc(subtitle)}</div>` : ''}
    <div style="width:54px;height:3px;background:#137fec;border-radius:99px;margin:9px auto 0"></div>
  </div>`;
}

// ─── CDN constants (same URLs as TreatmentTabs.jsx) ──────────────────────────
const CDN_TEETH = 'https://dentobesscdn.b-cdn.net/dental-teeth';
const CDN_SOFT  = 'https://dentobesscdn.b-cdn.net/soft-tissues';
const CDN_TMJ   = 'https://dentobesscdn.b-cdn.net/TMJ';

const PEDO_MAP = { 55:15,54:15,64:15,65:15,51:52,61:52,62:52,63:53,75:85,74:85,84:85,73:43,83:43,72:42,71:42,81:42,82:42 };

const SOFT_TISSUES = [
  { label: 'Buccal Mucosa',     img: 'Buccal Mucosa.svg' },
  { label: 'Floor of the Mouth',img: 'Floor of the mouth.svg' },
  { label: 'Frenum',            img: 'Frenum.svg' },
  { label: 'Gingiva',           img: 'Gingiva.svg' },
  { label: 'Labial Mucosa',     img: 'Labial mucosa.svg' },
  { label: 'Palate',            img: 'Palate.svg' },
  { label: 'Salivary Glands',   img: 'Salivary glands.svg' },
  { label: 'Tongue',            img: 'Tongue.svg' },
];
const TMJ_OPTIONS = [
  { label: 'Left TMJ',  img: 'Left TMJ.svg' },
  { label: 'Right TMJ', img: 'Right TMJ.svg' },
  { label: 'Both TMJ',  img: 'Both TMJ.svg' },
];
const SOFT_TISSUE_SET = new Set(SOFT_TISSUES.map(t => t.label));
const TMJ_SET         = new Set(TMJ_OPTIONS.map(t => t.label));

// A teeth_numbers entry is a tooth ID if it parses as a number
const isToothId = n => n != null && !isNaN(Number(n)) && String(n).trim() !== '';

// Given a list of statuses, return the one to display (In Progress > Planned > Completed > Missing)
function priorityStatus(statuses = []) {
  if (statuses.some(s => s === 'In Progress'))                     return 'In Progress';
  if (statuses.some(s => s === 'Planned' || s === 'Recommended'))  return 'Planned';
  if (statuses.some(s => s === 'Completed'))                       return 'Completed';
  if (statuses.some(s => s === 'Missing' || s === 'DirectMissing')) return 'Missing';
  return statuses[0] || null;
}

function toothImgSrc(dentitionType, toothId) {
  let folder = dentitionType === 'Mixed' ? (toothId >= 50 ? 'Pedo' : 'Adult') : (dentitionType || 'Adult');
  let fileId  = toothId;
  if (folder === 'Pedo' && PEDO_MAP[toothId]) fileId = PEDO_MAP[toothId];
  return `${CDN_TEETH}/${folder}/Teeth${fileId}.svg`;
}

// Dental chart — Adult / Pedo / Mixed, multi-treatment-per-tooth support.
// findingsTeeth (Set of tooth-id strings) = teeth selected on the dental chart via
// the Examination tab (findings/diagnoses) that carry no treatment. They are still
// highlighted on the chart so the pictorial always reflects EVERY selected tooth of
// the appointment — not only the ones with a treatment.
function dentalChartHtml(treatments = [], dentitionType = 'Adult', findingsTeeth = new Set()) {
  const cfgs = {
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
  const cfg = cfgs[dentitionType] || cfgs.Adult;

  // Accumulate ALL statuses per tooth (multiple treatments may target the same tooth)
  const toothStatuses = {};
  treatments.forEach(t => (t.teeth_numbers || []).filter(isToothId).forEach(n => {
    const id = Number(n);
    if (!toothStatuses[id]) toothStatuses[id] = [];
    const s = (t.treatment_name === 'Missing' || t.treatment_name === 'Extraction' || t.status === 'DirectMissing')
      ? 'Missing' : t.status;
    if (!toothStatuses[id].includes(s)) toothStatuses[id].push(s);
  }));
  // Nothing to draw only when there are neither treatment teeth NOR findings teeth.
  if (!Object.keys(toothStatuses).length && !findingsTeeth.size) return '';

  const EXAM_ACCENT = '#0891b2', EXAM_BG = '#ecfeff';
  const toothStyle = (id) => {
    const statuses = toothStatuses[id] || [];
    const p = priorityStatus(statuses);
    // A findings-only tooth (selected on the chart, no treatment) → exam accent.
    if (!p && findingsTeeth.has(String(id)))
      return { border: EXAM_ACCENT, bg: EXAM_BG, textColor: EXAM_ACCENT, opacity: 1, dot: null };
    if (!p) return { border: 'transparent', bg: 'transparent', textColor: '#94a3b8', opacity: 1, dot: null };
    if (p === 'In Progress')  return { border: '#137fec', bg: '#eff6ff', textColor: '#137fec', opacity: 1, dot: '#137fec' };
    if (p === 'Planned')      return { border: '#f59e0b', bg: '#fffbeb', textColor: '#b45309', opacity: 1, dot: '#f59e0b' };
    if (p === 'Completed')    return { border: '#16a34a', bg: '#f0fdf4', textColor: '#16a34a', opacity: 1, dot: '#16a34a' };
    if (p === 'Missing')      return { border: '#cbd5e0', bg: 'transparent', textColor: '#94a3b8', opacity: 0.3, dot: null };
    return { border: '#137fec', bg: '#eff6ff', textColor: '#137fec', opacity: 1, dot: '#137fec' };
  };

  const multiDot = (id) => {
    const statuses = toothStatuses[id] || [];
    if (statuses.length <= 1) return '';
    // Small dots for secondary statuses
    const dots = statuses.slice(1).map(s => {
      const c = s === 'Completed' ? '#16a34a' : s === 'In Progress' ? '#137fec' : s === 'Planned' ? '#f59e0b' : '#cbd5e0';
      return `<span style="display:inline-block;width:4px;height:4px;border-radius:50%;background:${c}"></span>`;
    }).join('');
    return `<div style="display:flex;gap:1px;justify-content:center;margin-top:1px">${dots}</div>`;
  };

  const toothCell = (id) => {
    const st = toothStyle(id);
    const treated = !!toothStatuses[id]?.length || findingsTeeth.has(String(id));
    return `<div style="display:flex;flex-direction:column;align-items:center;width:26px">
      <div style="border-radius:5px;border:2px solid ${st.border};background:${st.bg};padding:1px;box-sizing:border-box;position:relative">
        <img src="${toothImgSrc(dentitionType, id)}" alt="${id}" width="20"
             style="display:block;width:20px;height:auto;opacity:${st.opacity}" crossorigin="anonymous"/>
      </div>
      <span style="font-size:7px;font-weight:${treated ? '700' : '400'};color:${st.textColor};margin-top:2px;line-height:1">${id}</span>
      ${multiDot(id)}
    </div>`;
  };

  const row = (teeth) =>
    `<div style="display:flex;justify-content:center;gap:2px">${teeth.map(toothCell).join('')}</div>`;

  const legend = [
    { color: '#137fec', bg: '#eff6ff', label: 'In Progress' },
    { color: '#f59e0b', bg: '#fffbeb', label: 'Planned' },
    { color: '#16a34a', bg: '#f0fdf4', label: 'Completed' },
    { color: '#cbd5e0', bg: 'transparent', label: 'Missing', opacity: 0.5 },
  ].map(l =>
    `<span style="display:inline-flex;align-items:center;gap:4px;font-size:8px;color:#718096">
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${l.bg};border:2px solid ${l.color};opacity:${l.opacity || 1}"></span>${l.label}
    </span>`
  ).join('');

  return `<div style="margin:8px 0;overflow-x:auto">
    <div style="text-align:center;font-size:8px;color:#94a3b8;letter-spacing:0.06em;margin-bottom:4px">UPPER</div>
    ${row(cfg.upper)}
    <div style="border-top:1px dashed #e2e8f0;margin:6px 0"></div>
    ${row(cfg.lower)}
    <div style="text-align:center;font-size:8px;color:#94a3b8;letter-spacing:0.06em;margin-top:4px">LOWER</div>
    <div style="display:flex;justify-content:center;gap:14px;margin-top:8px">${legend}</div>
  </div>`;
}

// Soft tissue image grid — items is array of labels, statusMap is label → [statuses]
function softTissueGridHtml(items = [], statusMap = {}) {
  const matched = SOFT_TISSUES.filter(d => items.includes(d.label));
  if (!matched.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
    ${matched.map(d => {
      const statuses = statusMap[d.label] || ['Planned'];
      const p = priorityStatus(statuses);
      const border = p === 'In Progress' ? '#137fec' : p === 'Completed' ? '#16a34a' : '#f59e0b';
      const bg     = p === 'In Progress' ? '#eff6ff' : p === 'Completed' ? '#f0fdf4' : '#fffbeb';
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:76px">
        <div style="border-radius:10px;border:2px solid ${border};background:${bg};padding:8px;width:76px;height:76px;box-sizing:border-box;display:flex;align-items:center;justify-content:center">
          <img src="${CDN_SOFT}/${d.img}" alt="${esc(d.label)}" style="max-width:100%;max-height:100%;object-fit:contain" crossorigin="anonymous"/>
        </div>
        <span style="font-size:8px;color:#4a5568;text-align:center;font-weight:500;line-height:1.2">${esc(d.label)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// TMJ image grid — same pattern
function tmjGridHtml(items = [], statusMap = {}) {
  const matched = TMJ_OPTIONS.filter(d => items.includes(d.label));
  if (!matched.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">
    ${matched.map(d => {
      const statuses = statusMap[d.label] || ['Planned'];
      const p = priorityStatus(statuses);
      const border = p === 'In Progress' ? '#137fec' : p === 'Completed' ? '#16a34a' : '#f59e0b';
      const bg     = p === 'In Progress' ? '#eff6ff' : p === 'Completed' ? '#f0fdf4' : '#fffbeb';
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:96px">
        <div style="border-radius:10px;border:2px solid ${border};background:${bg};padding:8px;width:96px;height:96px;box-sizing:border-box;display:flex;align-items:center;justify-content:center">
          <img src="${CDN_TMJ}/${d.img}" alt="${esc(d.label)}" style="max-width:100%;max-height:100%;object-fit:contain" crossorigin="anonymous"/>
        </div>
        <span style="font-size:9px;color:#4a5568;text-align:center;font-weight:500">${esc(d.label)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// Prefix "Dr." unless the name already starts with it
const drName = (name) => {
  const n = String(name || '').trim();
  if (!n) return '';
  return /^dr\.?\s/i.test(n) ? n : `Dr. ${n}`;
};

function doctorSignOffHtml(doctor, showSignature = true) {
  if (!doctor?.name && !doctor?.license_number) return '';
  // Embed the signature image only when both a signature is on file AND the
  // "Digital Signature" setting is on; otherwise leave blank space to hand-sign.
  const useSignatureImage = showSignature && !!doctor.signature_url;
  const sig = useSignatureImage
    ? `<img src="${esc(doctor.signature_url)}" style="height:64px;width:auto;max-width:240px;object-fit:contain;display:block;margin:0 auto 4px" crossorigin="anonymous"/>`
    : '<div style="height:64px"></div>'; // empty space to hand-sign/stamp
  return `
  <div style="margin-top:44px;text-align:right">
    <div style="display:inline-block;min-width:260px;text-align:center">
      ${sig}
      <div style="border-top:1px solid #cbd5e0;padding-top:6px">
        ${doctor.name ? `<div style="font-size:12px;font-weight:700;color:#0d1b2a">${esc(drName(doctor.name))}</div>` : ''}
        ${doctor.qualification ? `<div style="font-size:10px;color:#718096">${esc(doctor.qualification)}</div>` : ''}
        ${doctor.license_number ? `<div style="font-size:10px;color:#718096">Reg. No: ${esc(doctor.license_number)}</div>` : ''}
        ${!useSignatureImage ? `<div style="font-size:8px;color:#cbd5e0;margin-top:2px">Signature / Stamp</div>` : ''}
      </div>
    </div>
  </div>`;
}

// Render a dosage code (e.g. "1-0-1") as Morning / Afternoon / Evening pill slots.
// Falls back to a plain badge for non-MAE codes (SOS, Once daily, etc.).
function dosagePillsHtml(dosage) {
  if (!dosage) return '';
  const m = String(dosage).match(/^(\d)-(\d)-(\d)$/);
  if (m) {
    const slots = [
      { label: 'M', active: m[1] !== '0' },
      { label: 'A', active: m[2] !== '0' },
      { label: 'E', active: m[3] !== '0' },
    ];
    const pills = slots.map(s =>
      `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;font-size:9px;font-weight:700;border:1px solid ${s.active ? '#137fec' : '#e2e8f0'};background:${s.active ? '#137fec' : '#f1f5f9'};color:${s.active ? '#ffffff' : '#cbd5e0'}">${s.label}</span>`
    ).join('');
    return `<span style="display:inline-flex;gap:3px;vertical-align:middle">${pills}</span>
      <span style="font-size:9px;color:#94a3b8;margin-left:4px;vertical-align:middle">(${esc(dosage)})</span>`;
  }
  return `<span style="display:inline-block;padding:1px 8px;border-radius:9px;font-size:10px;font-weight:600;background:#eff6ff;color:#137fec;border:1px solid #bfdbfe">${esc(dosage)}</span>`;
}
const footerHtml = (ds, text) => {
  const parts = [text, ds.clinic_name, ds.phone, ds.email].filter(Boolean).join(' · ');
  return parts ? `<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:9px;color:#94a3b8">${esc(parts)}</div>` : '';
};

function prescriptionHtml(ds, { visit, patient, doctor }) {
  const presc = visit?.prescriptions || [];
  const advices = visit?.advices || [];

  const tableRows = presc.length
    ? presc.map((p, i) => `
        <tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:8px 6px;font-size:11px;color:#94a3b8;text-align:center;vertical-align:top;width:22px">${i + 1}</td>
          <td style="padding:8px 6px;vertical-align:top">
            <div style="font-size:13px;font-weight:700;color:#1e293b">${esc(p.drug_name || '')}</div>
            ${p.instructions ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">${esc(p.instructions)}</div>` : ''}
          </td>
          <td style="padding:8px 6px;vertical-align:middle;white-space:nowrap">${dosagePillsHtml(p.dosage)}</td>
          <td style="padding:8px 6px;vertical-align:middle;font-size:11px;color:#475569;white-space:nowrap">${esc(p.duration || '—')}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="padding:12px 6px;font-size:12px;color:#718096;font-style:italic">No medications prescribed.</td></tr>`;

  const medicationsTable = `
    <table style="width:100%;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr style="border-bottom:2px solid #e2e8f0">
          <th style="padding:6px;font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;text-align:center;width:22px">#</th>
          <th style="padding:6px;font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;text-align:left">Medication</th>
          <th style="padding:6px;font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;text-align:left">Dosage</th>
          <th style="padding:6px;font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;text-align:left">Duration</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`;

  const legend = presc.some(p => /^\d-\d-\d$/.test(p.dosage || ''))
    ? `<div style="margin-top:6px;font-size:8px;color:#94a3b8">M = Morning · A = Afternoon · E = Evening · filled = take dose</div>`
    : '';

  return `
    ${clinicHeaderHtml(ds, ds.prescription_show_logo !== false)}
    ${patientStripHtml(patient, visit?.chief_complaint ? [`Chief complaint: ${esc(visit.chief_complaint)}`] : [])}
    ${sectionTitle('Prescription')}
    ${medicationsTable}
    ${legend}
    ${advices.length && ds.prescription_show_advice !== false ? sectionTitle('Advice') + advices.map(a => `<div style="font-size:12px;color:#2d3748;margin-bottom:4px">${(a.content || '')}</div>`).join('') : ''}
    ${doctorSignOffHtml(doctor, ds.prescription_show_signature !== false)}
    ${ds.prescription_show_footer !== false ? footerHtml(ds, ds.prescription_footer_text) : ''}`;
}

function invoiceHtml(ds, { invoice, patient }) {
  if (!invoice) return '';
  const c = cur(ds);
  const items = (invoice.items || []).map(it => `
    <tr>
      <td style="padding:6px 4px;font-size:11px;border-bottom:1px solid #f1f5f9">${esc(it.name)}</td>
      <td style="padding:6px 4px;font-size:11px;text-align:right;border-bottom:1px solid #f1f5f9">${esc(it.quantity)}</td>
      <td style="padding:6px 4px;font-size:11px;text-align:right;border-bottom:1px solid #f1f5f9">${c}${esc(it.rate)}</td>
      <td style="padding:6px 4px;font-size:11px;text-align:right;border-bottom:1px solid #f1f5f9">${c}${esc(it.total)}</td>
    </tr>`).join('');
  const totalRow = (label, val, bold, color) => {
    // Render negatives (e.g. discount) as "− ₹500" rather than "₹-500".
    const neg = Number(val) < 0;
    const disp = `${neg ? '− ' : ''}${c}${esc(neg ? Math.abs(Number(val)) : val)}`;
    return `<tr><td colspan="2"></td><td style="padding:3px 4px;font-size:11px;text-align:right;${bold ? 'font-weight:700' : ''};color:${color || '#2d3748'}">${esc(label)}</td><td style="padding:3px 4px;font-size:11px;text-align:right;${bold ? 'font-weight:700' : ''};color:${color || '#2d3748'}">${disp}</td></tr>`;
  };
  const payRow = (lbl, val) => val ? `<div style="font-size:10px;color:#718096"><span style="color:#4a5568">${esc(lbl)}:</span> ${esc(val)}</div>` : '';
  const pay = (ds.invoice_show_payment !== false && (ds.payment_modes || []).length)
    ? sectionTitle('Payment Options') + `<div style="display:flex;gap:24px;flex-wrap:wrap">${ds.payment_modes.map(pm => {
        const isBank = (pm.type || 'upi') === 'bank';
        const body = isBank
          ? `${payRow('Beneficiary', pm.beneficiary)}${payRow('A/C No', pm.details)}${payRow('Bank', pm.bank_name)}${payRow('Branch', pm.branch)}${payRow('IFSC', pm.ifsc)}`
          : `${pm.details ? `<div style="font-size:10px;color:#718096">${esc(pm.details)}</div>` : ''}${pm.qr_url ? `<img src="${esc(pm.qr_url)}" style="height:80px;width:80px;object-fit:contain;margin-top:4px" crossorigin="anonymous"/>` : ''}`;
        return `<div><div style="font-size:11px;font-weight:700">${esc(pm.label)}</div>${body}</div>`;
      }).join('')}</div>`
    : '';
  return `
    ${clinicHeaderHtml(ds, ds.invoice_show_logo !== false)}
    <div style="font-size:16px;font-weight:800;color:#0d1b2a;margin-bottom:6px">INVOICE</div>
    ${patientStripHtml(patient, [`Invoice #: ${esc(invoice.invoice_id || '—')}`, `Date: ${esc(new Date(invoice.date || invoice.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}`])}
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="padding:6px 4px;font-size:9px;color:#718096;text-align:left;border-bottom:1px solid #e2e8f0">ITEM</th>
        <th style="padding:6px 4px;font-size:9px;color:#718096;text-align:right;border-bottom:1px solid #e2e8f0">QTY</th>
        <th style="padding:6px 4px;font-size:9px;color:#718096;text-align:right;border-bottom:1px solid #e2e8f0">RATE</th>
        <th style="padding:6px 4px;font-size:9px;color:#718096;text-align:right;border-bottom:1px solid #e2e8f0">TOTAL</th>
      </tr></thead>
      <tbody>${items}</tbody>
      <tfoot>
        ${invoice.subtotal != null && invoice.subtotal !== invoice.total_amount ? totalRow('Subtotal', invoice.subtotal, false) : ''}
        ${invoice.discount?.amount > 0 ? totalRow(`Discount${invoice.discount.type === 'percent' ? ` (${invoice.discount.value}%)` : ''}`, -invoice.discount.amount, false) : ''}
        ${(ds.invoice_show_gst !== false && invoice.tax) ? totalRow(`${ds.gstin ? 'GST' : 'Tax'}${invoice.taxRatePct > 0 ? ` (${invoice.taxRatePct}%)` : ''}`, invoice.tax, false) : ''}
        ${totalRow('Total', invoice.total_amount, true, '#0d1b2a')}
      </tfoot>
    </table>
    ${pay}
    ${ds.invoice_show_footer !== false ? footerHtml(ds, ds.invoice_footer_text) : ''}`;
}

function patientHistoryHtml(patient, visit) {
  const conditions  = (patient?.medical_history || []).filter(Boolean);
  const allergies   = (patient?.allergies       || []).filter(Boolean);
  const dentalHx    = (patient?.dental_history  || '').trim();
  const chiefComp   = (visit?.chief_complaint   || '').trim();

  const habits = [
    patient?.tobacco_smoking    ? 'Tobacco (Smoking)'    : null,
    patient?.tobacco_smokeless  ? 'Tobacco (Smokeless)'  : null,
    patient?.tea_consumption    ? `Tea: ${patient.tea_consumption}`     : null,
    patient?.coffee_consumption ? `Coffee: ${patient.coffee_consumption}` : null,
  ].filter(Boolean);

  const hasAny = chiefComp || conditions.length || allergies.length || dentalHx || habits.length;
  if (!hasAny) return '';

  const pill = (label, color) =>
    `<span style="display:inline-block;padding:3px 11px;border-radius:99px;font-size:10px;font-weight:600;background:${color.bg};color:${color.text};border:1px solid ${color.border};margin:2px 4px 2px 0">${esc(label)}</span>`;

  const row = (label, content) =>
    `<div style="display:flex;gap:12px;align-items:flex-start;padding:7px 0;border-bottom:1px solid #f1f5f9">
      <div style="flex:0 0 110px;font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;padding-top:3px">${label}</div>
      <div style="flex:1">${content}</div>
    </div>`;

  let body = '';
  if (chiefComp)         body += row('Chief Complaint', `<span style="font-size:12px;color:#c53030;font-weight:600">${esc(chiefComp)}</span>`);
  if (conditions.length) body += row('Medical History', conditions.map(c => pill(c, { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' })).join(''));
  if (allergies.length)  body += row('Allergies', allergies.map(a => pill(a, { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' })).join(''));
  if (dentalHx)          body += row('Dental History', `<span style="font-size:12px;color:#2d3748">${esc(dentalHx)}</span>`);
  if (habits.length)     body += row('Lifestyle Habits', habits.map(h => pill(h, { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe' })).join(''));

  // Strip the trailing border on the last row for a clean edge
  body = body.replace(/border-bottom:1px solid #f1f5f9"(?=[^"]*$)/, 'border-bottom:none"');

  return card({ title: 'Patient History', accent: '#7c3aed', icon: 'clipboard', body });
}

// Examination & Diagnosis — per-tooth findings/diagnoses (with a chart marking the
// affected teeth) plus a "General" section for legacy flat entries with no teeth.
function examinationHtml(visit, dentitionType = 'Adult') {
  const f = visit?.findings || {};
  const toothFindings  = (f.tooth_findings  || []).filter(x => x?.name);
  const toothDiagnoses = (f.tooth_diagnoses || []).filter(x => x?.name);

  // Flat (no per-tooth) entries. Only shown when there is no per-tooth data —
  // the per-tooth table already carries findings & diagnosis, so showing the
  // flat fields too would duplicate them.
  const hasPerTooth = toothFindings.length || toothDiagnoses.length;
  const flatFindings = hasPerTooth ? [] : (f.clinical_findings || []).filter(x => x && String(x).trim());
  const flatDiagnosis = hasPerTooth ? '' : (f.diagnosis_notes || '').trim();

  if (!hasPerTooth && !flatFindings.length && !flatDiagnosis) return '';

  const chip = (label, kind) => {
    const c = kind === 'dx'
      ? { bg: '#cffafe', tx: '#155e75', bd: '#67e8f9' }
      : { bg: '#fef9c3', tx: '#854d0e', bd: '#fde047' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:10.5px;font-weight:600;background:${c.bg};color:${c.tx};border:1px solid ${c.bd};margin:2px 4px 2px 0">${esc(label)}</span>`;
  };
  const sub = (t) => `<div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">${t}</div>`;

  // Group per-tooth entries by target (tooth id or soft-tissue/TMJ label).
  const byTarget = {}; // target -> { findings:Set, diagnoses:Set }
  const addAll = (arr, key) => arr.forEach(e => (e.teeth_numbers || []).forEach(tt => {
    const k = String(tt);
    (byTarget[k] ||= { findings: new Set(), diagnoses: new Set() })[key].add(e.name);
  }));
  addAll(toothFindings, 'findings');
  addAll(toothDiagnoses, 'diagnoses');

  // The affected teeth are highlighted on the main dental chart in the Treatment
  // Performed card (dentalChartHtml receives findingsTeeth), so this card shows
  // only the per-tooth findings/diagnosis text — no second chart.
  // Sort targets: numeric teeth first (ascending), then labels.
  const targets = Object.keys(byTarget).sort((a, b) => {
    const na = isToothId(a), nb = isToothId(b);
    if (na && nb) return Number(a) - Number(b);
    if (na) return -1; if (nb) return 1;
    return a.localeCompare(b);
  });
  const perToothRows = targets.map(tt => {
    const g = byTarget[tt];
    const label = isToothId(tt) ? `Tooth ${tt}` : tt;
    const dx = [...g.diagnoses].map(n => chip(n, 'dx')).join('');
    const fn = [...g.findings].map(n => chip(n, 'fn')).join('');
    return `<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid #ecfeff">
      <div style="flex:0 0 66px;font-size:11px;font-weight:700;color:#0e7490;padding-top:3px">${esc(label)}</div>
      <div style="flex:1">${dx}${fn}</div>
    </div>`;
  }).join('').replace(/border-bottom:1px solid #ecfeff"(?=[^"]*$)/, 'border-bottom:none"');

  const perToothBlock = hasPerTooth
    ? `${sub('Findings & Diagnosis by Tooth')}${perToothRows}`
    : '';

  // General (no-tooth) block — only when there is no per-tooth data.
  const generalBlock = (!hasPerTooth && (flatFindings.length || flatDiagnosis))
    ? `${flatFindings.length ? `${sub('Clinical Findings')}<div style="margin-bottom:${flatDiagnosis ? '12px' : '0'}">${flatFindings.map(n => chip(n, 'fn')).join('')}</div>` : ''}
       ${flatDiagnosis ? `${sub('Diagnosis')}<div style="background:#ecfeff;border:1px solid #a5f3fc;border-left:4px solid #0891b2;border-radius:8px;padding:10px 14px;font-size:12px;color:#0e4f5c;line-height:1.55;font-weight:500">${esc(flatDiagnosis)}</div>` : ''}`
    : '';

  return card({
    title: 'Examination & Diagnosis',
    accent: '#0891b2',
    icon: 'scope',
    body: `${perToothBlock}${generalBlock}`,
    tint: '#f8feff',
  });
}

// Visit images (X-rays, scans, photographs) shown in a dedicated gallery card.
function visitImagesHtml(patient, visit, imageData = {}) {
  const imageFiles = (patient?.files || []).filter(pf =>
    fileBelongsToVisit(pf, visit) && pf.mime_type?.startsWith('image/')
  );
  if (!imageFiles.length) return '';

  const tiles = imageFiles.map(pf => {
    const src = imageData[pf.drive_file_id] || pf.web_view_link || '';
    const cat = pf.category || 'Image';
    return `
      <div style="flex:0 0 calc(33.333% - 8px);box-sizing:border-box;border:1px solid #e8eef5;border-radius:10px;overflow:hidden;background:#f8fafc">
        <div style="width:100%;height:120px;display:flex;align-items:center;justify-content:center;background:#0f172a08">
          ${imageData[pf.drive_file_id]
            ? `<img src="${src}" style="max-width:100%;max-height:120px;object-fit:contain"/>`
            : `<span style="font-size:9px;color:#cbd5e0">Image</span>`}
        </div>
        <div style="padding:5px 8px;font-size:8px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;border-top:1px solid #eef2f7">${esc(cat)}</div>
      </div>`;
  }).join('');

  return card({
    title: 'Images & Scans',
    accent: '#0891b2',
    icon: 'image',
    body: `<div style="display:flex;flex-wrap:wrap;gap:12px">${tiles}</div>`,
  });
}

function smartReportHtml(ds, { visit, patient, doctor, imageData = {} }) {
  const treatments = visit?.treatments || [];
  const advices    = visit?.advices    || [];
  const findings   = visit?.findings   || {};

  // Separate treatments into dental / soft tissue / TMJ by inspecting teeth_numbers
  const dentalTreatments      = treatments.filter(t => (t.teeth_numbers || []).some(isToothId));
  const softTissueTreatments  = treatments.filter(t => (t.teeth_numbers || []).some(n => SOFT_TISSUE_SET.has(n)));
  const tmjTreatments         = treatments.filter(t => (t.teeth_numbers || []).some(n => TMJ_SET.has(n)));

  // Build status maps from treatment records (treatment-plan entries)
  const softStatusMap = {};
  softTissueTreatments.forEach(t => (t.teeth_numbers || []).filter(n => SOFT_TISSUE_SET.has(n)).forEach(n => {
    if (!softStatusMap[n]) softStatusMap[n] = [];
    if (!softStatusMap[n].includes(t.status)) softStatusMap[n].push(t.status);
  }));
  const tmjStatusMap = {};
  tmjTreatments.forEach(t => (t.teeth_numbers || []).filter(n => TMJ_SET.has(n)).forEach(n => {
    if (!tmjStatusMap[n]) tmjStatusMap[n] = [];
    if (!tmjStatusMap[n].includes(t.status)) tmjStatusMap[n].push(t.status);
  }));

  // Also include findings.soft_tissue / findings.tmj — these come from the
  // Examination tab (not the treatment plan) and must show in the visit summary too.
  (findings.soft_tissue || []).forEach(n => { if (!softStatusMap[n]) softStatusMap[n] = ['Planned']; });
  (findings.tmj         || []).forEach(n => { if (!tmjStatusMap[n])  tmjStatusMap[n]  = ['Planned']; });

  // Teeth selected on the dental chart via the Examination tab (findings /
  // diagnoses) — highlighted on the chart even when they carry no treatment, so
  // the pictorial reflects EVERY selected tooth of the appointment.
  const findingsTeeth = new Set();
  [...(findings.tooth_findings || []), ...(findings.tooth_diagnoses || [])].forEach(e =>
    (e?.teeth_numbers || []).filter(isToothId).forEach(n => findingsTeeth.add(String(Number(n))))
  );

  // Visual sections — render on the dentition the teeth were charted on (snapshot
  // on the visit), falling back to the patient's current dentition for old data.
  const chartDentition = visit?.dentition_type || patient?.dentition_type;
  const chartBlock  = dentalChartHtml(dentalTreatments, chartDentition, findingsTeeth);
  const stGrid      = softTissueGridHtml(Object.keys(softStatusMap), softStatusMap);
  const tmjGrid     = tmjGridHtml(Object.keys(tmjStatusMap), tmjStatusMap);

  // Consultation notes from the Visit Notes tab, plus the visit-level Clinical
  // Notes field (visit.notes) edited from the treatment card modal.
  const consultationNotes = visit?.consultation_notes || [];
  const visitNotes = (visit?.notes || '').trim();
  const consultationNotesHtml = [
    ...consultationNotes.map(n => `<div style="font-size:12px;color:#334155;margin-bottom:6px;line-height:1.6">${n.content || ''}</div>`),
    ...(visitNotes ? [`<div style="font-size:12px;color:#334155;margin-bottom:6px;line-height:1.6">${esc(visitNotes)}</div>`] : []),
  ].join('');

  // Advice entries from the Visit Notes tab
  const visitAdviceHtml = advices.length
    ? advices.map(a => `<div style="font-size:12px;color:#334155;margin-bottom:6px;line-height:1.6">${a.content || ''}</div>`).join('')
    : '';
  const template = ds.postcare_template || '';
  const genericHtml = template
    ? `<ul style="margin:0;padding-left:18px">` + template.split('\n').filter(l => l.trim()).map(l =>
        `<li style="font-size:12px;color:#334155;margin-bottom:5px;line-height:1.5">${esc(l.trim().replace(/^[•\-*]\s*/, ''))}</li>`
      ).join('') + `</ul>`
    : '';

  // Treatment list as clean rows with status chips
  const statusChip = (s) => {
    if (!s) return '';
    const c = s === 'Completed' ? { bg: '#dcfce7', t: '#166534' }
            : s === 'In Progress' ? { bg: '#dbeafe', t: '#1e40af' }
            : s === 'Planned' ? { bg: '#fef3c7', t: '#92400e' }
            : { bg: '#f1f5f9', t: '#64748b' };
    return `<span style="display:inline-block;padding:1px 9px;border-radius:99px;font-size:9px;font-weight:700;background:${c.bg};color:${c.t}">${esc(s)}</span>`;
  };
  const treatmentRows = treatments.map(t => {
    const targets = (t.teeth_numbers || []);
    const dentalTeeth = targets.filter(isToothId);
    const otherTargets = targets.filter(n => !isToothId(n));
    const parts = [
      dentalTeeth.length ? `Teeth ${dentalTeeth.join(', ')}` : null,
      otherTargets.length ? otherTargets.join(', ') : null,
    ].filter(Boolean);
    const loc = parts.length ? parts.join(' | ') : '';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9">
        <div style="flex:1">
          <span style="font-size:12px;font-weight:600;color:#1e293b">${esc(t.treatment_name)}</span>
          ${loc ? `<span style="font-size:10px;color:#94a3b8;margin-left:6px">${esc(loc)}</span>` : ''}
        </div>
        ${statusChip(t.status)}
      </div>`;
  }).join('').replace(/border-bottom:1px solid #f1f5f9"(?=[^"]*$)/, 'border-bottom:none"');

  // Visual chart block — centered
  const visualBlocks = [chartBlock, stGrid, tmjGrid].filter(Boolean).join('');
  const treatmentCard = (treatments.length || visualBlocks)
    ? card({
        title: 'Treatment Performed',
        accent: '#137fec',
        icon: 'tooth',
        body: `${visualBlocks ? `<div style="text-align:center;margin-bottom:${treatmentRows ? '12px' : '0'}">${visualBlocks}</div>` : ''}${treatmentRows}`,
      })
    : '';

  const notesCard = consultationNotesHtml
    ? card({ title: 'Consultation Notes', accent: '#0d9488', icon: 'note', body: consultationNotesHtml })
    : '';

  const adviceBody = [visitAdviceHtml, genericHtml].filter(Boolean).join(
    visitAdviceHtml && genericHtml ? '<div style="height:8px"></div>' : ''
  );
  const adviceCard = adviceBody
    ? card({ title: 'Advice & Post-Care', accent: '#ea580c', icon: 'bulb', body: adviceBody, tint: '#fffbf7' })
    : '';

  const imagesCard = visitImagesHtml(patient, visit, imageData);

  const visitDate = visit?.date
    ? new Date(visit.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return `
    ${clinicHeaderHtml(ds, ds.smart_show_logo !== false)}
    ${docHeroTitle('Visit Summary', `${visitDate}${doctor?.name ? ` · ${drName(doctor.name)}` : ''}`)}
    ${patientStripHtml(patient, doctor?.name ? [`Doctor: ${esc(drName(doctor.name))}`] : [])}
    ${patientHistoryHtml(patient, visit)}
    ${treatmentCard}
    ${examinationHtml(visit, chartDentition)}
    ${imagesCard}
    ${notesCard}
    ${adviceCard}
    ${ds.smart_show_footer !== false ? footerHtml(ds, ds.report_footer_text) : ''}`;
}

function reportHtml(ds, { reportJob, patient, doctor }) {
  if (!reportJob) return '';
  return `
    ${clinicHeaderHtml(ds, ds.report_show_logo !== false)}
    ${ds.report_show_patient !== false ? patientStripHtml(patient, [reportJob.templateName ? `Report: ${esc(reportJob.templateName)}` : null, doctor?.name ? `Doctor: ${esc(drName(doctor.name))}` : null].filter(Boolean)) : ''}
    ${ds.report_show_header !== false && ds.report_header_text ? `<div style="font-size:10px;color:#718096;font-style:italic;margin-bottom:8px">${esc(ds.report_header_text)}</div>` : ''}
    ${sectionTitle(reportJob.templateName || 'Clinical Report')}
    <div style="font-size:12px;color:#2d3748;white-space:pre-wrap;line-height:1.55">${esc((reportJob.reportText || '').replace(/<[^>]+>/g, ''))}</div>
    ${doctorSignOffHtml(doctor)}
    ${ds.report_show_footer !== false ? footerHtml(ds, ds.report_footer_text) : ''}`;
}

// ─── Component ───────────────────────────────────────────────────────────────────
export default function VisitDocumentsModal({
  isOpen, onClose,
  visit, patient,
  invoice = null, invoiceId = null,
  reportJob = null, reportJobId = null,
  restrictTo = null,   // e.g. ['prescription','invoice'] — limits which tabs are shown
}) {
  const [ds, setDs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resolvedDoctor, setResolvedDoctor] = useState(null);
  const [resolvedReport, setResolvedReport] = useState(null);
  const [resolvedInvoice, setResolvedInvoice] = useState(null);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [canShare, setCanShare] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ to: '', subject: '', body: '' });

  // All data resolved from either props or API fetches
  const effectiveReport  = reportJob  || resolvedReport;
  const effectiveInvoice = invoice    || resolvedInvoice;

  // Single effect — only fires when modal opens/closes. All data fetched in
  // parallel; `selected` is initialised once after everything resolves.
  useEffect(() => {
    if (!isOpen) {
      setDs(null); setResolvedDoctor(null); setResolvedReport(null); setResolvedInvoice(null);
      setSelected({}); setError(''); setEmailOpen(false); setBusy('');
      return;
    }

    setEmailForm(f => ({ ...f, to: patient?.contact?.email || '' }));
    try {
      const probe = new File([new Blob(['x'], { type: 'application/pdf' })], 'p.pdf', { type: 'application/pdf' });
      // Web Share for files is only reliable on mobile/touch devices; on desktop
      // navigator.canShare can report true but the actual share fails. Restrict
      // the Share button to coarse-pointer (touch) devices.
      const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
      setCanShare(!!(isTouch && navigator.canShare && navigator.canShare({ files: [probe] })));
    } catch { setCanShare(false); }

    setLoading(true);

    // Build fetch promises
    const fetchDs      = api.get('/documents/settings').then(r => r.data || {}).catch(() => ({}));
    // Resolve the prescribing doctor with fallbacks, since visits auto-created
    // for notes/prescriptions often have no doctor_id:
    //   1. visit.doctor_id (if set)
    //   2. the doctor on the visit's appointment
    //   3. the clinic's only/first active doctor
    const fetchDoctor = (async () => {
      const visitDocId = visit?.doctor_id
        ? (typeof visit.doctor_id === 'object' ? visit.doctor_id._id : visit.doctor_id)
        : null;
      if (visitDocId) {
        const d = await api.get(`/doctors/${visitDocId}`).then(r => r.data || null).catch(() => null);
        if (d) return d;
      }
      // Fall back to the clinic doctors list
      const doctors = await api.get('/doctors').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []);
      if (!doctors.length) return null;

      // Try the doctor on the visit's appointment
      const apptDocId = visit?.appointment_id
        ? (typeof visit.appointment_id === 'object' ? visit.appointment_id.doctor_id : null)
        : null;
      if (apptDocId) {
        const match = doctors.find(d => String(d._id) === String(apptDocId));
        if (match) return match;
      }
      // Otherwise use the first active doctor (or first overall)
      return doctors.find(d => d.is_active !== false) || doctors[0];
    })();
    // Only show AI report if one was explicitly passed for this visit — no fallback to latest
    const fetchReport  = reportJob
      ? Promise.resolve(reportJob)
      : reportJobId
        ? api.get(`/report/job/${reportJobId}`).then(r => r.data || null).catch(() => null)
        : Promise.resolve(null);
    const fetchInvoice = (!invoice && invoiceId)
      ? api.get(`/invoices/${invoiceId}`).then(r => r.data || null).catch(() => null)
      : Promise.resolve(invoice || null);
    // Email template configured in Settings → Share with patient → Send Email
    const fetchEmailTpl = api.get('/report/delivery-settings')
      .then(r => r.data?.email || null).catch(() => null);

    Promise.all([fetchDs, fetchDoctor, fetchReport, fetchInvoice, fetchEmailTpl])
      .then(([ds, doctor, report, inv, emailTpl]) => {
        setDs(ds);
        setResolvedDoctor(doctor);
        setResolvedReport(report);
        setResolvedInvoice(inv);

        // Prefill the email subject/body from the saved template, with
        // {{variables}} replaced by this visit's actual values. Editable by user.
        const vars = {
          patientName:  `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim(),
          firstName:    patient?.first_name || '',
          doctorName:   doctor?.name ? (/^dr\.?\s/i.test(doctor.name) ? doctor.name : `Dr. ${doctor.name}`) : '',
          clinicName:   ds?.clinic_name || '',
          date:         new Date(visit?.date || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
          templateName: report?.templateName || 'Visit Summary',
        };
        const fill = (str) => String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? `{{${k}}}`));
        if (emailTpl) {
          setEmailForm(f => ({
            ...f,
            subject: fill(emailTpl.subject),
            body:    fill(emailTpl.body),
          }));
        }

        // Initialise checkboxes once after all data is resolved
        // If restrictTo is set, only pre-select within that list
        const allowed = restrictTo ? new Set(restrictTo) : null;
        const isAllowed = (key) => !allowed || allowed.has(key);
        // Auto-select uploaded files (images + PDFs) attached to this visit,
        // excluding the AI report's own archived file (shown as "AI Clinical Report").
        const fileSel = {};
        if (isAllowed('files')) {
          const rptFileIds = new Set(Object.values(report?.driveFileIds || {}).map(String));
          (patient?.files || []).forEach(pf => {
            const okType = /^image\/(png|jpe?g)$/i.test(pf.mime_type || '') || /pdf/i.test(pf.mime_type || '');
            if (okType && fileBelongsToVisit(pf, visit) && !rptFileIds.has(String(pf.drive_file_id))) {
              fileSel[`file:${pf.drive_file_id}`] = true;
            }
          });
        }
        setSelected({
          // Visit Summary is ALWAYS produced whenever a visit exists for this
          // appointment — the patient history is always passed into it, so it is
          // never empty even if no dental-chart / findings data was entered.
          smartReport:   isAllowed('smartReport')   && !!visit,
          prescription:  isAllowed('prescription')  && !!(visit?.prescriptions?.length || visit?.advices?.length),
          invoice:       isAllowed('invoice')       && !!inv,
          report:        isAllowed('report')        && !!report,
          ...fileSel,
        });
      })
      .finally(() => setLoading(false));

  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  // Document availability — filtered by restrictTo if set
  const allAvailable = [
    // Visit Summary is always available when a visit exists — patient history is
    // always included, so the summary is meaningful even with no clinical entry.
    { key: 'smartReport',   label: 'Visit Summary',      has: !!visit },
    { key: 'prescription',  label: 'Prescription',        has: !!(visit?.prescriptions?.length || visit?.advices?.length) },
    { key: 'invoice',       label: 'Invoice',             has: !!effectiveInvoice },
    { key: 'report',        label: 'AI Clinical Report',  has: !!effectiveReport },
  ];
  // Uploaded files attached to THIS visit (X-rays, lab/blood reports, photos).
  // Each is listed as its own selectable entry and compiled into the combined PDF
  // — images rendered as pages, PDFs merged in — by the backend.
  const isImageMime = (mt) => /^image\/(png|jpe?g)$/i.test(mt || '');
  const isPdfMime   = (mt) => /pdf/i.test(mt || '');
  // The AI report is ALSO archived as a file in patient.files[] (Drive). Exclude
  // those from the uploaded-files list so the report isn't shown twice — it's
  // already listed as "AI Clinical Report". Match by the report's own drive_file_ids.
  const reportFileIds = new Set(Object.values(effectiveReport?.driveFileIds || {}).map(String));
  const visitUploadedFiles = (patient?.files || []).filter(pf =>
    fileBelongsToVisit(pf, visit)
    && !reportFileIds.has(String(pf.drive_file_id))
    && (isImageMime(pf.mime_type) || isPdfMime(pf.mime_type))
  );
  const fileDocs = (restrictTo && !restrictTo.includes('files')) ? [] : visitUploadedFiles.map(pf => ({
    key:    `file:${pf.drive_file_id}`,
    label:  pf.file_name || (isPdfMime(pf.mime_type) ? 'Document.pdf' : 'Image'),
    has:    true,
    fileId: pf.drive_file_id,
  }));

  // Only show documents that exist for this visit — never show greyed/unavailable entries
  const available = [
    ...(restrictTo ? allAvailable.filter(d => restrictTo.includes(d.key)) : allAvailable).filter(d => d.has),
    ...fileDocs,
  ];

  const include = available.filter(d => selected[d.key] && !d.fileId).map(d => d.key);
  // Selected uploaded files → appended to the combined PDF server-side.
  const attachFileIds = available.filter(d => selected[d.key] && d.fileId).map(d => d.fileId);
  // A valid selection = any core document OR any uploaded file.
  const hasSelection = include.length > 0 || attachFileIds.length > 0;
  const idsPayload = {
    visitId:     visit?._id || null,
    patientId:   patient?._id || null,
    invoiceId:   effectiveInvoice?._id || invoiceId || null,
    reportJobId: reportJob?._id || reportJobId || null,
    include,
    attachFileIds,
  };

  function buildFullHtml(imageData = {}) {
    const blocks = [];
    if (selected.smartReport   && available.find(d => d.key === 'smartReport')?.has)   blocks.push(smartReportHtml(ds, { visit, patient, doctor: resolvedDoctor, imageData }));
    if (selected.prescription  && available.find(d => d.key === 'prescription')?.has)  blocks.push(prescriptionHtml(ds, { visit, patient, doctor: resolvedDoctor }));
    if (selected.invoice       && effectiveInvoice) blocks.push(invoiceHtml(ds, { invoice: effectiveInvoice, patient }));
    if (selected.report        && effectiveReport)  blocks.push(reportHtml(ds, { reportJob: effectiveReport, patient, doctor: resolvedDoctor }));
    const pages = blocks.filter(Boolean).map((b, i) =>
      `<div style="${i < blocks.length - 1 ? 'page-break-after:always;' : ''}padding:32px 36px;font-family:Arial,Helvetica,sans-serif">${b}</div>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${pages}</body></html>`;
  }

  // Fetch base64 data URLs for all images attached to this visit (for inline embedding in print)
  async function fetchImageData() {
    if (!selected.smartReport) return {};
    const imageFiles = (patient?.files || []).filter(pf =>
      fileBelongsToVisit(pf, visit) && pf.mime_type?.startsWith('image/')
    );
    const entries = await Promise.all(imageFiles.map(async (pf) => {
      try {
        const r = await api.get(`/files/proxy/${pf.drive_file_id}`, { responseType: 'blob' });
        const dataUrl = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.onerror = rej;
          reader.readAsDataURL(r.data);
        });
        return [pf.drive_file_id, dataUrl];
      } catch { return null; }
    }));
    return Object.fromEntries(entries.filter(Boolean));
  }

  async function waitForImages(win) {
    const imgs = Array.from(win.document.images || []);
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve()
      : new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 3000); })));
  }

  // Build the same rich HTML the Print path uses (with images embedded) and let
  // the backend render it to PDF with headless Chromium — so Save / Share / Email
  // produce a document identical to Print. `idsPayload` is still sent as a
  // fallback for the backend.
  async function fetchPdfBlob() {
    // Only build/render document HTML when core documents are selected. If the
    // user picked only uploaded files, send no html so the backend starts from an
    // empty PDF and appends just those files (no blank leading page).
    const imageData = include.length ? await fetchImageData() : {};
    const html = include.length ? buildFullHtml(imageData) : '';
    const res = await api.post('/documents/pdf', { ...idsPayload, html }, { responseType: 'blob' });
    return res.data;
  }

  // Mobile browsers cannot print a PDF from a hidden iframe: iOS (all browsers are
  // WebKit) has no window.print() for embedded PDFs and Android Chrome refuses to
  // render PDF blobs in an iframe. There we hand the file to the OS instead, which
  // exposes print in its native viewer / share sheet.
  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)); // iPadOS masquerades as Mac

  // Print the server-built COMBINED PDF (core docs + merged uploaded files) so
  // Print matches Save/Share/Email exactly and includes uploaded PDFs/images.
  async function handlePrint() {
    if (!hasSelection) { setError('Select at least one document.'); return; }
    setBusy('print'); setError('');
    let url;
    try {
      const blob = await fetchPdfBlob();
      const fileName = `documents-${patient?.patientId || 'patient'}.pdf`;

      if (isMobile()) {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: fileName });
        } else {
          url = URL.createObjectURL(blob);
          const win = window.open(url, '_blank');
          if (!win) throw new Error('Please allow pop-ups to print.');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        return;
      }

      url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch { /* noop */ }
        setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url); }, 60000);
      };
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      if (e.name === 'AbortError') return; // user dismissed the share sheet
      setError('Print failed: ' + (e.response?.data?.error || e.message));
    } finally { setBusy(''); }
  }

  async function handleSave() {
    if (!hasSelection) { setError('Select at least one document.'); return; }
    setBusy('save'); setError('');
    try {
      const blob = await fetchPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documents-${patient?.patientId || 'patient'}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('Save failed: ' + (e.response?.data?.error || e.message));
    } finally { setBusy(''); }
  }

  async function handleShare() {
    if (!hasSelection) { setError('Select at least one document.'); return; }
    setBusy('share'); setError('');
    try {
      const blob = await fetchPdfBlob();
      const file = new File([blob], `documents-${patient?.patientId || 'patient'}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Clinic Documents' });
      } else {
        setError('Sharing files is not supported on this device — use Save PDF instead.');
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError('Share failed: ' + (e.response?.data?.error || e.message));
    } finally { setBusy(''); }
  }

  async function handleEmailSend() {
    if (!hasSelection) { setError('Select at least one document.'); return; }
    if (!emailForm.to) { setError('Enter a recipient email.'); return; }
    setBusy('email'); setError('');
    try {
      const imageData = await fetchImageData();
      const html = buildFullHtml(imageData);
      await api.post('/documents/email', { ...idsPayload, ...emailForm, html, patientName: `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim() });
      setEmailOpen(false);
      onClose?.();
    } catch (e) {
      setError(e.response?.data?.error || 'Email failed.');
    } finally { setBusy(''); }
  }

  const anyBusy = !!busy;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#137fec]" />
            <h3 className="font-bold text-slate-800">Documents</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <>
              {available.length > 0 && (
                <p className="text-sm text-slate-500">Select documents to print, save, share, or email.</p>
              )}
              <div className="space-y-2">
                {available.length === 0
                  ? <p className="text-sm text-slate-400 italic">No documents generated for this visit.</p>
                  : available.map(d => (
                    <label key={d.key} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!selected[d.key]}
                        onChange={e => setSelected(s => ({ ...s, [d.key]: e.target.checked }))}
                        className="w-4 h-4 accent-[#137fec]"
                      />
                      <span className="text-sm font-medium text-slate-700">{d.label}</span>
                    </label>
                  ))
                }
              </div>

              {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

              {emailOpen ? (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <input value={emailForm.to} onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))} placeholder="Recipient email" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                  <input value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))} placeholder="Subject" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                  <textarea value={emailForm.body} onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))} placeholder="Message" rows={6} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg whitespace-pre-wrap" />
                  <div className="flex gap-2">
                    <button onClick={() => setEmailOpen(false)} className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg">Cancel</button>
                    <button onClick={handleEmailSend} disabled={anyBusy} className="flex-1 py-2 text-sm font-bold text-white bg-[#137fec] rounded-lg flex items-center justify-center gap-1">
                      {busy === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button onClick={handlePrint} disabled={anyBusy} className="flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50">
                    {busy === 'print' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Print
                  </button>
                  <button onClick={handleSave} disabled={anyBusy} className="flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50">
                    {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Save PDF
                  </button>
                  <button onClick={() => { setError(''); setEmailOpen(true); }} disabled={anyBusy} className="flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-[#137fec] rounded-xl hover:bg-blue-600 disabled:opacity-50">
                    <Mail className="w-4 h-4" /> Email
                  </button>
                  {canShare && (
                    <button onClick={handleShare} disabled={anyBusy} className="flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50">
                      {busy === 'share' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Share
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
