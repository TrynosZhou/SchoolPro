// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import {
  TransportRoute,
  TransportStop,
  TransportDriver,
  TransportVehicle,
  TransportAssignment,
  TransportDelay,
} from '../entities/Transport';
import { Invoice, InvoiceLine, LedgerEntry, Student } from '../entities';
import { InvoiceStatus } from '../entities/enums';
import { notifyStudentParents } from '../services/parent-notify.service';
import { studentNames, staffNames } from '../utils/lookups';
import { generateNumber, today } from '../utils/helpers';
import { In } from 'typeorm';

const router = Router();

const MANAGE: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];
const STAFF: UserRole[] = [...MANAGE, UserRole.TEACHER, UserRole.ACCOUNTANT];

router.use(authenticate);

// ---------------- Routes ----------------

router.get('/routes', authorize(...STAFF), async (_req: AuthRequest, res: Response) => {
  try {
    const routes = await AppDataSource.getRepository(TransportRoute).find({ order: { code: 'ASC' } });
    const stops = await AppDataSource.getRepository(TransportStop).find({ order: { sequence: 'ASC' } });
    const vehicles = await AppDataSource.getRepository(TransportVehicle).find();
    const drivers = await AppDataSource.getRepository(TransportDriver).find();
    res.json({
      routes,
      stops,
      vehicles: vehicles.map((v) => ({
        ...v,
        driverName: drivers.find((d) => d.id === v.driverId)?.name,
        routeCode: routes.find((r) => r.id === v.routeId)?.code,
      })),
      drivers,
    });
  } catch (e) {
    console.error('[transport:overview]', e);
    res.status(500).json({ message: 'Could not load transport data.' });
  }
});

router.post('/routes', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.code || !b.name) return res.status(400).json({ message: 'code and name are required.' });
    const repo = AppDataSource.getRepository(TransportRoute);
    const row = await repo.save(repo.create({ code: b.code, name: b.name, description: b.description }));
    res.status(201).json(row);
  } catch (e) {
    console.error('[transport:create-route]', e);
    res.status(500).json({ message: 'Could not create route.' });
  }
});

router.patch('/routes/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(TransportRoute);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Route not found.' });
    const b = req.body ?? {};
    for (const k of ['code', 'name', 'description', 'isActive']) if (b[k] !== undefined) (row as any)[k] = b[k];
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update route.' });
  }
});

// ---------------- Stops ----------------

router.post('/stops', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.routeId || !b.name) return res.status(400).json({ message: 'routeId and name are required.' });
    const repo = AppDataSource.getRepository(TransportStop);
    const row = await repo.save(
      repo.create({
        routeId: b.routeId,
        name: b.name,
        address: b.address || undefined,
        pickupTime: b.pickupTime || undefined,
        sequence: Number(b.sequence) || 0,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not create stop.' });
  }
});

router.delete('/stops/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    await AppDataSource.getRepository(TransportStop).delete(String(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Could not delete stop.' });
  }
});

// ---------------- Drivers & vehicles ----------------

router.post('/drivers', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.name) return res.status(400).json({ message: 'name is required.' });
    const repo = AppDataSource.getRepository(TransportDriver);
    const row = await repo.save(
      repo.create({
        name: b.name,
        phone: b.phone || undefined,
        licenseNumber: b.licenseNumber || undefined,
        licenseExpiry: b.licenseExpiry || undefined,
        userId: b.userId || undefined,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not create driver.' });
  }
});

router.patch('/drivers/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(TransportDriver);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Driver not found.' });
    const b = req.body ?? {};
    for (const k of ['name', 'phone', 'licenseNumber', 'licenseExpiry', 'userId', 'isActive']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update driver.' });
  }
});

router.post('/vehicles', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.registration || !b.make) return res.status(400).json({ message: 'registration and make are required.' });
    const repo = AppDataSource.getRepository(TransportVehicle);
    const row = await repo.save(
      repo.create({
        registration: b.registration,
        make: b.make,
        capacity: b.capacity != null ? Number(b.capacity) : undefined,
        routeId: b.routeId || undefined,
        driverId: b.driverId || undefined,
        status: b.status || 'active',
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not create vehicle.' });
  }
});

router.patch('/vehicles/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(TransportVehicle);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Vehicle not found.' });
    const b = req.body ?? {};
    for (const k of ['registration', 'make', 'capacity', 'routeId', 'driverId', 'status', 'isActive']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update vehicle.' });
  }
});

// ---------------- Assignments ----------------

router.get('/assignments', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { routeId, studentId, activeOnly } = req.query as any;
    const repo = AppDataSource.getRepository(TransportAssignment);
    const qb = repo.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');
    if (routeId) qb.andWhere('a.routeId = :routeId', { routeId });
    if (studentId) qb.andWhere('a.studentId = :studentId', { studentId });
    if (activeOnly !== 'false') qb.andWhere('a.isActive = true');
    let rows = await qb.getMany();

    // Parents see only their children
    if (req.user!.role === UserRole.PARENT) {
      const { Student: S } = await import('../entities');
      const kids = await AppDataSource.getRepository(S)
        .createQueryBuilder('s')
        .innerJoin('guardians', 'g', 'g.studentId = s.id')
        .where('g.parentId = :pid', { pid: (req.user as any).parentId || req.user!.userId })
        .select('s.id', 'id')
        .getRawMany();
      const kidIds = new Set(kids.map((k: any) => k.id || k.s_id));
      rows = rows.filter((r) => kidIds.has(r.studentId));
    }

    const [routes, stops, names] = await Promise.all([
      AppDataSource.getRepository(TransportRoute).find(),
      AppDataSource.getRepository(TransportStop).find(),
      studentNames(rows.map((r) => r.studentId)),
    ]);
    res.json(
      rows.map((r) => ({
        ...r,
        studentName: names.get(r.studentId),
        route: routes.find((x) => x.id === r.routeId),
        stop: stops.find((x) => x.id === r.stopId),
      })),
    );
  } catch (e) {
    console.error('[transport:assignments]', e);
    res.status(500).json({ message: 'Could not load assignments.' });
  }
});

router.post('/assignments', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.studentId || !b.routeId) return res.status(400).json({ message: 'studentId and routeId are required.' });
    const repo = AppDataSource.getRepository(TransportAssignment);
    // Deactivate conflicting active assignment for same student+term
    await repo.update(
      { studentId: b.studentId, isActive: true } as any,
      { isActive: false },
    );
    const row = await repo.save(
      repo.create({
        studentId: b.studentId,
        routeId: b.routeId,
        stopId: b.stopId || undefined,
        termId: b.termId || undefined,
        startDate: b.startDate || undefined,
        endDate: b.endDate || undefined,
        isActive: true,
      }),
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[transport:assign]', e);
    res.status(500).json({ message: 'Could not assign transport.' });
  }
});

router.patch('/assignments/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(TransportAssignment);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Assignment not found.' });
    const b = req.body ?? {};
    for (const k of ['routeId', 'stopId', 'termId', 'startDate', 'endDate', 'isActive']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update assignment.' });
  }
});

// ---------------- Transport fee invoicing ----------------

/** Issue a transport invoice for a student (links transport fee to billing). */
router.post('/fee-invoice', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, amount, termId, description, dueDate } = req.body ?? {};
    if (!studentId || !amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'studentId and a positive amount are required.' });
    }
    const student = await AppDataSource.getRepository(Student).findOne({ where: { id: studentId } });
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    const invRepo = AppDataSource.getRepository(Invoice);
    const lineRepo = AppDataSource.getRepository(InvoiceLine);
    const invoice = await invRepo.save(
      invRepo.create({
        invoiceNumber: generateNumber('TRN'),
        studentId,
        termId: termId || undefined,
        feeType: 'bus_levy',
        description: description || 'School transport fee',
        totalAmount: Number(amount),
        amountPaid: 0,
        status: InvoiceStatus.SENT,
        dueDate: dueDate || today(),
        issuedDate: today(),
      }),
    );
    await lineRepo.save(
      lineRepo.create({
        invoiceId: invoice.id,
        description: description || 'School transport fee',
        quantity: 1,
        unitPrice: Number(amount),
        amount: Number(amount),
      }),
    );

    // Ledger entry (mirror billing flow)
    const ledgerRepo = AppDataSource.getRepository(LedgerEntry);
    const last = await ledgerRepo.findOne({ where: { studentId }, order: { createdAt: 'DESC' } });
    const prev = last ? Number(last.balance) : 0;
    await ledgerRepo.save(
      ledgerRepo.create({
        studentId,
        termId: termId || undefined,
        entryDate: today(),
        description: `Invoice ${invoice.invoiceNumber} - transport`,
        debit: Number(amount),
        credit: 0,
        balance: prev + Number(amount),
        referenceType: 'invoice',
        referenceId: invoice.id,
      }),
    );

    res.status(201).json({ invoice, studentName: `${student.firstName} ${student.lastName}` });
  } catch (e) {
    console.error('[transport:fee-invoice]', e);
    res.status(500).json({ message: 'Could not create transport invoice.' });
  }
});

// ---------------- Delays ----------------

router.get('/delays', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { routeId, from, to } = req.query as any;
    const repo = AppDataSource.getRepository(TransportDelay);
    const qb = repo.createQueryBuilder('d').orderBy('d.date', 'DESC').addOrderBy('d.createdAt', 'DESC');
    if (routeId) qb.andWhere('d.routeId = :routeId', { routeId });
    if (from) qb.andWhere('d.date >= :from', { from });
    if (to) qb.andWhere('d.date <= :to', { to });
    const rows = await qb.take(300).getMany();
    const [routes, vehicles, names] = await Promise.all([
      AppDataSource.getRepository(TransportRoute).find(),
      AppDataSource.getRepository(TransportVehicle).find(),
      staffNames(rows.map((r) => r.reportedById)),
    ]);
    res.json(
      rows.map((r) => ({
        ...r,
        route: routes.find((x) => x.id === r.routeId),
        vehicle: vehicles.find((x) => x.id === r.vehicleId),
        reportedByName: names.get(r.reportedById || ''),
      })),
    );
  } catch (e) {
    console.error('[transport:delays]', e);
    res.status(500).json({ message: 'Could not load delays.' });
  }
});

router.post('/delays', authorize(...STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.routeId || !b.date || !b.reason) {
      return res.status(400).json({ message: 'routeId, date and reason are required.' });
    }
    const repo = AppDataSource.getRepository(TransportDelay);
    const row = await repo.save(
      repo.create({
        routeId: b.routeId,
        vehicleId: b.vehicleId || undefined,
        date: b.date,
        scheduledTime: b.scheduledTime || undefined,
        actualTime: b.actualTime || undefined,
        reason: b.reason,
        reportedById: req.user!.userId,
      }),
    );

    // Notify parents of students on this route
    if (b.notifyParents !== false) {
      const assignments = await AppDataSource.getRepository(TransportAssignment).find({
        where: { routeId: b.routeId, isActive: true },
      });
      const studentIds = [...new Set(assignments.map((a) => a.studentId))];
      const route = await AppDataSource.getRepository(TransportRoute).findOne({ where: { id: b.routeId } });
      await notifyStudentParents(studentIds, {
        title: 'Transport delay',
        message: `Route ${route?.name || route?.code || ''} is delayed on ${b.date}: ${b.reason}`,
        type: 'transport',
        metadata: { delayId: row.id, routeId: b.routeId },
      }).catch((err) => console.error('[transport:notify]', err));
      await repo.update(row.id, { parentsNotified: true });
    }

    res.status(201).json(row);
  } catch (e) {
    console.error('[transport:delay]', e);
    res.status(500).json({ message: 'Could not record delay.' });
  }
});

export default router;
