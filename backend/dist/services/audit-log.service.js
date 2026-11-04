"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffObjects = diffObjects;
exports.logAudit = logAudit;
exports.logAuditBulk = logAuditBulk;
exports.queryAuditLogs = queryAuditLogs;
const data_source_1 = require("../config/data-source");
const AuditLog_1 = require("../entities/AuditLog");
function normalizeAction(action) {
    if (action === 'edit')
        return 'update';
    return action;
}
const SENSITIVE_FIELDS = new Set([
    'password',
    'passwordhash',
    'passwordHash',
    'token',
    'secret',
    'passwordResetTokenHash',
]);
/** Compare two plain objects and return changed fields (excluding sensitive keys). */
function diffObjects(before, after, fields) {
    const prev = before ?? {};
    const next = after ?? {};
    const keys = fields?.length
        ? fields
        : [...new Set([...Object.keys(prev), ...Object.keys(next)])];
    const changes = [];
    for (const field of keys) {
        if (SENSITIVE_FIELDS.has(field) || SENSITIVE_FIELDS.has(field.toLowerCase()))
            continue;
        const b = prev[field];
        const a = next[field];
        if (!valuesEqual(b, a)) {
            changes.push({ field, before: serializeValue(b), after: serializeValue(a) });
        }
    }
    return changes;
}
function serializeValue(v) {
    if (v instanceof Date)
        return v.toISOString();
    if (v === undefined)
        return null;
    return v;
}
function valuesEqual(a, b) {
    if (a === b)
        return true;
    if (a == null && b == null)
        return true;
    return JSON.stringify(serializeValue(a)) === JSON.stringify(serializeValue(b));
}
/**
 * Append a single audit log entry. Safe to call from any module once Phase 3 hooks in.
 * Failures are logged but do not throw — auditing must not break business operations.
 */
async function logAudit(input) {
    try {
        const repo = data_source_1.AppDataSource.getRepository(AuditLog_1.AuditLog);
        const row = repo.create({
            userId: input.userId,
            userRole: input.userRole,
            userEmail: input.userEmail?.slice(0, 160),
            action: normalizeAction(input.action),
            module: input.module.slice(0, 64),
            recordId: String(input.recordId).slice(0, 64),
            recordLabel: input.recordLabel?.slice(0, 255),
            changes: input.changes?.length ? input.changes : undefined,
        });
        return await repo.save(row);
    }
    catch (err) {
        console.error('[audit-log] Failed to write entry:', err);
        return null;
    }
}
/**
 * Append multiple audit entries in one transaction (e.g. bulk SMS/status updates).
 * Phase 3 requirement: one entry per affected record, not one generic entry.
 */
async function logAuditBulk(inputs) {
    if (!inputs.length)
        return 0;
    try {
        const repo = data_source_1.AppDataSource.getRepository(AuditLog_1.AuditLog);
        const rows = inputs.map((input) => repo.create({
            userId: input.userId,
            userRole: input.userRole,
            userEmail: input.userEmail?.slice(0, 160),
            action: normalizeAction(input.action),
            module: input.module.slice(0, 64),
            recordId: String(input.recordId).slice(0, 64),
            recordLabel: input.recordLabel?.slice(0, 255),
            changes: input.changes?.length ? input.changes : undefined,
        }));
        await repo.save(rows);
        return rows.length;
    }
    catch (err) {
        console.error('[audit-log] Bulk write failed:', err);
        return 0;
    }
}
/** Read-only query for the Phase 3 admin audit viewer. */
async function queryAuditLogs(query) {
    const qb = data_source_1.AppDataSource.getRepository(AuditLog_1.AuditLog)
        .createQueryBuilder('a')
        .orderBy('a.createdAt', 'DESC');
    if (query.userId)
        qb.andWhere('a.userId = :userId', { userId: query.userId });
    if (query.userEmail) {
        qb.andWhere('a.userEmail ILIKE :userEmail', { userEmail: `%${query.userEmail}%` });
    }
    if (query.module)
        qb.andWhere('a.module = :module', { module: query.module });
    if (query.action)
        qb.andWhere('a.action = :action', { action: normalizeAction(query.action) });
    if (query.recordId)
        qb.andWhere('a.recordId = :recordId', { recordId: query.recordId });
    if (query.dateFrom)
        qb.andWhere('a.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo)
        qb.andWhere('a.createdAt <= :dateTo', { dateTo: `${query.dateTo}T23:59:59.999Z` });
    const total = await qb.getCount();
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const rows = await qb.skip(offset).take(limit).getMany();
    return { rows, total };
}
