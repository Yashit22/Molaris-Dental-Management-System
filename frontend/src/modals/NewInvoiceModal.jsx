import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Stethoscope, TestTube, Pill, Search, Loader2, Minus, ChevronUp, PlusCircle } from 'lucide-react';
import API from '../services/api';
import AddPatientModal from './AddPatientModal';

// ── Patient search (used when no initialPatient is provided) ──────────────────
const PatientSearchInput = ({ onSelect, onAddNew }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.length > 1) {
        setLoading(true);
        try {
          const { data } = await API.get(`/patients?search=${encodeURIComponent(query)}`);
          setResults(Array.isArray(data) ? data : []);
          setShowDropdown(true);
        } catch { /* ignore */ } finally { setLoading(false); }
      } else { setResults([]); setShowDropdown(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <input
          autoFocus
          type="text"
          placeholder="Search by name or phone..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.length > 1 && setShowDropdown(true)}
        />
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </div>
      </div>
      {showDropdown && (
        <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-56 overflow-y-auto">
          {results.length > 0 ? results.map(p => (
            <div
              key={p._id}
              className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0"
              onMouseDown={e => { e.preventDefault(); onSelect(p); setQuery(`${p.first_name} ${p.last_name || ''}`); setShowDropdown(false); }}
            >
              <div className="font-bold text-slate-800">{p.first_name} {p.last_name}</div>
              <div className="text-xs text-slate-500">{p.contact?.mobile || p.phone}</div>
            </div>
          )) : (
            <div
              className="p-3 text-center cursor-pointer hover:bg-slate-50 text-blue-600 font-bold text-sm"
              onClick={() => { onAddNew(query); setShowDropdown(false); }}
            >
              + Create new patient "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Searchable select for Services / Lab / Pharmacy items ─────────────────────
const ENDPOINTS = { Service: '/suggested-treatments', Lab: '/labs/items', Pharmacy: '/medicines' };

// Plain substring match — the typed run of letters must appear contiguously.
const substringMatch = (needle, haystack) =>
  (haystack || '').toLowerCase().includes(needle.toLowerCase());

const SearchableSelect = ({ placeholder, type, onSelect, onNameChange, initialValue = '' }) => {
  const [query, setQuery] = useState(initialValue);
  const [allItems, setAllItems] = useState([]);
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);
  const userTypedRef = useRef(false); // only show dropdown after user actively types

  // Sync from an external initialValue change (e.g. item pre-filled from the
  // visit, or reset). Because onNameChange pushes each keystroke up to the
  // parent, initialValue echoes back the value the user just typed — that echo
  // must NOT be treated as an external reset, or the dropdown would be closed on
  // every keystroke. Only react when initialValue genuinely differs from what
  // the field already shows.
  useEffect(() => {
    if (initialValue === query) return;
    setQuery(initialValue);
    userTypedRef.current = false;
    setShowDropdown(false);
  }, [initialValue]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reliable close on any click outside this field (blur alone is fragile)
  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Fetch catalog once on mount (or when type changes)
  useEffect(() => {
    API.get(ENDPOINTS[type]).then(({ data }) => {
      setAllItems(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, [type]);

  const handleQueryChange = (val) => {
    userTypedRef.current = true;
    setQuery(val);
    onNameChange?.(val);
  };

  // Debounced fuzzy filter — only runs after user has typed
  useEffect(() => {
    if (!userTypedRef.current) return;
    if (!query.trim()) { setResults([]); setShowDropdown(false); return; }
    const t = setTimeout(() => {
      const filtered = allItems.filter(item =>
        substringMatch(query, item.name) ||
        (item.composition && substringMatch(query, item.composition)) ||
        (item.category && substringMatch(query, item.category))
      );
      setResults(filtered);
      setShowDropdown(filtered.length > 0);
    }, 400);
    return () => clearTimeout(t);
  }, [query, allItems]);

  const getPrice = (item) => {
    if (type === 'Lab') return item.price;
    return item.cost;
  };

  return (
    <div className="relative flex-1" ref={containerRef}>
      <input
        className="w-full border border-slate-200 rounded-md text-sm py-1.5 px-2 focus:outline-none focus:border-[#137fec]"
        placeholder={placeholder}
        value={query}
        onChange={e => handleQueryChange(e.target.value)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
      />
      {showDropdown && results.length > 0 && (
        <div className="absolute z-[200] w-full bg-white border border-slate-200 rounded-md shadow-xl mt-1 max-h-48 overflow-auto">
          {results.map(item => (
            <div
              key={item._id}
              className="p-2 hover:bg-slate-50 cursor-pointer text-sm flex justify-between items-center gap-2"
              onMouseDown={e => { e.preventDefault(); onSelect(item); setQuery(item.name); setShowDropdown(false); }}
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{item.name}</div>
                  {type === 'Lab' && item.turnaround_time && <div className="text-[10px] text-slate-400">{item.turnaround_time}</div>}
              </div>
              <span className="text-[#137fec] font-bold text-xs flex-shrink-0">₹{getPrice(item)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


// ── Main Modal ────────────────────────────────────────────────────────────────
/**
 * Props:
 *   isOpen          — boolean (ignored in inline mode)
 *   onClose         — () => void
 *   onSuccess       — (invoice) => void
 *   initialPatient  — patient object (pre-selects patient, hides search)
 *   initialItems    — array of { name, type, quantity, rate, total, item_id,
 *                                _treatmentRef?, _prescriptionRef? }
 *   visitRefs       — { treatmentRefs: [{visitId,treatmentId}],
 *                       prescriptionRefs: [{visitId,prescriptionId}] }
 *   inline          — render as embedded panel instead of a portal modal
 */
const NewInvoiceModal = forwardRef(function NewInvoiceModal({
  isOpen,
  onClose,
  onSuccess,
  initialPatient = null,
  initialItems = null,
  visitRefs = null,
  suggestedTreatments = null,
  suggestedVisitId = null,
  editInvoice = null,
  visitId = null,
  appointmentId = null,
  inline = false,
}, ref) {
  const today = new Date().toISOString().split('T')[0];
  const [minimized, setMinimized] = useState(false);
  const [patientInfo, setPatientInfo] = useState({ name: '', phone: '', id: null });
  const [items, setItems] = useState([]);
  const [date, setDate] = useState(today);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Expose save() so parent can auto-trigger on tab open / treatment change.
  // The hook is declared BEFORE any early return so the hook order stays stable.
  // It calls through a ref that always points at the latest handleSubmit closure.
  const handleSubmitRef = useRef(null);
  useImperativeHandle(ref, () => ({ save: () => handleSubmitRef.current?.() }), []);

  // Sync patient when initialPatient loads/changes
  useEffect(() => {
    if (!initialPatient) return;
    setPatientInfo({
      name:  `${initialPatient.first_name} ${initialPatient.last_name || ''}`.trim(),
      phone: initialPatient.contact?.mobile || '',
      id:    initialPatient._id,
    });
  }, [initialPatient?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate form items. Two cases:
  //  1. editInvoice is set (existing invoice for this visit) → load its saved items
  //  2. no editInvoice → load from initialItems (visit treatments pre-fill)
  // Re-runs when the source changes so newly added treatments appear automatically.
  const editInvoiceId  = editInvoice?._id;
  const initialItemsSig = JSON.stringify(
    (initialItems || []).map(it => [it.name, it.type, it.quantity, it.rate, it._treatmentRef?.treatmentId, it._prescriptionRef?.prescriptionId])
  );
  // Inline seeding = MERGE of two sources, so nothing is ever clobbered:
  //   1. editInvoice.items — the saved invoice (includes custom services/lab orders)
  //   2. initialItems — treatments/prescriptions from the dental chart
  // Treatment/prescription seeds are added only if not already represented in the
  // saved invoice (matched by name+type), so custom items always survive a reload.
  useEffect(() => {
    if (!inline) return;

    const saved = (editInvoice?.items || []).map(it => ({
      name:             it.name || '',
      type:             it.type || 'Service',
      quantity:         it.quantity || 1,
      rate:             it.rate || 0,
      total:            it.total != null ? it.total : (it.rate || 0) * (it.quantity || 1),
      item_id:          it.item_id || null,
      _treatmentRef:    null,
      _prescriptionRef: null,
    }));

    // Key used to detect whether a chart seed is already on the saved invoice.
    const savedKeys = new Set(saved.map(it => `${it.type}::${it.name.trim().toLowerCase()}`));

    const seeds = (initialItems || [])
      .map(it => ({
        name:             it.name || '',
        type:             it.type || 'Service',
        quantity:         it.quantity || 1,
        rate:             it.rate || 0,
        total:            it.total || 0,
        item_id:          it.item_id || null,
        _treatmentRef:    it._treatmentRef || null,
        _prescriptionRef: it._prescriptionRef || null,
      }))
      // Only add chart seeds not already present on the saved invoice.
      .filter(it => it.name.trim() && !savedKeys.has(`${it.type}::${it.name.trim().toLowerCase()}`));

    setItems([...saved, ...seeds]);

    if (editInvoice) {
      setPatientInfo(p => p.id ? p : {
        name:  editInvoice.patient_name || '',
        phone: editInvoice.patient_phone || '',
        id:    editInvoice.patient_id || null,
      });
      setDate((editInvoice.date || editInvoice.createdAt || today).toString().split('T')[0]);
    }
  }, [editInvoiceId, initialItemsSig, inline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset & pre-fill when portal modal opens
  useEffect(() => {
    if (inline) return; // inline handled above
    if (!isOpen) return;
    setMinimized(false);
    setDate(today);
    setSubmitting(false);
    setAttempted(false);
    setSuccessMsg('');

    if (editInvoice) {
      setPatientInfo({
        name:  editInvoice.patient_name || (initialPatient ? `${initialPatient.first_name} ${initialPatient.last_name || ''}`.trim() : ''),
        phone: editInvoice.patient_phone || initialPatient?.contact?.mobile || '',
        id:    editInvoice.patient_id || initialPatient?._id || null,
      });
      setDate((editInvoice.date || editInvoice.createdAt || today).toString().split('T')[0]);
      const invItems = (editInvoice.items || []).map(it => ({
        name:             it.name || '',
        type:             it.type || 'Service',
        quantity:         it.quantity || 1,
        rate:             it.rate || 0,
        total:            it.total != null ? it.total : (it.rate || 0) * (it.quantity || 1),
        item_id:          it.item_id || null,
        _treatmentRef:    null,
        _prescriptionRef: null,
      }));
      setItems(invItems);
      return;
    }

    if (initialPatient) {
      setPatientInfo({
        name:  `${initialPatient.first_name} ${initialPatient.last_name || ''}`.trim(),
        phone: initialPatient.contact?.mobile || '',
        id:    initialPatient._id,
      });
    } else {
      setPatientInfo({ name: '', phone: '', id: null });
    }

    if (initialItems?.length > 0) {
      setItems(initialItems.map(it => ({
        name:             it.name || '',
        type:             it.type || 'Service',
        quantity:         it.quantity || 1,
        rate:             it.rate || 0,
        total:            it.total || 0,
        item_id:          it.item_id || null,
        _treatmentRef:    it._treatmentRef || null,
        _prescriptionRef: it._prescriptionRef || null,
      })));
    } else {
      setItems([]);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps


  if (!isOpen && !inline) return null;

  if (minimized && !inline) {
    return createPortal(
      <div
        className="fixed bottom-4 right-4 z-[500] flex items-center gap-3 bg-white border border-slate-200 rounded-xl shadow-2xl px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setMinimized(false)}
      >
        <div>
          <p className="text-sm font-bold text-slate-800">New Invoice</p>
          {patientInfo.name && <p className="text-xs text-slate-500">{patientInfo.name} · {items.length} item{items.length !== 1 ? 's' : ''}</p>}
        </div>
        <ChevronUp size={18} className="text-slate-400" />
      </div>,
      document.body
    );
  }

  // ── Item helpers ────────────────────────────────────────────────────────────
  const addItem = (type) =>
    setItems(prev => [...prev, { name: '', type, quantity: 1, rate: 0, total: 0, item_id: null, _treatmentRef: null, _prescriptionRef: null }]);

  const updateItem = (idx, field, value) =>
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      if (field === 'quantity' || field === 'rate')
        updated.total = Number(updated.quantity) * Number(updated.rate);
      return updated;
    }));

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const subtotal = items.reduce((acc, it) => acc + (it.total || 0), 0);

  // ── Validation ──────────────────────────────────────────────────────────────
  const itemErrors = items.map(it => ({
    name:     !it.name?.trim(),
    rate:     Number(it.rate) < 0,          // negative rate is invalid; 0 is allowed
    quantity: !(Number(it.quantity) > 0),
  }));
  const hasItemErrors = itemErrors.some(e => e.name || e.rate || e.quantity);
  const isValid =
    !!patientInfo.id &&
    !!date &&
    items.length > 0 &&
    !hasItemErrors;

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setAttempted(true);
    if (!isValid) return;
    setSubmitting(true);
    try {
      const payload = {
        patient_name:   patientInfo.name,
        patient_phone:  patientInfo.phone,
        patient_id:     patientInfo.id,
        visit_id:       visitId || null,
        appointment_id: appointmentId || null,
        date,
        items: items.filter(it => it.name?.trim()).map(it => ({
          name:       it.name,
          type:       it.type,
          quantity:   it.quantity,
          rate:       it.rate,
          total:      it.total,
          item_id:    it.item_id,
        })),
        subtotal,
        total_amount: subtotal,
      };

      // Update existing invoice, or create a new one
      const savedInvoice = editInvoice?._id
        ? (await API.put(`/invoices/${editInvoice._id}`, payload)).data
        : (await API.post('/invoices', payload)).data;

      // Mark treatments & prescriptions as invoiced
      const treatmentRefs = items.filter(it => it._treatmentRef).map(it => it._treatmentRef);
      const prescriptionRefs = items.filter(it => it._prescriptionRef).map(it => it._prescriptionRef);

      // Also include refs passed explicitly via visitRefs prop
      const allTreatmentRefs = [
        ...treatmentRefs,
        ...(visitRefs?.treatmentRefs || []),
      ];
      const allPrescriptionRefs = [
        ...prescriptionRefs,
        ...(visitRefs?.prescriptionRefs || []),
      ];

      if (allTreatmentRefs.length > 0 || allPrescriptionRefs.length > 0) {
        await API.post('/visits/mark-invoiced', {
          invoice_id:       savedInvoice._id,
          treatment_refs:   allTreatmentRefs,
          prescription_refs: allPrescriptionRefs,
        });
      }

      onSuccess?.(savedInvoice);
      if (inline) {
        // Don't clear items — the sync effect re-populates from the refreshed visit.
        setAttempted(false);
        setSuccessMsg(`Invoice ${savedInvoice.invoice_id || ''} saved.`);
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message || 'Unknown error';
      alert(`Error ${editInvoice ? 'updating' : 'creating'} invoice: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Keep the ref pointing at the latest handleSubmit so the stable save() above
  // always invokes the current closure (current items / editInvoice).
  handleSubmitRef.current = handleSubmit;

  // ── Shared render helpers ────────────────────────────────────────────────────
  const typeBadge = { Service: 'SVC', Lab: 'LAB', Pharmacy: 'MED' };
  const typeColor = { Service: 'text-blue-600', Lab: 'text-purple-600', Pharmacy: 'text-emerald-600' };

  const formBody = (
    <>
      {/* Patient */}
      <div className={`mb-6 p-4 rounded-xl border ${attempted && !patientInfo.id ? 'bg-red-50 border-red-200' : 'bg-blue-50/50 border-blue-100'}`}>
        {initialPatient ? (
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Patient <span className="text-red-500">*</span></label>
            <div className="flex gap-3 mt-1">
              <input disabled className="flex-1 border p-2 rounded text-sm bg-slate-100 font-bold text-slate-700" value={patientInfo.name} />
              <input disabled className="w-36 border p-2 rounded text-sm bg-slate-100 text-slate-500" value={patientInfo.phone} />
            </div>
          </div>
        ) : (
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Patient Search <span className="text-red-500">*</span></label>
              <div className="mt-1">
                <PatientSearchInput
                  onSelect={p => setPatientInfo({ name: `${p.first_name} ${p.last_name || ''}`.trim(), phone: p.contact?.mobile || p.phone || '', id: p._id })}
                  onAddNew={() => setShowAddPatient(true)}
                />
              </div>
            </div>
            <div className="flex-[1.5]">
              <label className="text-xs font-bold text-slate-500 uppercase">Selected</label>
              <div className="flex gap-2 mt-1">
                <input disabled className="flex-1 border p-2 rounded text-sm bg-slate-100 font-bold text-slate-700" value={patientInfo.name} placeholder="Name" />
                <input disabled className="w-32 border p-2 rounded text-sm bg-slate-100 text-slate-500" value={patientInfo.phone} placeholder="Phone" />
              </div>
            </div>
          </div>
        )}
        {attempted && !patientInfo.id && <p className="text-xs text-red-500 mt-1">Please select a patient.</p>}
        <div className="mt-3">
          <label className="text-xs font-bold text-slate-500 uppercase">Invoice Date <span className="text-red-500">*</span></label>
          <input
            type="date"
            className={`w-full border p-2 rounded mt-1 text-sm ${attempted && !date ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          {attempted && !date && <p className="text-xs text-red-500 mt-1">Date is required.</p>}
        </div>
      </div>

      {/* Suggested Treatments from Visit */}
      {suggestedTreatments && suggestedTreatments.length > 0 && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">Suggested from Visit Plan</p>
          <div className="flex flex-col gap-1.5">
            {suggestedTreatments.map((t, i) => {
              const alreadyAdded = items.some(it => it.name === t.treatment_name);
              const teeth = (t.teeth_numbers || []).filter(n => !isNaN(Number(n)));
              const label = teeth.length ? `${t.treatment_name} (Teeth ${teeth.join(', ')})` : t.treatment_name;
              return (
                <div key={i} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-amber-100">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{label}</p>
                    <p className="text-xs text-slate-400">{t.status} · ₹{t.cost || 0}</p>
                  </div>
                  <button
                    disabled={alreadyAdded}
                    onClick={() => {
                      if (alreadyAdded) return;
                      setItems(prev => [...prev, {
                        name: t.treatment_name, type: 'Service',
                        quantity: t.qty || 1, rate: t.cost || 0,
                        total: (t.cost || 0) * (t.qty || 1), item_id: null,
                        _treatmentRef: (suggestedVisitId && t._id) ? { visitId: suggestedVisitId, treatmentId: t._id } : null,
                      }]);
                    }}
                    className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors ${alreadyAdded ? 'bg-green-50 text-green-600 cursor-default' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}
                  >
                    {alreadyAdded ? '✓ Added' : <><PlusCircle size={13} /> Add</>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-slate-700">Bill Items <span className="text-red-500">*</span></label>
          <div className="flex gap-2">
            <button onClick={() => addItem('Service')} className="text-xs flex items-center gap-1 text-slate-600 hover:text-blue-600 font-bold border px-2 py-1 rounded">
              <Stethoscope size={12} /> Service
            </button>
            <button onClick={() => addItem('Lab')} className="text-xs flex items-center gap-1 text-slate-600 hover:text-purple-600 font-bold border px-2 py-1 rounded">
              <TestTube size={12} /> Lab
            </button>
            <button onClick={() => addItem('Pharmacy')} className="text-xs flex items-center gap-1 text-slate-600 hover:text-emerald-600 font-bold border px-2 py-1 rounded">
              <Pill size={12} /> Medicine
            </button>
          </div>
        </div>

        <div className={`bg-slate-50 border rounded-lg overflow-visible ${attempted && (items.length === 0 || hasItemErrors) ? 'border-red-300' : 'border-slate-200'}`}>
          {items.length === 0 && (
            <div className="py-8 text-center text-slate-400 text-sm">
              No items added. Use the buttons above to add Services or Lab charges.
            </div>
          )}
          {items.map((item, idx) => {
            const err = itemErrors[idx] || {};
            return (
              <div key={idx} className="flex gap-2 p-2 border-b last:border-0 items-center">
                <span className={`text-xs w-8 font-bold ${typeColor[item.type]}`}>{typeBadge[item.type]}</span>
                <div className={`flex-1 ${attempted && err.name ? 'ring-1 ring-red-400 rounded-md' : ''}`}>
                  <SearchableSelect
                    type={item.type}
                    initialValue={item.name}
                    placeholder={item.type === 'Lab' ? 'Search Lab Item *' : item.type === 'Pharmacy' ? 'Search Medicine *' : 'Search Service *'}
                    onNameChange={val => setItems(prev => prev.map((it, i) => i === idx ? { ...it, name: val } : it))}
                    onSelect={data => {
                      const rate = item.type === 'Lab' ? (data.price || 0) : (data.cost || 0);
                      setItems(prev => prev.map((it, i) => i === idx ? { ...it, name: data.name, item_id: data._id, rate, total: rate * it.quantity } : it));
                    }}
                  />
                </div>
                <input
                  type="number"
                  className={`w-14 border rounded-md text-sm py-1.5 text-center focus:outline-none focus:border-[#137fec] ${attempted && err.quantity ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                  value={item.quantity} min={1}
                  onChange={e => updateItem(idx, 'quantity', e.target.value)}
                />
                <input
                  type="number"
                  className={`w-20 border rounded-md text-sm py-1.5 text-right px-1 focus:outline-none focus:border-[#137fec] ${attempted && err.rate ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                  placeholder="Rate *" value={item.rate}
                  onChange={e => updateItem(idx, 'rate', e.target.value)}
                />
                <span className="w-20 text-right font-bold text-sm text-slate-700">₹{item.total}</span>
                <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>
        {attempted && items.length === 0 && <p className="text-xs text-red-500 mt-1">Add at least one item.</p>}
        {attempted && items.length > 0 && hasItemErrors && <p className="text-xs text-red-500 mt-1">Each item must have a name and quantity ≥ 1.</p>}
      </div>

      {/* Total */}
      <div className="border-t pt-4">
        <div className="flex justify-between">
          <span className="text-slate-500">Total Amount</span>
          <span className="text-xl font-bold text-slate-900">₹{subtotal}</span>
        </div>
      </div>
    </>
  );

  const submitButton = (
    <button
      onClick={handleSubmit}
      disabled={submitting}
      className="w-full py-3 bg-[#137fec] hover:bg-blue-600 text-white font-bold rounded-lg shadow-lg disabled:opacity-60"
    >
      {submitting ? 'Saving...' : 'Save Changes'}
    </button>
  );

  const addPatientModal = (
    <AddPatientModal
      isOpen={showAddPatient}
      onClose={() => setShowAddPatient(false)}
      onSave={p => {
        setShowAddPatient(false);
        setPatientInfo({ name: `${p.first_name} ${p.last_name || ''}`.trim(), phone: p.contact?.mobile || '', id: p._id });
      }}
    />
  );

  // ── Inline (embedded panel) mode ─────────────────────────────────────────────
  if (inline) {
    return (
      <>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <h3 className="text-base font-bold text-slate-800">{editInvoice ? `Edit Invoice ${editInvoice.invoice_id || ''}` : 'New Invoice'}</h3>
          </div>

          {successMsg && (
            <div className="mx-5 mt-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
              {successMsg}
            </div>
          )}

          <div className="p-5">
            {formBody}
          </div>
          <div className="px-5 pb-5">
            {attempted && !patientInfo.id && (
              <p className="text-xs text-red-500 mb-2">Patient not loaded — please refresh and try again.</p>
            )}
            {submitButton}
          </div>
        </div>
        {addPatientModal}
      </>
    );
  }

  // ── Portal (slide-over modal) mode ───────────────────────────────────────────
  return createPortal(
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[300] flex justify-end" onClick={onClose}>
        <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 className="text-lg font-bold text-slate-900">{editInvoice ? `Invoice ${editInvoice.invoice_id || ''}`.trim() : 'New Invoice'}</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setMinimized(true)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500" title="Minimise">
                <Minus size={18} />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500" title="Close">
                <X size={24} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">{formBody}</div>
          <div className="p-6 border-t bg-slate-50">{submitButton}</div>
        </div>
      </div>
      {addPatientModal}
    </>,
    document.body
  );
});

export default NewInvoiceModal;
