"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Ensures the default admin can sign in with username `admin` / password `admin`.
 * Run: npx ts-node src/scripts/set-admin-login.ts
 */
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
async function main() {
    await data_source_1.AppDataSource.initialize();
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const hash = await bcryptjs_1.default.hash('admin', 10);
    let admin = (await userRepo.findOne({ where: { username: 'admin' } })) ||
        (await userRepo.findOne({ where: { email: 'admin' } })) ||
        (await userRepo.findOne({ where: { email: 'admin@schoolpro.ac.zw' } })) ||
        (await userRepo.findOne({ where: { role: enums_1.UserRole.ADMIN } }));
    if (!admin) {
        admin = userRepo.create({
            email: 'admin@schoolpro.ac.zw',
            username: 'admin',
            passwordHash: hash,
            firstName: 'Peter',
            lastName: 'Admin',
            role: enums_1.UserRole.ADMIN,
            isActive: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
        });
        await userRepo.save(admin);
        console.log('Created admin user: admin / admin');
    }
    else {
        admin.username = 'admin';
        admin.email = 'admin@schoolpro.ac.zw';
        admin.passwordHash = hash;
        admin.role = enums_1.UserRole.ADMIN;
        admin.isActive = true;
        admin.failedLoginAttempts = 0;
        admin.lockedUntil = null;
        await userRepo.save(admin);
        console.log('Updated admin user: username admin, password admin');
    }
    await data_source_1.AppDataSource.destroy();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
