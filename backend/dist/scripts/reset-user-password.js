"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Reset a user's password by username.
 * Run: npx ts-node src/scripts/reset-user-password.ts <username> <newPassword>
 */
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
async function main() {
    const username = String(process.argv[2] || '').trim();
    const newPassword = String(process.argv[3] || '').trim();
    const createIfMissing = process.argv.includes('--create');
    if (!username || !newPassword) {
        console.error('Usage: npx ts-node src/scripts/reset-user-password.ts <username> <newPassword> [--create]');
        process.exit(1);
    }
    await data_source_1.AppDataSource.initialize();
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const parentRepo = data_source_1.AppDataSource.getRepository(entities_1.Parent);
    let user = (await userRepo.findOne({ where: { username } })) ||
        (await userRepo
            .createQueryBuilder('u')
            .where('LOWER(u.username) = LOWER(:username)', { username })
            .getOne());
    if (!user && createIfMissing) {
        const email = `${username}@schoolpro.ac.zw`.toLowerCase();
        const existingEmail = await userRepo.findOne({ where: { email } });
        if (existingEmail) {
            user = existingEmail;
            user.username = username;
        }
        else {
            const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
            user = await userRepo.save(userRepo.create({
                email,
                username,
                passwordHash,
                firstName: 'Test',
                lastName: 'Parent',
                role: enums_1.UserRole.PARENT,
                isActive: true,
            }));
            await parentRepo.save(parentRepo.create({ userId: user.id }));
            console.log(`Created parent account: ${username} (${email})`);
        }
    }
    if (!user) {
        console.error(`User "${username}" not found.`);
        const similar = await userRepo
            .createQueryBuilder('u')
            .where('u.username ILIKE :q OR u.email ILIKE :q', { q: `%${username}%` })
            .orderBy('u.username', 'ASC')
            .limit(10)
            .getMany();
        if (similar.length) {
            console.error('Similar accounts:');
            for (const row of similar) {
                console.error(`  - ${row.username} (${row.email}) role=${row.role}`);
            }
        }
        else {
            const parents = await userRepo.find({
                where: { role: 'parent' },
                order: { username: 'ASC' },
                take: 20,
            });
            if (parents.length) {
                console.error('Parent accounts in database:');
                for (const row of parents) {
                    console.error(`  - ${row.username} (${row.email})`);
                }
            }
        }
        await data_source_1.AppDataSource.destroy();
        process.exit(1);
    }
    user.passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.isActive = true;
    user.passwordResetTokenHash = null;
    user.passwordResetExpires = null;
    await userRepo.save(user);
    console.log(`Password reset for ${user.username} (${user.email}) role=${user.role}`);
    await data_source_1.AppDataSource.destroy();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
