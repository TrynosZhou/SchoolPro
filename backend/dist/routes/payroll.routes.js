"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const portal_roles_1 = require("../config/portal-roles");
const auth_1 = require("../middleware/auth");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
const payroll_service_1 = require("../services/payroll.service");
const router = (0, express_1.Router)();
const PAYROLL_ROLES = portal_roles_1.FINANCE_ROLES;
router.use(auth_1.authenticate);
router.use((0, auth_1.authorize)(...PAYROLL_ROLES));
router.get('/summary', async (_req, res) => {
    res.json(await (0, payroll_service_1.getPayrollSummary)());
});
router.get('/leave/balances', async (_req, res) => {
    res.json(await (0, payroll_service_1.listLeaveBalances)());
});
router.get('/leave/:staffId', async (req, res) => {
    res.json(await (0, payroll_service_1.getStaffLeaveSummary)(String(req.params.staffId)));
});
router.get('/profiles', async (_req, res) => {
    res.json(await (0, payroll_service_1.listProfilesWithStaff)());
});
router.get('/profiles/:staffId', async (req, res) => {
    const staffId = String(req.params.staffId);
    const profile = await data_source_1.AppDataSource.getRepository(entities_1.StaffPayrollProfile).findOne({
        where: { staffId },
        relations: (0, typeorm_helpers_1.relations)('staff', 'staff.user'),
    });
    res.json(profile);
});
router.put('/profiles/:staffId', async (req, res) => {
    const staffId = String(req.params.staffId);
    try {
        const profile = await (0, payroll_service_1.upsertProfile)(staffId, req.body);
        res.json(profile);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to save profile';
        res.status(400).json({ message: msg });
    }
});
router.get('/runs', async (_req, res) => {
    const runs = await data_source_1.AppDataSource.getRepository(entities_1.PayrollRun).find({
        order: { year: 'DESC', month: 'DESC', createdAt: 'DESC' },
    });
    res.json(runs);
});
router.get('/runs/preview', async (req, res) => {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!year || !month) {
        return res.status(400).json({ message: 'year and month are required' });
    }
    try {
        res.json(await (0, payroll_service_1.previewRun)(year, month));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Preview failed';
        res.status(400).json({ message: msg });
    }
});
router.get('/runs/:id', async (req, res) => {
    const data = await (0, payroll_service_1.getRunWithPayslips)(String(req.params.id));
    if (!data)
        return res.status(404).json({ message: 'Payroll run not found' });
    res.json(data);
});
router.post('/runs', async (req, res) => {
    const { year, month, payDate, notes } = req.body;
    if (!year || !month) {
        return res.status(400).json({ message: 'year and month are required' });
    }
    try {
        const data = await (0, payroll_service_1.createRun)(Number(year), Number(month), {
            payDate,
            notes,
            createdByUserId: req.user?.userId,
        });
        res.status(201).json(data);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to create payroll run';
        res.status(400).json({ message: msg });
    }
});
router.post('/runs/:id/process', async (req, res) => {
    const id = String(req.params.id);
    try {
        res.json(await (0, payroll_service_1.processRun)(id, req.user?.userId));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Process failed';
        res.status(400).json({ message: msg });
    }
});
router.post('/runs/:id/mark-paid', async (req, res) => {
    const id = String(req.params.id);
    try {
        res.json(await (0, payroll_service_1.markRunPaid)(id, req.user?.userId));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Mark paid failed';
        res.status(400).json({ message: msg });
    }
});
router.delete('/runs/:id', async (req, res) => {
    try {
        res.json(await (0, payroll_service_1.cancelRun)(String(req.params.id)));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Cancel failed';
        res.status(400).json({ message: msg });
    }
});
router.patch('/payslips/:id', async (req, res) => {
    try {
        res.json(await (0, payroll_service_1.updatePayslip)(String(req.params.id), req.body));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Update failed';
        res.status(400).json({ message: msg });
    }
});
exports.default = router;
