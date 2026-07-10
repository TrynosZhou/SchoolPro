"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const ReportTemplate_1 = require("../entities/ReportTemplate");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const report_builder_service_1 = require("../services/report-builder.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const boardRoles = [enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL];
function parseConfig(body) {
    const dataset = typeof body.dataset === 'string' ? body.dataset : '';
    if (!report_builder_service_1.DATASETS.some((d) => d.key === dataset))
        return null;
    return {
        dataset,
        fields: Array.isArray(body.fields) ? body.fields.map(String) : [],
        filters: (body.filters && typeof body.filters === 'object' ? body.filters : {}),
        groupBy: typeof body.groupBy === 'string' && body.groupBy ? body.groupBy : null,
        sortBy: typeof body.sortBy === 'string' && body.sortBy ? body.sortBy : null,
        sortDir: body.sortDir === 'desc' ? 'desc' : body.sortDir === 'asc' ? 'asc' : null,
    };
}
/** Field & dataset registry for building the report UI. */
router.get('/meta', (0, auth_1.authorize)(...boardRoles), async (_req, res) => {
    res.json((0, report_builder_service_1.getReportMeta)());
});
/** Run a report and return the resolved columns + rows as JSON (preview). */
router.post('/run', (0, auth_1.authorize)(...boardRoles), async (req, res) => {
    const config = parseConfig(req.body || {});
    if (!config)
        return res.status(400).json({ message: 'A valid dataset is required.' });
    try {
        const result = await (0, report_builder_service_1.runReport)(config);
        res.json(result);
    }
    catch (err) {
        res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to run report' });
    }
});
/** Export a report in the requested format (csv | xlsx | pdf). */
router.post('/export', (0, auth_1.authorize)(...boardRoles), async (req, res) => {
    const config = parseConfig(req.body || {});
    if (!config)
        return res.status(400).json({ message: 'A valid dataset is required.' });
    const format = String(req.query.format || req.body?.format || 'csv').toLowerCase();
    const title = (typeof req.body?.title === 'string' && req.body.title.trim()) ||
        report_builder_service_1.DATASETS.find((d) => d.key === config.dataset)?.label ||
        'Custom Report';
    const safeName = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'report';
    try {
        const result = await (0, report_builder_service_1.runReport)(config);
        if (format === 'xlsx' || format === 'excel') {
            const buf = await (0, report_builder_service_1.reportToXlsx)(result, title);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
            return res.send(buf);
        }
        if (format === 'pdf') {
            const buf = await (0, report_builder_service_1.reportToPdf)(result, title);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${safeName}.pdf"`);
            return res.send(buf);
        }
        const csv = (0, report_builder_service_1.reportToCsv)(result, title);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
        return res.send(csv);
    }
    catch (err) {
        res.status(400).json({ message: err instanceof Error ? err.message : 'Failed to export report' });
    }
});
// --- Saved templates -------------------------------------------------------
router.get('/templates', (0, auth_1.authorize)(...boardRoles), async (_req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(ReportTemplate_1.ReportTemplate);
    const templates = await repo.find({ order: { updatedAt: 'DESC' } });
    res.json(templates);
});
router.get('/templates/:id', (0, auth_1.authorize)(...boardRoles), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(ReportTemplate_1.ReportTemplate);
    const template = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!template)
        return res.status(404).json({ message: 'Template not found' });
    res.json(template);
});
router.post('/templates', (0, auth_1.authorize)(...boardRoles), async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name)
        return res.status(400).json({ message: 'A template name is required.' });
    const config = parseConfig(req.body?.config || req.body || {});
    if (!config)
        return res.status(400).json({ message: 'A valid dataset is required.' });
    const repo = data_source_1.AppDataSource.getRepository(ReportTemplate_1.ReportTemplate);
    const template = repo.create({
        name: name.slice(0, 120),
        description: typeof req.body?.description === 'string' ? req.body.description.slice(0, 500) : undefined,
        config,
        createdById: req.user?.userId,
        createdByName: req.user?.email || undefined,
    });
    res.status(201).json(await repo.save(template));
});
router.put('/templates/:id', (0, auth_1.authorize)(...boardRoles), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(ReportTemplate_1.ReportTemplate);
    const template = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!template)
        return res.status(404).json({ message: 'Template not found' });
    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
        template.name = req.body.name.trim().slice(0, 120);
    }
    if (typeof req.body?.description === 'string') {
        template.description = req.body.description.slice(0, 500);
    }
    const config = parseConfig(req.body?.config || req.body || {});
    if (config)
        template.config = config;
    res.json(await repo.save(template));
});
router.delete('/templates/:id', (0, auth_1.authorize)(...boardRoles), async (req, res) => {
    const repo = data_source_1.AppDataSource.getRepository(ReportTemplate_1.ReportTemplate);
    const id = String(req.params.id);
    const result = await repo.delete({ id });
    if (!result.affected)
        return res.status(404).json({ message: 'Template not found' });
    res.json({ message: 'Template deleted', id });
});
exports.default = router;
