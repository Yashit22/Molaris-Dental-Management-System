import React from 'react';
import { X, Plus, FileSpreadsheet, BookOpen, Rows3 } from 'lucide-react';

const TAB_LABEL = {
  findings: 'Clinical Finding',
  diagnoses: 'Diagnosis',
  treatments: 'Suggested Treatment',
  medicines: 'Medicine',
};

// Options to hide per tab (e.g. medicines have no inline quick-entry grid).
const HIDDEN_OPTIONS = {
  medicines: ['quick'],
};

const TAB_CONTEXT = {
  findings: {
    what: 'Clinical Findings are observations you record when examining a patient — things like "Deep cavity on #36" or "Gingival inflammation". They populate the findings picker on the Treatment page.',
    example: 'E.g. Deep caries, Gingival recession, Tooth mobility, Abscess',
  },
  diagnoses: {
    what: 'Diagnoses are the confirmed clinical conclusions you assign to a patient visit — they appear in the Diagnosis dropdown during treatment charting and can carry an ICD code.',
    example: 'E.g. Chronic periodontitis (K05.3), Pulpitis (K04.0), Dental caries (K02)',
  },
  treatments: {
    what: 'Suggested Treatments are your clinic\'s standard procedures with default costs. They pre-fill the treatment plan board so you don\'t have to type the name and price every time.',
    example: 'E.g. Root Canal Treatment – ₹4,500, Scaling & Polishing – ₹800, Composite Filling – ₹1,200',
  },
  medicines: {
    what: 'Medicines are your clinic\'s prescribable drug catalog with default dosage, duration, instructions, and cost. They pre-fill the medicine picker in prescriptions and can be billed as Pharmacy items on invoices.',
    example: 'E.g. Amoxicillin 500mg – 1-0-1 for 5 days, Ibuprofen 400mg – 1-1-1 for 3 days',
  },
};

const OPTIONS = [
  {
    key: 'library',
    icon: BookOpen,
    title: 'Import from Library',
    badge: 'Recommended for new clinics',
    badgeColor: 'bg-purple-100 text-purple-700',
    bestFor: 'Just getting started? Pick from our curated dental starter catalog.',
    description: 'Browse a pre-built list of common findings, diagnoses, or treatments used across Indian dental clinics. Select the ones that match your practice, review them, and import in one click. You\'ll have a working baseline ready in under a minute.',
    need: 'Nothing — it\'s already there.',
    iconBg: 'bg-purple-50 dark:bg-purple-900/30',
    iconColor: 'text-purple-600',
    borderHover: 'hover:border-purple-400',
  },
  {
    key: 'single',
    icon: Plus,
    title: 'Add One',
    badge: 'Quick, ad-hoc',
    badgeColor: 'bg-blue-100 text-blue-700',
    bestFor: 'Adding a single item you just thought of, or correcting something mid-consultation.',
    description: 'Opens a small form — fill in the name, category, and any other details, then save. The item is available immediately in the Treatment page dropdowns.',
    need: 'Just a name (everything else is optional).',
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    iconColor: 'text-[#137fec]',
    borderHover: 'hover:border-blue-400',
  },
  {
    key: 'quick',
    icon: Rows3,
    title: 'Quick Entry',
    badge: '5–20 items',
    badgeColor: 'bg-orange-100 text-orange-700',
    bestFor: 'You have a short list in your head (or on paper) and want to type it in fast.',
    description: 'A table opens directly on the page — type one item per row, tab across columns, and add as many rows as you need. No file to prepare. When you\'re done, click "Add All Items" and they\'re all saved at once.',
    need: 'Nothing — just type.',
    iconBg: 'bg-orange-50 dark:bg-orange-900/30',
    iconColor: 'text-orange-500',
    borderHover: 'hover:border-orange-400',
  },
  {
    key: 'bulk',
    icon: FileSpreadsheet,
    title: 'Bulk Upload',
    badge: '50+ items or migration',
    badgeColor: 'bg-green-100 text-green-700',
    bestFor: 'Migrating from another system, or you already have a spreadsheet with your full list.',
    description: 'Upload a CSV or paste a Google Sheets link. The system imports every row and gives you a detailed error report — each failed row tells you exactly which column is wrong and why, so you can fix and re-upload only the broken rows.',
    need: 'A CSV file or a shared Google Sheet.',
    iconBg: 'bg-green-50 dark:bg-green-900/30',
    iconColor: 'text-green-600',
    borderHover: 'hover:border-green-400',
  },
];

export default function AddClinicalDataModal({ tab, onClose, onPickSingle, onPickQuickEntry, onPickBulkUpload, onPickLibrary }) {
  const label = TAB_LABEL[tab] || 'Item';
  const ctx = TAB_CONTEXT[tab];

  const handlers = { library: onPickLibrary, single: onPickSingle, quick: onPickQuickEntry, bulk: onPickBulkUpload };
  const hidden = HIDDEN_OPTIONS[tab] || [];
  const visibleOptions = OPTIONS.filter(o => !hidden.includes(o.key));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start flex-shrink-0">
          <div>
            <h3 className="font-bold text-lg text-slate-800 dark:text-white">Add {label}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Choose how you'd like to add data</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 flex-shrink-0 ml-4">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* What is this? */}
          {ctx && (
            <div className="mx-6 mt-5 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{ctx.what}</p>
              <p className="text-xs text-slate-400 mt-1.5 italic">{ctx.example}</p>
            </div>
          )}

          {/* Options */}
          <div className="p-6 space-y-3">
            {visibleOptions.map(({ key, icon: Icon, title, badge, badgeColor, bestFor, description, need, iconBg, iconColor, borderHover }) => (
              <button
                key={key}
                onClick={handlers[key]}
                className={`w-full text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-700 ${borderHover} hover:shadow-sm dark:hover:border-slate-500 transition-all group`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <Icon size={20} className={iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-bold text-slate-800 dark:text-white">{title}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{bestFor}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
                    <p className="text-xs text-slate-400 mt-1.5">
                      <span className="font-semibold text-slate-500">You need:</span> {need}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 flex-shrink-0">
          All methods can be mixed — import the library first, then add one-offs over time, then bulk-upload if you ever migrate.
        </div>
      </div>
    </div>
  );
}
