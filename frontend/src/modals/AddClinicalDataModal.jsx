import React from 'react';
import { X, Plus, FileSpreadsheet, BookOpen, Rows3 } from 'lucide-react';

const TAB_LABEL = {
  findings: 'Clinical Finding',
  diagnoses: 'Diagnosis',
  treatments: 'Suggested Treatment',
};

export default function AddClinicalDataModal({ tab, onClose, onPickSingle, onPickQuickEntry, onPickBulkUpload, onPickLibrary }) {
  const label = TAB_LABEL[tab] || 'Item';

  const options = [
    {
      key: 'single',
      icon: Plus,
      title: 'Add One',
      sub: `Open a form and add a single ${label.toLowerCase()}.`,
      onClick: onPickSingle,
      iconBg: 'bg-blue-50 dark:bg-blue-900/30',
      iconColor: 'text-[#137fec]',
    },
    {
      key: 'quick',
      icon: Rows3,
      title: 'Quick Entry',
      sub: 'Add several items by typing them row-by-row in a table.',
      onClick: onPickQuickEntry,
      iconBg: 'bg-orange-50 dark:bg-orange-900/30',
      iconColor: 'text-orange-500',
    },
    {
      key: 'bulk',
      icon: FileSpreadsheet,
      title: 'Bulk Upload',
      sub: 'Upload a CSV file or paste a Google Sheets URL. Errors are shown by row.',
      onClick: onPickBulkUpload,
      iconBg: 'bg-green-50 dark:bg-green-900/30',
      iconColor: 'text-green-600',
    },
    {
      key: 'library',
      icon: BookOpen,
      title: 'Import from Library',
      sub: 'Pick from our curated dental starter catalog — edit before importing.',
      onClick: onPickLibrary,
      iconBg: 'bg-purple-50 dark:bg-purple-900/30',
      iconColor: 'text-purple-600',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg text-slate-800 dark:text-white">Add {label}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Choose how you'd like to add data</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><X size={20} /></button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {options.map(({ key, icon: Icon, title, sub, onClick, iconBg, iconColor }) => (
            <button
              key={key}
              onClick={onClick}
              className="text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-[#137fec] hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors group"
            >
              <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>
                <Icon size={20} className={iconColor} />
              </div>
              <p className="font-bold text-slate-800 dark:text-white">{title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{sub}</p>
            </button>
          ))}
        </div>

        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
          Tip: <b>Bulk Upload</b> tells you exactly which row and column failed, so you can fix the sheet and try again.
        </div>
      </div>
    </div>
  );
}
