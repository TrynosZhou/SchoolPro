"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateGradeBoundariesCache = invalidateGradeBoundariesCache;
exports.getGradeBoundaries = getGradeBoundaries;
exports.gradeForMarks = gradeForMarks;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const tenant_context_1 = require("../config/tenant-context");
const grade_boundaries_1 = require("../types/grade-boundaries");
const SETTINGS_ID = 'default';
/** Keyed by tenant so demo and production never share a cached copy. */
const cache = new Map();
const CACHE_MS = 30000;
function cacheKey() {
    return tenant_context_1.tenantContext.isDemo() ? 'demo' : 'prod';
}
function invalidateGradeBoundariesCache() {
    cache.clear();
}
async function getGradeBoundaries() {
    const key = cacheKey();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < CACHE_MS) {
        return cached.boundaries;
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    const settings = await repo.findOne({ where: { id: SETTINGS_ID } });
    const boundaries = settings?.gradeBoundaries?.length ? settings.gradeBoundaries : grade_boundaries_1.DEFAULT_GRADE_BOUNDARIES;
    cache.set(key, { boundaries, time: Date.now() });
    return boundaries;
}
async function gradeForMarks(marks, max = 100) {
    const boundaries = await getGradeBoundaries();
    return (0, grade_boundaries_1.calculateGradeFromBoundaries)(marks, max, boundaries);
}
