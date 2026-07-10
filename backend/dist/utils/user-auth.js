"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeLoginIdentifier = normalizeLoginIdentifier;
exports.findActiveUserByLoginIdentifier = findActiveUserByLoginIdentifier;
exports.isLikelyEmail = isLikelyEmail;
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
function normalizeLoginIdentifier(value) {
    return String(value || '').trim().toLowerCase();
}
/** Resolve an active user by username or email (case-insensitive). */
async function findActiveUserByLoginIdentifier(identifier, relations) {
    const normalized = normalizeLoginIdentifier(identifier);
    if (!normalized)
        return null;
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const qb = userRepo
        .createQueryBuilder('u')
        .where('u.isActive = :active', { active: true })
        .andWhere('(LOWER(u.username) = :id OR LOWER(u.email) = :id)', { id: normalized });
    if (relations) {
        for (const [key, value] of Object.entries(relations)) {
            if (value === true) {
                qb.leftJoinAndSelect(`u.${key}`, key);
            }
            else if (value && typeof value === 'object') {
                qb.leftJoinAndSelect(`u.${key}`, key);
            }
        }
    }
    return qb.getOne();
}
function isLikelyEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
