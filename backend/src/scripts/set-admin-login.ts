/**
 * Ensures the default admin can sign in with username `admin` / password `admin123`.
 * Run: npx ts-node src/scripts/set-admin-login.ts
 */
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities';
import { UserRole } from '../entities/enums';

async function main() {
  await AppDataSource.initialize();
  const userRepo = AppDataSource.getRepository(User);
  const hash = await bcrypt.hash('admin123', 10);

  let admin =
    (await userRepo.findOne({ where: { username: 'admin' } })) ||
    (await userRepo.findOne({ where: { email: 'admin' } })) ||
    (await userRepo.findOne({ where: { email: 'admin@schoolpro.ac.zw' } })) ||
    (await userRepo.findOne({ where: { role: UserRole.ADMIN } }));

  if (!admin) {
    admin = userRepo.create({
      email: 'admin@schoolpro.ac.zw',
      username: 'admin',
      passwordHash: hash,
      firstName: 'Peter',
      lastName: 'Admin',
      role: UserRole.ADMIN,
      isActive: true,
    });
    await userRepo.save(admin);
    console.log('Created admin user: admin / admin123');
  } else {
    admin.username = 'admin';
    admin.email = 'admin@schoolpro.ac.zw';
    admin.passwordHash = hash;
    admin.isActive = true;
    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null;
    await userRepo.save(admin);
    console.log('Updated admin user: username admin, password admin123');
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
