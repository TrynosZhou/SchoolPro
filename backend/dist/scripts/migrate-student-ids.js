"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Rewrites existing student admission numbers to the 10-digit format:
 *   {prefix}{RRRR}{MM}{YYYY}
 * - prefix from school_settings.studentIdPrefix (default SP)
 * - RRRR = 4 random digits
 * - MM = month of student's date of birth
 * - YYYY = year the student was registered (createdAt / enrollmentDate)
 *
 * Run: npm run students:migrate-ids
 * Dry run: npm run students:migrate-ids -- --dry-run
 */
const crypto_1 = require("crypto");
const data_source_1 = require("../config/data-source");
const entities_1 = require("../entities");
const enums_1 = require("../entities/enums");
const DEFAULT_PREFIX = 'SP';
function resolvePrefix(raw) {
    const cleaned = String(raw || DEFAULT_PREFIX)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8);
    return cleaned || DEFAULT_PREFIX;
}
function extractDobMonth(dateOfBirth) {
    if (!dateOfBirth)
        return '01';
    if (typeof dateOfBirth === 'string') {
        const match = dateOfBirth.trim().match(/^(\d{4})-(\d{2})/);
        if (match) {
            const month = Number(match[2]);
            if (month >= 1 && month <= 12)
                return String(month).padStart(2, '0');
        }
        const parsed = new Date(dateOfBirth);
        if (!Number.isNaN(parsed.getTime())) {
            return String(parsed.getUTCMonth() + 1).padStart(2, '0');
        }
        return '01';
    }
    if (dateOfBirth instanceof Date && !Number.isNaN(dateOfBirth.getTime())) {
        return String(dateOfBirth.getUTCMonth() + 1).padStart(2, '0');
    }
    return '01';
}
function registrationYear(student) {
    if (student.enrollmentDate) {
        const match = String(student.enrollmentDate).match(/^(\d{4})/);
        if (match)
            return match[1];
    }
    if (student.createdAt instanceof Date && !Number.isNaN(student.createdAt.getTime())) {
        return String(student.createdAt.getFullYear());
    }
    return String(new Date().getFullYear());
}
/** True when ID already matches {prefix}{RRRR}{MM}{YYYY} (10 digits). */
function alreadyNewFormat(admissionNumber, prefix) {
    if (!admissionNumber.startsWith(prefix))
        return false;
    const digits = admissionNumber.slice(prefix.length);
    if (!/^\d{10}$/.test(digits))
        return false;
    const month = Number(digits.slice(4, 6));
    const year = Number(digits.slice(6, 10));
    return month >= 1 && month <= 12 && year >= 1990 && year <= 2100;
}
async function allocateId(prefix, month, year, used) {
    for (let attempt = 0; attempt < 200; attempt++) {
        const candidate = `${prefix}${String((0, crypto_1.randomInt)(0, 10000)).padStart(4, '0')}${month}${year}`;
        if (used.has(candidate))
            continue;
        used.add(candidate);
        return candidate;
    }
    throw new Error(`Could not allocate unique ID for month ${month} year ${year} (prefix ${prefix})`);
}
async function main() {
    const dryRun = process.argv.includes('--dry-run');
    await data_source_1.AppDataSource.initialize();
    const settings = await data_source_1.AppDataSource.getRepository(entities_1.SchoolSettings).findOne({
        where: { id: 'default' },
    });
    const prefix = resolvePrefix(settings?.studentIdPrefix);
    console.log(`Student ID prefix: ${prefix}`);
    if (dryRun)
        console.log('Dry run — no changes will be saved.\n');
    const studentRepo = data_source_1.AppDataSource.getRepository(entities_1.Student);
    const userRepo = data_source_1.AppDataSource.getRepository(entities_1.User);
    const students = await studentRepo.find({
        order: { createdAt: 'ASC' },
        relations: { user: true },
    });
    const used = new Set(students
        .map((s) => s.admissionNumber)
        .filter((id) => alreadyNewFormat(id, prefix)));
    let updated = 0;
    let skipped = 0;
    let usernameSynced = 0;
    for (const student of students) {
        const oldId = student.admissionNumber;
        if (alreadyNewFormat(oldId, prefix)) {
            skipped += 1;
            console.log(`SKIP  ${oldId} (${student.firstName} ${student.lastName}) — already 10-digit format`);
            continue;
        }
        const month = extractDobMonth(student.dateOfBirth);
        const year = registrationYear(student);
        const newId = await allocateId(prefix, month, year, used);
        console.log(`${dryRun ? 'WOULD ' : ''}UPDATE ${oldId} → ${newId}  (${student.firstName} ${student.lastName}` +
            `; DOB month ${month}; registered ${year})`);
        if (!dryRun) {
            student.admissionNumber = newId;
            await studentRepo.save(student);
            if (student.userId) {
                const user = student.user ||
                    (await userRepo.findOne({ where: { id: student.userId } }));
                if (user &&
                    user.role === enums_1.UserRole.STUDENT &&
                    (user.username === oldId || user.email === oldId)) {
                    if (user.username === oldId)
                        user.username = newId;
                    if (user.email === oldId)
                        user.email = `${newId}@student.local`;
                    await userRepo.save(user);
                    usernameSynced += 1;
                }
            }
        }
        updated += 1;
    }
    console.log('\nDone.');
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped (already 10-digit format): ${skipped}`);
    if (!dryRun)
        console.log(`  Portal usernames synced: ${usernameSynced}`);
    if (dryRun)
        console.log('  Re-run without --dry-run to apply changes.');
    await data_source_1.AppDataSource.destroy();
}
main().catch(async (err) => {
    console.error(err);
    if (data_source_1.AppDataSource.isInitialized)
        await data_source_1.AppDataSource.destroy();
    process.exit(1);
});
