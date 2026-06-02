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
    const byUsername = await userRepo.findOne({
        where: { username: normalized, isActive: true },
        ...(relations ? { relations } : {}),
    });
    if (byUsername)
        return byUsername;
    return userRepo.findOne({
        where: { email: normalized, isActive: true },
        ...(relations ? { relations } : {}),
    });
}
function isLikelyEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
