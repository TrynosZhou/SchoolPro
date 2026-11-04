"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTimetableContext = loadTimetableContext;
exports.saveTimetableVersion = saveTimetableVersion;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const timetable_classic_pdf_1 = require("../utils/timetable-classic.pdf");
const school_branding_service_1 = require("./school-branding.service");
const typeorm_helpers_1 = require("../utils/typeorm-helpers");
function normalizeTimetableVersion(raw) {
    const value = String(raw ?? '').trim();
    if (!value)
        return '1';
    return value.slice(0, 32);
}
async function ensureSettings() {
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    let settings = await repo.findOne({ where: { id: 'default' } });
    if (!settings) {
        settings = repo.create({ id: 'default', timetableVersion: '1' });
        await repo.save(settings);
    }
    if (!settings.timetableVersion) {
        settings.timetableVersion = '1';
        await repo.save(settings);
    }
    return settings;
}
async function loadTimetableContext() {
    const branding = await (0, school_branding_service_1.loadSchoolBranding)();
    const settings = await ensureSettings();
    const term = await data_source_1.AppDataSource.getRepository(entities_1.Term).findOne({
        where: { isCurrent: true },
        relations: (0, typeorm_helpers_1.relations)('schoolYear'),
    });
    const schoolName = branding.schoolName || 'School Pro Academy';
    const termName = term?.name ?? null;
    const yearName = term?.schoolYear?.name ?? null;
    const timetableVersion = normalizeTimetableVersion(settings.timetableVersion);
    const termVersionLabel = (0, timetable_classic_pdf_1.buildTimetableTermVersionLabel)(termName, yearName, timetableVersion);
    const titleLine = (0, timetable_classic_pdf_1.buildTimetableTitleLine)(schoolName, termName, yearName, timetableVersion);
    return {
        branding,
        schoolName,
        termName,
        yearName,
        timetableVersion,
        termVersionLabel,
        titleLine,
        generatedAt: new Date(),
    };
}
async function saveTimetableVersion(raw) {
    const version = normalizeTimetableVersion(raw);
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    const settings = await ensureSettings();
    settings.timetableVersion = version;
    await repo.save(settings);
    return version;
}
