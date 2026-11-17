// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import {
  Supplier,
  InventoryItem,
  StockMovement,
  PurchaseOrder,
  PurchaseOrderLine,
  FixedAsset,
} from '../entities/Inventory';
import { today } from '../utils/helpers';

const router = Router();

const MANAGE: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];
const STAFF: UserRole[] = [...MANAGE, UserRole.ACCOUNTANT];

router.use(authenticate);

async function nextPoNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const last = await AppDataSource.getRepository(PurchaseOrder)
    .createQueryBuilder('p')
    .where('p.poNumber LIKE :prefix', { prefix: `${prefix}%` })
    .orderBy('p.poNumber', 'DESC')
    .getOne();
  const seq = last ? parseInt(String(last.poNumber).split('-').pop() || '0', 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ---------------- Suppliers ----------------

router.get('/suppliers', authorize(...STAFF), async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await AppDataSource.getRepository(Supplier).find({ order: { name: 'ASC' } }));
  } catch (e) {
    res.status(500).json({ message: 'Could not load suppliers.' });
  }
});

router.post('/suppliers', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.name) return res.status(400).json({ message: 'name is required.' });
    const repo = AppDataSource.getRepository(Supplier);
    res.status(201).json(
      await repo.save(
        repo.create({
          name: b.name,
          contactPerson: b.contactPerson || undefined,
          phone: b.phone || undefined,
          email: b.email || undefined,
          address: b.address || undefined,
        }),
      ),
    );
  } catch (e) {
    res.status(500).json({ message: 'Could not create supplier.' });
  }
});

router.patch('/suppliers/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Supplier);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Supplier not found.' });
    const b = req.body ?? {};
    for (const k of ['name', 'contactPerson', 'phone', 'email', 'address', 'isActive']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update supplier.' });
  }
});

// ---------------- Items & stock ----------------

router.get('/items', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { category, lowStock } = req.query as any;
    const repo = AppDataSource.getRepository(InventoryItem);
    const qb = repo.createQueryBuilder('i').orderBy('i.name', 'ASC');
    if (category) qb.andWhere('i.category = :category', { category });
    let rows = await qb.getMany();
    if (lowStock === 'true') rows = rows.filter((r) => r.quantity <= r.reorderLevel);
    const suppliers = await AppDataSource.getRepository(Supplier).find();
    res.json(rows.map((r) => ({ ...r, supplier: suppliers.find((s) => s.id === r.supplierId) })));
  } catch (e) {
    console.error('[inventory:items]', e);
    res.status(500).json({ message: 'Could not load items.' });
  }
});

router.post('/items', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.name) return res.status(400).json({ message: 'name is required.' });
    const repo = AppDataSource.getRepository(InventoryItem);
    const row = await repo.save(
      repo.create({
        name: b.name,
        category: b.category || 'other',
        unit: b.unit || undefined,
        unitCost: Number(b.unitCost) || 0,
        quantity: Number(b.quantity) || 0,
        reorderLevel: Number(b.reorderLevel) || 0,
        location: b.location || undefined,
        supplierId: b.supplierId || undefined,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not create item.' });
  }
});

router.patch('/items/:id', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(InventoryItem);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Item not found.' });
    const b = req.body ?? {};
    const fields = ['name', 'category', 'unit', 'unitCost', 'quantity', 'reorderLevel', 'location', 'supplierId', 'isActive'];
    for (const f of fields) if (b[f] !== undefined) (row as any)[f] = b[f];
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update item.' });
  }
});

router.get('/movements', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { itemId, type, from, to } = req.query as any;
    const repo = AppDataSource.getRepository(StockMovement);
    const qb = repo.createQueryBuilder('m').orderBy('m.date', 'DESC').addOrderBy('m.createdAt', 'DESC');
    if (itemId) qb.andWhere('m.itemId = :itemId', { itemId });
    if (type) qb.andWhere('m.type = :type', { type });
    if (from) qb.andWhere('m.date >= :from', { from });
    if (to) qb.andWhere('m.date <= :to', { to });
    const rows = await qb.take(500).getMany();
    const items = await AppDataSource.getRepository(InventoryItem).find();
    res.json(rows.map((r) => ({ ...r, item: items.find((i) => i.id === r.itemId) })));
  } catch (e) {
    res.status(500).json({ message: 'Could not load movements.' });
  }
});

/** Manual stock movement (in/out/adjust) — updates item quantity atomically-ish. */
router.post('/movements', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.itemId || !b.type || b.quantity == null) {
      return res.status(400).json({ message: 'itemId, type and quantity are required.' });
    }
    const itemRepo = AppDataSource.getRepository(InventoryItem);
    const item = await itemRepo.findOne({ where: { id: b.itemId } });
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    const qty = Math.abs(Number(b.quantity));
    const delta = b.type === 'in' ? qty : b.type === 'out' ? -qty : Number(b.quantity);
    if (item.quantity + delta < 0) {
      return res.status(409).json({ message: 'Insufficient stock.' });
    }

    const moveRepo = AppDataSource.getRepository(StockMovement);
    const movement = await moveRepo.save(
      moveRepo.create({
        itemId: item.id,
        type: b.type,
        quantity: delta,
        unitCost: b.unitCost != null ? Number(b.unitCost) : undefined,
        reason: b.reason || undefined,
        referenceType: b.referenceType || undefined,
        referenceId: b.referenceId || undefined,
        date: b.date || today(),
        createdById: req.user!.userId,
      }),
    );
    await itemRepo.update(item.id, { quantity: item.quantity + delta });
    res.status(201).json({ movement, newQuantity: item.quantity + delta });
  } catch (e) {
    console.error('[inventory:movement]', e);
    res.status(500).json({ message: 'Could not record movement.' });
  }
});

// ---------------- Purchase orders ----------------

router.get('/purchase-orders', authorize(...STAFF), async (_req: AuthRequest, res: Response) => {
  try {
    const [orders, lines, suppliers] = await Promise.all([
      AppDataSource.getRepository(PurchaseOrder).find({ order: { createdAt: 'DESC' } }),
      AppDataSource.getRepository(PurchaseOrderLine).find(),
      AppDataSource.getRepository(Supplier).find(),
    ]);
    const items = await AppDataSource.getRepository(InventoryItem).find();
    res.json(
      orders.map((o) => ({
        ...o,
        supplier: suppliers.find((s) => s.id === o.supplierId),
        lines: lines
          .filter((l) => l.purchaseOrderId === o.id)
          .map((l) => ({ ...l, item: items.find((i) => i.id === l.itemId) })),
        total: lines
          .filter((l) => l.purchaseOrderId === o.id)
          .reduce((s, l) => s + Number(l.lineTotal), 0),
      })),
    );
  } catch (e) {
    console.error('[inventory:pos]', e);
    res.status(500).json({ message: 'Could not load purchase orders.' });
  }
});

router.post('/purchase-orders', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.supplierId || !Array.isArray(b.lines) || !b.lines.length) {
      return res.status(400).json({ message: 'supplierId and lines are required.' });
    }
    const poRepo = AppDataSource.getRepository(PurchaseOrder);
    const lineRepo = AppDataSource.getRepository(PurchaseOrderLine);
    const po = await poRepo.save(
      poRepo.create({
        poNumber: await nextPoNumber(),
        supplierId: b.supplierId,
        status: b.status || 'draft',
        orderDate: b.orderDate || today(),
        expectedDate: b.expectedDate || undefined,
        notes: b.notes || undefined,
        createdById: req.user!.userId,
      }),
    );
    for (const l of b.lines) {
      const qty = Number(l.quantity);
      const cost = Number(l.unitCost) || 0;
      await lineRepo.save(
        lineRepo.create({
          purchaseOrderId: po.id,
          itemId: l.itemId,
          quantity: qty,
          unitCost: cost,
          lineTotal: qty * cost,
        }),
      );
    }
    res.status(201).json(po);
  } catch (e) {
    console.error('[inventory:create-po]', e);
    res.status(500).json({ message: 'Could not create purchase order.' });
  }
});

/** Mark PO received — posts stock-in movements for each line. */
router.post('/purchase-orders/:id/receive', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const poRepo = AppDataSource.getRepository(PurchaseOrder);
    const po = await poRepo.findOne({ where: { id: String(req.params.id) } });
    if (!po) return res.status(404).json({ message: 'Purchase order not found.' });
    if (po.status === 'received') return res.status(409).json({ message: 'Already received.' });
    if (po.status === 'cancelled') return res.status(409).json({ message: 'PO is cancelled.' });

    const lineRepo = AppDataSource.getRepository(PurchaseOrderLine);
    const lines = await lineRepo.find({ where: { purchaseOrderId: po.id } });
    const itemRepo = AppDataSource.getRepository(InventoryItem);
    const moveRepo = AppDataSource.getRepository(StockMovement);

    for (const l of lines) {
      const item = await itemRepo.findOne({ where: { id: l.itemId } });
      if (!item) continue;
      await itemRepo.update(item.id, { quantity: item.quantity + Number(l.quantity) });
      await moveRepo.save(
        moveRepo.create({
          itemId: item.id,
          type: 'in',
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
          reason: `PO ${po.poNumber} received`,
          referenceType: 'purchase_order',
          referenceId: po.id,
          date: today(),
          createdById: req.user!.userId,
        }),
      );
    }
    po.status = 'received';
    await poRepo.save(po);
    res.json(po);
  } catch (e) {
    console.error('[inventory:receive-po]', e);
    res.status(500).json({ message: 'Could not receive PO.' });
  }
});

router.patch('/purchase-orders/:id', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(PurchaseOrder);
    const po = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!po) return res.status(404).json({ message: 'Purchase order not found.' });
    const b = req.body ?? {};
    for (const k of ['status', 'orderDate', 'expectedDate', 'notes']) {
      if (b[k] !== undefined) (po as any)[k] = b[k];
    }
    await repo.save(po);
    res.json(po);
  } catch (e) {
    res.status(500).json({ message: 'Could not update PO.' });
  }
});

// ---------------- Fixed assets & depreciation ----------------

router.get('/assets', authorize(...STAFF), async (_req: AuthRequest, res: Response) => {
  try {
    const assets = await AppDataSource.getRepository(FixedAsset).find({ order: { name: 'ASC' } });
    const now = new Date();
    res.json(
      assets.map((a) => {
        const cost = Number(a.purchaseCost);
        const salvage = Number(a.salvageValue) || 0;
        const depreciable = Math.max(0, cost - salvage);
        const lifeMonths = (a.usefulLifeYears || 5) * 12;
        let accumulated = 0;
        let bookValue = cost;
        let fullyDepreciated = false;
        if (a.purchaseDate) {
          const purchased = new Date(`${a.purchaseDate}T00:00:00`);
          const monthsHeld = Math.max(
            0,
            (now.getFullYear() - purchased.getFullYear()) * 12 + (now.getMonth() - purchased.getMonth()),
          );
          accumulated = Math.min(depreciable, (depreciable / lifeMonths) * monthsHeld);
          bookValue = cost - accumulated;
          fullyDepreciated = monthsHeld >= lifeMonths;
        }
        return {
          ...a,
          accumulatedDepreciation: Math.round(accumulated * 100) / 100,
          bookValue: Math.round(bookValue * 100) / 100,
          depreciationRate: lifeMonths ? Math.round((depreciable / lifeMonths) * 100) / 100 : 0,
          fullyDepreciated,
        };
      }),
    );
  } catch (e) {
    console.error('[inventory:assets]', e);
    res.status(500).json({ message: 'Could not load assets.' });
  }
});

router.post('/assets', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.name) return res.status(400).json({ message: 'name is required.' });
    const repo = AppDataSource.getRepository(FixedAsset);
    res.status(201).json(
      await repo.save(
        repo.create({
          name: b.name,
          category: b.category || undefined,
          purchaseDate: b.purchaseDate || undefined,
          purchaseCost: Number(b.purchaseCost) || 0,
          salvageValue: Number(b.salvageValue) || 0,
          usefulLifeYears: Number(b.usefulLifeYears) || 5,
          location: b.location || undefined,
          notes: b.notes || undefined,
        }),
      ),
    );
  } catch (e) {
    res.status(500).json({ message: 'Could not create asset.' });
  }
});

router.patch('/assets/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(FixedAsset);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Asset not found.' });
    const b = req.body ?? {};
    const fields = ['name', 'category', 'purchaseDate', 'purchaseCost', 'salvageValue', 'usefulLifeYears', 'location', 'notes', 'isActive'];
    for (const f of fields) if (b[f] !== undefined) (row as any)[f] = b[f];
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update asset.' });
  }
});

export default router;
