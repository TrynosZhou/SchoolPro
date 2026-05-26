"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateGradeBoundariesCache = invalidateGradeBoundariesCache;
exports.getGradeBoundaries = getGradeBoundaries;
exports.gradeForMarks = gradeForMarks;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const grade_boundaries_1 = require("../types/grade-boundaries");
const SETTINGS_ID = 'default';
let cachedBoundaries = null;
let cacheTime = 0;
const CACHE_MS = 30000;
function invalidateGradeBoundariesCache() {
    cachedBoundaries = null;
    cacheTime = 0;
}
async function getGradeBoundaries() {
    if (cachedBoundaries && Date.now() - cacheTime < CACHE_MS) {
        return cachedBoundaries;
    }
    const repo = data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings);
    const settings = await repo.findOne({ where: { id: SETTINGS_ID } });
    const boundaries = settings?.gradeBoundaries?.length ? settings.gradeBoundaries : grade_boundaries_1.DEFAULT_GRADE_BOUNDARIES;
    cachedBoundaries = boundaries;
    cacheTime = Date.now();
    return boundaries;
}
async function gradeForMarks(marks, max = 100) {
    const boundaries = await getGradeBoundaries();
    return (0, grade_boundaries_1.calculateGradeFromBoundaries)(marks, max, boundaries);
}
