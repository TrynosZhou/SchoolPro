"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_PROFILES = void 0;
exports.findLatest = findLatest;
exports.relations = relations;
exports.param = param;
/** TypeORM 1.x rejects findOne({ order }) without where — use find + take 1 instead. */
async function findLatest(repo, order = { createdAt: 'DESC' }) {
    const rows = await repo.find({ order: order, take: 1 });
    return rows[0] ?? null;
}
/** Build TypeORM 1.x object-style relations from dot paths, e.g. 'student.schoolClass.form' */
function relations(...paths) {
    const result = {};
    for (const path of paths) {
        const parts = path.split('.');
        let current = result;
        for (let i = 0; i < parts.length; i++) {
            const key = parts[i];
            if (i === parts.length - 1) {
                current[key] = true;
            }
            else {
                if (!current[key] || current[key] === true) {
                    current[key] = {};
                }
                current = current[key];
            }
        }
    }
    return result;
}
function param(value) {
    return Array.isArray(value) ? value[0] : value;
}
/** Common relation sets */
exports.USER_PROFILES = relations('staffProfile', 'parentProfile', 'studentProfile');
