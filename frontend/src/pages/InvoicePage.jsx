import React, { useState, useEffect, useMemo } from 'react';
import { Plus, X, Mail, Loader2, Receipt, Search, Filter } from 'lucide-react';
import API from '../services/api';
import NewInvoiceModal from '../modals/NewInvoiceModal.jsx';


// --- VIEW INVOICE MODAL ---
const ViewInvoiceModal = ({ invoiceId, onClose }) => {
  const [invoice, setInvoice] = useState(null);
  const [branding, setBranding] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!invoiceId) return;
    setLoading(true);
    Promise.all([
      API.get(`/invoices/${invoiceId}`),
      API.get('/documents/settings'),
    ])
      .then(([invRes, brandRes]) => {
        setInvoice(invRes.data);
        setBranding(brandRes.data || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [invoiceId]);

  if (!invoiceId) return null;

  const cur = branding?.currency_symbol || '₹';
  const paymentModes = (branding?.payment_modes || []);
  const showPayment = branding?.invoice_show_payment !== false && paymentModes.length > 0;

  const handleShareMail = () => {
    if (!invoice) return;
    const bankLines = paymentModes
      .filter(m => m.type === 'bank')
      .map(m => [
        m.label && `${m.label}:`,
        m.beneficiary && `Beneficiary: ${m.beneficiary}`,
        m.details && `A/C No: ${m.details}`,
        m.bank_name && `Bank: ${m.bank_name}`,
        m.branch && `Branch: ${m.branch}`,
        m.ifsc && `IFSC: ${m.ifsc}`,
      ].filter(Boolean).join('\n'))
      .join('\n\n');
    const upiLines = paymentModes
      .filter(m => m.type !== 'bank' && m.details)
      .map(m => `${m.label || 'UPI'}: ${m.details}`)
      .join('\n');
    const paymentSection = [bankLines, upiLines].filter(Boolean).join('\n\n');

    const subject = `Invoice ${invoice.invoice_id}`;
    const body = [
      `Dear ${invoice.patient_name},`,
      ``,
      `Invoice #${invoice.invoice_id}`,
      `Total: ${cur}${invoice.total_amount}`,
      paymentSection ? `\nPayment Details:\n${paymentSection}` : '',
      ``,
      `Thank you.`,
    ].join('\n');
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#137fec]/10 to-white px-6 py-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#137fec]/10 rounded-lg"><Receipt size={20} className="text-[#137fec]" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                {invoice ? `Invoice #${invoice.invoice_id}` : 'Loading…'}
              </h2>
              {invoice && <p className="text-xs text-slate-500">{invoice.patient_name} · {new Date(invoice.date || invoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {invoice && (
              <button onClick={handleShareMail} title="Email" className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors"><Mail size={17} /></button>
            )}
            <button onClick={onClose} className="ml-1 p-2 hover:bg-red-50 hover:text-red-500 text-slate-400 rounded-lg transition-colors"><X size={20} /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-[#137fec]" size={28} /></div>
          ) : invoice ? (
            <div className="p-6 space-y-6">

              {/* Clinic + Patient */}
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-lg font-bold text-[#137fec]">{branding?.clinic_name || 'Dental Clinic'}</p>
                  {branding?.tagline && <p className="text-xs text-slate-400 italic mt-0.5">{branding.tagline}</p>}
                  {(branding?.address || branding?.city) && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {[branding.address, branding.city, branding.state, branding.pincode].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {branding?.phone && <p className="text-xs text-slate-400">Ph: {branding.phone}</p>}
                  {branding?.gstin && <p className="text-xs text-slate-400">GSTIN: {branding.gstin}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 uppercase font-semibold">Bill To</p>
                  <p className="font-bold text-slate-800">{invoice.patient_name}</p>
                  <p className="text-xs text-slate-500">{invoice.patient_phone}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(invoice.date || invoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[360px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                    <tr>
                      <th className="px-4 py-3 text-left">Item</th>
                      <th className="px-4 py-3 text-center">Qty</th>
                      <th className="px-4 py-3 text-right">Rate</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoice.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{item.name}</div>
                          <div className="text-xs text-slate-400">{item.type}</div>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{cur}{Number(item.rate).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">{cur}{Number(item.total).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-full sm:w-64 space-y-1.5">
                  {invoice.subtotal != null && invoice.subtotal !== invoice.total_amount && (
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>Subtotal</span><span>{cur}{Number(invoice.subtotal).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {invoice.tax > 0 && branding?.invoice_show_gst !== false && (
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>{branding?.gstin ? 'GST' : 'Tax'}</span><span>{cur}{Number(invoice.tax).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base text-slate-800 border-t border-slate-200 pt-2 mt-1">
                    <span>Total</span><span>{cur}{Number(invoice.total_amount).toLocaleString('en-IN')}</span>
                  </div>
                  {invoice.paid_amount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Paid</span><span>{cur}{Number(invoice.paid_amount).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {invoice.pending_amount > 0 && (
                    <div className="flex justify-between text-sm font-semibold text-red-500">
                      <span>Pending</span><span>{cur}{Number(invoice.pending_amount).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Options */}
              {showPayment && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-3">Payment Options</p>
                  <div className="flex flex-wrap gap-4">
                    {paymentModes.map((m, i) => (
                      <div key={i} className="min-w-[160px] bg-slate-50 rounded-xl p-3 border border-slate-200">
                        <p className="text-xs font-bold text-slate-700 mb-1">{m.label || (m.type === 'bank' ? 'Bank Transfer' : 'UPI')}</p>
                        {m.type === 'bank' ? (
                          <div className="space-y-0.5 text-xs text-slate-500">
                            {m.beneficiary && <p><span className="text-slate-400">Beneficiary:</span> {m.beneficiary}</p>}
                            {m.details && <p><span className="text-slate-400">A/C No:</span> {m.details}</p>}
                            {m.bank_name && <p><span className="text-slate-400">Bank:</span> {m.bank_name}</p>}
                            {m.branch && <p><span className="text-slate-400">Branch:</span> {m.branch}</p>}
                            {m.ifsc && <p><span className="text-slate-400">IFSC:</span> <span className="font-mono font-semibold text-slate-700">{m.ifsc}</span></p>}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-600">
                            {m.details && <p className="font-mono font-semibold">{m.details}</p>}
                            {m.qr_url && <img src={m.qr_url} alt="QR" className="mt-2 h-20 w-20 object-contain" />}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="flex justify-center items-center h-64 text-slate-400">Invoice not found.</div>
          )}
        </div>
      </div>
    </div>
  );
};


// --- MAIN PAGE ---
const InvoicesPage = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewInvoiceId, setViewInvoiceId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/invoices');
      setInvoices(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchInvoices(); }, []);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const searchLower = searchQuery.toLowerCase().trim();
      const matchesSearch = !searchLower ||
        inv.invoice_id.toLowerCase().includes(searchLower) ||
        inv.patient_name.toLowerCase().includes(searchLower) ||
        (inv.patient_phone && inv.patient_phone.includes(searchLower));

      const invDate = new Date(inv.date || inv.createdAt);
      let matchesDateFrom = true;
      let matchesDateTo = true;

      if (dateFrom && !dateTo) {
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateFrom);
        toDate.setHours(23, 59, 59, 999);
        matchesDateFrom = invDate >= fromDate && invDate <= toDate;
      } else {
        if (dateFrom) matchesDateFrom = invDate >= new Date(dateFrom);
        if (dateTo)   matchesDateTo   = invDate <= new Date(new Date(dateTo).setHours(23, 59, 59, 999));
      }

      return matchesSearch && matchesDateFrom && matchesDateTo;
    });
  }, [invoices, searchQuery, dateFrom, dateTo]);

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  const hasActiveFilters = searchQuery || dateFrom || dateTo;

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <header className="pb-6 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <div><h1 className="text-2xl font-bold text-slate-900 tracking-tight">Invoices</h1><p className="text-slate-500 mt-1">Manage billing</p></div>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600 shadow-lg text-sm font-bold">
            <Plus size={20} /> New Invoice
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search invoice ID, name, phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] text-sm"
            />
          </div>

          <div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center w-full lg:w-auto">
            <div className="w-full lg:w-auto">
              <label className="text-xs font-semibold text-slate-600 block mb-0.5">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full lg:w-40 px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#137fec] text-sm" />
            </div>
            <div className="w-full lg:w-auto">
              <label className="text-xs font-semibold text-slate-600 block mb-0.5">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full lg:w-40 px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#137fec] text-sm" />
            </div>
            {hasActiveFilters && (
              <>
                <button onClick={() => { setSearchQuery(''); setDateFrom(''); setDateTo(''); }}
                  className="w-full lg:w-auto px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg hover:bg-blue-50 whitespace-nowrap">
                  Clear
                </button>
                <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
                  {filteredInvoices.length}/{invoices.length}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto relative z-0 mt-6">
        {filteredInvoices.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Filter size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 text-sm font-medium">No invoices found</p>
              <p className="text-slate-400 text-xs mt-1">
                {hasActiveFilters ? 'Try adjusting your filters' : 'Create your first invoice'}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Patient</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredInvoices.map(inv => (
                  <tr key={inv._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <button onClick={() => setViewInvoiceId(inv._id)}
                        className="font-semibold text-[#137fec] hover:underline focus:outline-none">
                        {inv.invoice_id}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">{inv.patient_name}</div>
                      <div className="text-xs text-slate-500">{inv.patient_phone}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(inv.date || inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">
                      ₹{Number(inv.total_amount).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ViewInvoiceModal invoiceId={viewInvoiceId} onClose={() => setViewInvoiceId(null)} />

      <NewInvoiceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => fetchInvoices()}
      />
    </div>
  );
};

export default InvoicesPage;
