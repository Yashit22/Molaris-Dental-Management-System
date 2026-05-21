import { runBulkInsert } from '../utils/csvBulkUpload.js';

// ============================================================================
//                       INVENTORY SETTINGS (per-tenant)
// ============================================================================

// GET /api/inventory/settings — returns the singleton settings doc, creating
// it on first read with defaults (both inventory types enabled).
export async function getInventorySettings(req, res) {
  const { InventorySettings } = req.tenantModels;
  try {
    let settings = await InventorySettings.findOne({});
    if (!settings) {
      settings = await InventorySettings.create({});
    }
    res.json({
      medicineEnabled: settings.medicineEnabled,
      consumableEnabled: settings.consumableEnabled,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PUT /api/inventory/settings — upsert the singleton settings doc.
export async function updateInventorySettings(req, res) {
  const { InventorySettings } = req.tenantModels;
  try {
    const update = {};
    if (req.body.medicineEnabled !== undefined) update.medicineEnabled = !!req.body.medicineEnabled;
    if (req.body.consumableEnabled !== undefined) update.consumableEnabled = !!req.body.consumableEnabled;

    const settings = await InventorySettings.findOneAndUpdate(
      {},
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({
      medicineEnabled: settings.medicineEnabled,
      consumableEnabled: settings.consumableEnabled,
    });
  } catch (err) { res.status(400).json({ error: err.message }); }
}

// ============================================================================
//                BULK UPLOAD MEDICINES (via Google Sheets URL or CSV rows)
// ============================================================================

// Helpers to parse loose numeric fields like "₹500", "1,200", "abc"
function parseMoney(v) {
  if (v == null || v === '') return 0;
  const cleaned = String(v).replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function isUnparsableNumber(v) {
  if (v == null || v === '') return false; // empty is OK — treat as 0
  return !/[0-9]/.test(String(v));
}

// POST /api/inventory/bulk-upload-medicines
// Accepts { sheetUrl } OR { rows: [{ name, composition, manufacturer, category, cost_price, selling_price }] }
export async function bulkUploadMedicines(req, res) {
  const { InventoryItem } = req.tenantModels;
  try {
    const existing = await InventoryItem.find({ type: 'Pharmacy' }, 'name').lean();
    const existingKeys = new Set(existing.map(i => String(i.name).trim().toLowerCase()));

    const result = await runBulkInsert({
      body: req.body,
      requiredHeaders: ['name'],
      existingKeys,
      validateRow: (row) => {
        if (!row.name) return { column: 'name', value: '', message: 'Name is required' };
        if (row.name.length > 200) return { column: 'name', value: row.name, message: 'Name is too long (max 200 chars)' };
        const costCell = row['cost price'] ?? row.costprice ?? row.cost;
        if (isUnparsableNumber(costCell)) return { column: 'cost price', value: costCell, message: 'Cost price must be a number' };
        const sellCell = row['selling price'] ?? row.sellingprice ?? row.selling;
        if (isUnparsableNumber(sellCell)) return { column: 'selling price', value: sellCell, message: 'Selling price must be a number' };
        return null;
      },
      dedupeKey: (row) => row.name,
      transformRow: (row) => ({
        name: row.name,
        type: 'Pharmacy',
        composition:   row.composition  || '',
        manufacturer:  row.manufacturer || '',
        category:      row.category     || '',
        cost_price:    parseMoney(row['cost price']    ?? row.costprice    ?? row.cost),
        selling_price: parseMoney(row['selling price'] ?? row.sellingprice ?? row.selling),
      }),
      Model: InventoryItem,
    });
    res.json(result);
  } catch (err) {
    console.error('bulkUploadMedicines error:', err);
    res.status(err.status || 500).json({ error: err.userMessage || err.message });
  }
}

// POST /api/inventory/bulk-upload-consumables
// Accepts { sheetUrl } OR { rows: [...] }
export async function bulkUploadConsumables(req, res) {
  const { InventoryItem } = req.tenantModels;
  try {
    const existing = await InventoryItem.find({ type: 'Consumable' }, 'name').lean();
    const existingKeys = new Set(existing.map(i => String(i.name).trim().toLowerCase()));

    const result = await runBulkInsert({
      body: req.body,
      requiredHeaders: ['name'],
      existingKeys,
      validateRow: (row) => {
        if (!row.name) return { column: 'name', value: '', message: 'Name is required' };
        const costCell = row['cost price'] ?? row.costprice ?? row.cost;
        if (isUnparsableNumber(costCell)) return { column: 'cost price', value: costCell, message: 'Cost price must be a number' };
        return null;
      },
      dedupeKey: (row) => row.name,
      transformRow: (row) => ({
        name: row.name,
        type: 'Consumable',
        category:         row.category || '',
        cost_price:       parseMoney(row['cost price'] ?? row.costprice ?? row.cost),
        consumption_unit: parseMoney(row['min consumption'] ?? row['consumption unit'] ?? row.consumption ?? row.unit),
        selling_price: 0,
      }),
      Model: InventoryItem,
    });
    res.json(result);
  } catch (err) {
    console.error('bulkUploadConsumables error:', err);
    res.status(err.status || 500).json({ error: err.userMessage || err.message });
  }
}

// --- HELPER: CENTRALIZED STATUS LOGIC ---
const calculateStatus = (currentStock, minStock) => {
    const stock = Number(currentStock);
    const min = Number(minStock);

    if (stock <= 0) return 'Out of Stock';
    if (stock <= min) return 'Critical';
    if (stock <= min* 1.5) return 'Low';
    return 'Good';
};

// GET /api/inventory
export async function getItems(req, res) {
  const { InventoryItem } = req.tenantModels;
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Note: Aggregate needs to be called on models bound to the connection
    const items = await InventoryItem.aggregate([
      {
        $lookup: {
          from: 'inventorylogs',
          localField: '_id',
          foreignField: 'item_id',
          as: 'logs'
        }
      },
      {
        $addFields: {
          usage_count: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$logs',
                    as: 'log',
                    cond: {
                      $and: [
                        { $eq: ['$$log.type', 'Stock Out'] },
                        { $gte: ['$$log.date', startOfMonth] }
                      ]
                    }
                  }
                },
                as: 'out_log',
                in: '$$out_log.quantity'
              }
            }
          }
        }
      },
      { $project: { logs: 0, __v: 0 } }
    ]);

    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/inventory
export async function createItem(req, res) {
  const { InventoryItem } = req.tenantModels;
  try {
    const newItem = new InventoryItem(req.body);
    // Calculate initial status
    newItem.status = calculateStatus(newItem.stock_on_hand, newItem.min_stock_level);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) { res.status(400).json({ error: err.message }); }
}

// PUT /api/inventory/:id
export async function updateItem(req, res) {
  const { InventoryItem } = req.tenantModels;
  try {
    const updates = req.body;
    const item = await InventoryItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found" });

    // Determine new values
    const newStock = (updates.stock_on_hand !== undefined) ? Number(updates.stock_on_hand) : item.stock_on_hand;
    const newMin = (updates.min_stock_level !== undefined) ? Number(updates.min_stock_level) : item.min_stock_level;

    // Recalculate Status
    const newStatus = calculateStatus(newStock, newMin);

    const updatedItem = await InventoryItem.findByIdAndUpdate(
      req.params.id, 
      { ...updates, status: newStatus }, 
      { new: true }
    );
    res.json(updatedItem);
  } catch (err) { res.status(400).json({ error: err.message }); }
}

// DELETE /api/inventory/:id
export async function deleteItem(req, res) {
  const { InventoryItem } = req.tenantModels;
  try {
    await InventoryItem.findByIdAndDelete(req.params.id);
    res.json({ message: "Item deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/inventory/adjust (For Manual Usage / Stock In / Correction)
export async function adjustStock(req, res) {
  const { InventoryItem, InventoryLog } = req.tenantModels;
  const { item_id, type, qty, reason, notes } = req.body;
  
  try {
    const item = await InventoryItem.findById(item_id);
    if (!item) return res.status(404).json({ msg: 'Item not found' });

    // 1. Update Stock
    if (type === 'Stock In') {
        item.stock_on_hand += Number(qty);
    } else {
        item.stock_on_hand -= Number(qty);
    }
    
    // 2. ✅ Recalculate Status
    item.status = calculateStatus(item.stock_on_hand, item.min_stock_level);
    await item.save();

    // 3. Create Log
    const log = new InventoryLog({
      item_id, 
      type, 
      reason, 
      quantity: qty, 
      notes,
      date: new Date()
    });
    await log.save();

    res.json({ item, log });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/inventory/logs
export async function getLogs(req, res) {
  const { InventoryLog } = req.tenantModels;
  try {
    const logs = await InventoryLog.find()
      .populate('item_id', 'name type') 
      .sort({ date: -1 });
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/inventory/orders
export async function getOrders(req, res) {
  const { Order } = req.tenantModels;
  try {
    const orders = await Order.find().sort({ order_date: -1 });
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/inventory/orders/:id
export async function getOrderById(req, res) {
  const { Order } = req.tenantModels;
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) { res.status(400).json({ error: err.message }); }
}

// POST /api/inventory/orders
export async function createOrder(req, res) {
  const { Order } = req.tenantModels;
  try {
    const newOrder = new Order(req.body);
    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) { res.status(400).json({ error: err.message }); }
}

// PUT /api/inventory/orders/:id (Updates Status & Inventory on Receipt)
export async function updateOrder(req, res) {
  const { Order, InventoryItem, InventoryLog } = req.tenantModels;
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Handle Stock In on Receipt
    if (status === 'Received' && order.status !== 'Received') {
        for (const item of order.items) {
            if (item.item_id) {
                const inventoryItem = await InventoryItem.findById(item.item_id);
                
                if (inventoryItem) {
                    // 1. Update Stock
                    inventoryItem.stock_on_hand += Number(item.qty);

                    // 2. ✅ Recalculate Status
                    inventoryItem.status = calculateStatus(
                        inventoryItem.stock_on_hand, 
                        inventoryItem.min_stock_level
                    );
                    
                    await inventoryItem.save();

                    // 3. Create Log
                    await InventoryLog.create({
                        item_id: item.item_id,
                        type: 'Stock In',
                        quantity: Number(item.qty),
                        reason: 'Purchase Order',
                        notes: `Vendor: ${order.vendor}`,
                        date: new Date()
                    });
                }
            }
        }
    }

    const updatedOrder = await Order.findByIdAndUpdate(id, req.body, { new: true });
    res.json(updatedOrder);

  } catch (err) { res.status(400).json({ error: err.message }); }
}