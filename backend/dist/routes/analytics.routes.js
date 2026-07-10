"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const SchoolYear_1 = require("../entities/SchoolYear");
const Term_1 = require("../entities/Term");
const SchoolClass_1 = require("../entities/SchoolClass");
const Form_1 = require("../entities/Form");
const enums_1 = require("../entities/enums");
const auth_1 = require("../middleware/auth");
const analytics_service_1 = require("../services/analytics.service");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const boardRoles = [enums_1.UserRole.ADMIN, enums_1.UserRole.DIRECTOR, enums_1.UserRole.PRINCIPAL];
const str = (v) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? s : undefined;
};
/** Filter option lists for the analytics dashboards (years, terms, classes, forms). */
router.get('/filters', (0, auth_1.authorize)(...boardRoles), async (_req, res) => {
    const [schoolYears, terms, classes, forms] = await Promise.all([
        data_source_1.AppDataSource.getRepository(SchoolYear_1.SchoolYear).find({ order: { startDate: 'DESC' } }),
        data_source_1.AppDataSource.getRepository(Term_1.Term).find({ order: { startDate: 'DESC' } }),
        data_source_1.AppDataSource.getRepository(SchoolClass_1.SchoolClass).find({ relations: { form: true }, order: { name: 'ASC' } }),
        data_source_1.AppDataSource.getRepository(Form_1.Form).find({ order: { level: 'ASC' } }),
    ]);
    res.json({
        schoolYears: schoolYears.map((y) => ({ id: y.id, name: y.name, isCurrent: y.isCurrent })),
        terms: terms.map((t) => ({
            id: t.id,
            name: t.name,
            schoolYearId: t.schoolYearId,
            isCurrent: t.isCurrent,
        })),
        classes: classes.map((c) => ({
            id: c.id,
            name: c.name,
            formId: c.formId,
            formName: c.form?.name,
        })),
        forms: forms.map((f) => ({ id: f.id, name: f.name, level: f.level })),
    });
});
router.get('/demographics', (0, auth_1.authorize)(...boardRoles), async (req, res) => {
    try {
        const data = await (0, analytics_service_1.getDemographics)({
            schoolYearId: str(req.query.schoolYearId),
            termId: str(req.query.termId),
            classId: str(req.query.classId),
            formId: str(req.query.formId),
        });
        res.json(data);
    }
    catch (err) {
        console.error('[analytics] demographics failed:', err);
        res.status(500).json({
            message: err instanceof Error ? err.message : 'Failed to load demographics',
        });
    }
});
router.get('/retention', (0, auth_1.authorize)(...boardRoles), async (_req, res) => {
    res.json(await (0, analytics_service_1.getRetention)());
});
router.get('/at-risk', (0, auth_1.authorize)(...boardRoles), async (req, res) => {
    const data = await (0, analytics_service_1.getAtRiskStudents)({
        classId: str(req.query.classId),
        formId: str(req.query.formId),
        termId: str(req.query.termId),
    });
    res.json(data);
});
exports.default = router;
