import React, { useState, useEffect } from 'react';
import { Pill, Syringe, Loader2, ChevronDown } from 'lucide-react';
import API from '../services/api';

const InventoryStocks = ({ StockBadge, SectionHeader, searchQuery, isLowStock, medicineEnabled = true, consumableEnabled = true }) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState({ pharmacy: [], consumables: [] });
  const [pharmacyExpanded, setPharmacyExpanded] = useState(false);
  const [consumablesExpanded, setConsumablesExpanded] = useState(false);

  // Get current month name (e.g., "Jan")
  const currentMonth = new Date().toLocaleString('default', { month: 'short' });

  useEffect(() => {
    const fetchStock = async () => {
      setLoading(true);
      try {
        const { data } = await API.get('/inventory');
        
        const pharmacy = data.filter(i => i.type === 'Pharmacy');
        const consumables = data.filter(i => i.type === 'Consumable' || i.type === 'Asset');
        
        setItems({ pharmacy, consumables });
      } catch (err) {
        console.error("Failed to load stock data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStock();
  }, []);

  const filterData = (data) => {
    return data.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (item.manufacturer && item.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = isLowStock 
        ? (item.status === 'Low' || item.status === 'Critical' || item.status === 'Out of Stock') 
        : true;

      return matchesSearch && matchesStatus;
    });
  };

  const pharmacyData = filterData(items.pharmacy);
  const consumablesData = filterData(items.consumables);

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-slate-400"/></div>;

  const StockSection = ({ title, icon: Icon, colorClass, data, soldLabel, expanded, onToggle }) => (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden sm:h-full">
      <button onClick={onToggle} className="flex items-center justify-between w-full text-left flex-shrink-0">
        <SectionHeader title={title} icon={Icon} colorClass={colorClass} count={data.length} />
        <ChevronDown size={16} className={`mr-3 text-slate-400 transition-transform flex-shrink-0 ${expanded ? '' : '-rotate-90'}`} />
      </button>
      {expanded && (
        <>
          {/* Mobile cards — natural height, parent scrolls */}
          <div className="sm:hidden divide-y divide-slate-100">
            {data.map(item => (
              <div key={item._id} className="p-3 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-700 text-sm truncate">{item.name}</div>
                  <div className="text-xs text-slate-400">{item.manufacturer} · {item.category}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{soldLabel}: {item.usage_count > 0 ? item.usage_count : '-'}</div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-baseline gap-1">
                    <span className={`font-bold text-base ${item.stock_on_hand <= item.min_stock_level ? 'text-red-600' : 'text-slate-800'}`}>{item.stock_on_hand}</span>
                    <span className="text-[10px] text-slate-400">/ {item.min_stock_level}</span>
                  </div>
                  <StockBadge status={item.status} />
                </div>
              </div>
            ))}
            {data.length === 0 && <div className="p-4 text-center text-slate-400 text-xs">No items found.</div>}
          </div>
          {/* Desktop table — flex-1 to fill remaining height in grid cell */}
          <div className="hidden sm:block overflow-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 text-[11px] font-bold text-slate-500 uppercase">
                <tr>
                  <th className="p-3">Item Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-right">{soldLabel} ({currentMonth})</th>
                  <th className="p-3 text-right">Stock / Min</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {data.map(item => (
                  <tr key={item._id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-semibold text-slate-700">{item.name}</div>
                      <div className="text-xs text-slate-400">{item.manufacturer}</div>
                    </td>
                    <td className="p-3 text-slate-500 text-xs">{item.category}</td>
                    <td className="p-3 text-right font-medium text-slate-600">
                      {item.usage_count > 0 ? item.usage_count : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className={`font-bold text-md ${item.stock_on_hand <= item.min_stock_level ? 'text-red-600' : 'text-slate-800'}`}>{item.stock_on_hand}</span>
                        <span className="text-[10px] text-slate-400">Min: {item.min_stock_level}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center"><StockBadge status={item.status} /></td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="5" className="p-4 text-center text-slate-400 text-xs">No items found.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile: natural stacking column, page-level scroll */}
      <div className={`sm:hidden flex flex-col gap-4`}>
        {medicineEnabled && (
          <StockSection
            title="Pharmacy Stock" icon={Pill} colorClass="bg-blue-50/50"
            data={pharmacyData} soldLabel="Sold"
            expanded={pharmacyExpanded} onToggle={() => setPharmacyExpanded(v => !v)}
          />
        )}
        {consumableEnabled && (
          <StockSection
            title="In-Clinic Consumables" icon={Syringe} colorClass="bg-teal-50/50"
            data={consumablesData} soldLabel="Used"
            expanded={consumablesExpanded} onToggle={() => setConsumablesExpanded(v => !v)}
          />
        )}
      </div>
      {/* Desktop: side-by-side constrained grid */}
      <div className={`hidden sm:grid grid-cols-1 ${medicineEnabled && consumableEnabled ? 'lg:grid-cols-2' : ''} gap-6 h-full min-h-0`}>
        {medicineEnabled && (
          <StockSection
            title="Pharmacy Stock" icon={Pill} colorClass="bg-blue-50/50"
            data={pharmacyData} soldLabel="Sold"
            expanded={pharmacyExpanded} onToggle={() => setPharmacyExpanded(v => !v)}
          />
        )}
        {consumableEnabled && (
          <StockSection
            title="In-Clinic Consumables" icon={Syringe} colorClass="bg-teal-50/50"
            data={consumablesData} soldLabel="Used"
            expanded={consumablesExpanded} onToggle={() => setConsumablesExpanded(v => !v)}
          />
        )}
      </div>
    </>
  );
};

export default InventoryStocks;