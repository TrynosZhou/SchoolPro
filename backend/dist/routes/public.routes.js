"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const router = (0, express_1.Router)();
/**
 * Public school branding (name, tagline, logo) for unauthenticated pages such as
 * the login screen and the public admissions pages. Reads the same settings that
 * admins manage on /admin/settings.
 */
router.get('/branding', async (_req, res) => {
    const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({
        where: { id: 'default' },
    });
    res.json({
        schoolName: settings?.schoolName?.trim() || 'School Pro Academy',
        tagline: settings?.tagline?.trim() || null,
        logoUrl: settings?.logoUrl?.trim() || null,
    });
});
exports.default = router;
