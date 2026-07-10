"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyUserPassword = verifyUserPassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const date_only_1 = require("./date-only");
/** Verify a password, including common date-of-birth format variants for student portal accounts. */
async function verifyUserPassword(user, candidate) {
    const hash = user.passwordHash;
    if (!hash)
        return false;
    const candidates = (0, date_only_1.datePasswordCandidates)(candidate);
    for (const attempt of candidates) {
        if (await bcryptjs_1.default.compare(attempt, hash))
            return true;
    }
    return false;
}
