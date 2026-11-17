import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole } from '../../entities/enums';
import { generateTotp, generateTotpSecret } from '../../services/totp.service';
import { confirmEnrollment } from '../../services/two-factor.service';
import { makeRepo } from '../helpers';

let userRepo: any;
const policy = { maxLoginAttempts: 3, lockoutDurationMinutes: 15, sessionTimeoutMinutes: 60 };

jest.mock('../../config/data-source', () => ({ AppDataSource: { getRepository: () => userRepo } }));
jest.mock('../../services/security-policy.service', () => ({ getSecurityPolicy: jest.fn(async () => policy) }));
jest.mock('../../services/role-permissions.service', () => ({
  ensureDefaultRoles: jest.fn(),
  loadUserWithRole: jest.fn(async (id: string) => userRepo.rows.find((u: any) => u.id === id)),
  resolvePermissionsForUser: jest.fn(() => ['finance:view']),
}));
jest.mock('../../utils/user-auth', () => ({
  normalizeLoginIdentifier: (s: string) => s.trim().toLowerCase(),
  findActiveUserByLoginIdentifier: jest.fn(async (id: string) =>
    userRepo.rows.find((u: any) => u.isActive && (u.username === id.toLowerCase() || u.email === id.toLowerCase())) ?? null),
}));

import authRoutes from '../../routes/auth.routes';
import { env } from '../../config/env';

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

const PASSWORD = 'Correct-Horse-9';
let admin: any;

beforeEach(async () => {
  admin = {
    id: 'u-admin', username: 'bursar', email: 'bursar@school.test', firstName: 'Bea', lastName: 'Ndlovu',
    role: UserRole.ADMIN, isActive: true, failedLoginAttempts: 0, lockedUntil: null,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  };
  userRepo = makeRepo([admin]);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /auth/login', () => {
  it('requires username and password', async () => {
    const res = await request(app).post('/auth/login').send({ username: 'bursar' });
    expect(res.status).toBe(400);
  });

  it('signs in with valid credentials and returns a verifiable JWT', async () => {
    const res = await request(app).post('/auth/login').send({ username: 'bursar', password: PASSWORD });
    expect(res.status).toBe(200);
    const payload: any = jwt.verify(res.body.token, env.jwt.secret);
    expect(payload).toMatchObject({ userId: 'u-admin', role: 'admin' });
    expect(res.body.user).toMatchObject({ email: 'bursar@school.test', role: 'admin' });
  });

  it('rejects a wrong password and counts the failed attempt', async () => {
    const res = await request(app).post('/auth/login').send({ username: 'bursar', password: 'nope' });
    expect(res.status).toBe(401);
    expect(admin.failedLoginAttempts).toBe(1);
  });

  it('locks the account after too many failures', async () => {
    let res;
    for (let i = 0; i < 3; i++) res = await request(app).post('/auth/login').send({ username: 'bursar', password: 'bad' });
    expect(res!.status).toBe(423);
    expect(admin.lockedUntil).toBeTruthy();
  });

  it('answers 401 for an unknown user', async () => {
    const res = await request(app).post('/auth/login').send({ username: 'ghost', password: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('two-factor sign-in', () => {
  let secret: string;
  let backupCodes: string[];

  beforeEach(async () => {
    secret = generateTotpSecret();
    admin.twoFactorPendingSecret = secret;
    backupCodes = (await confirmEnrollment(admin, generateTotp(secret)))!;
  });

  const passwordStep = async () => (await request(app).post('/auth/login').send({ username: 'bursar', password: PASSWORD })).body;

  it('withholds the session token until the second step is completed', async () => {
    const body = await passwordStep();
    expect(body.twoFactorRequired).toBe(true);
    expect(body.token).toBeUndefined();
    expect(typeof body.challengeToken).toBe('string');
  });

  it('issues a session for a valid authenticator code', async () => {
    const { challengeToken } = await passwordStep();
    const res = await request(app).post('/auth/2fa/challenge').send({ challengeToken, code: generateTotp(secret) });
    expect(res.status).toBe(200);
    expect((jwt.verify(res.body.token, env.jwt.secret) as any).userId).toBe('u-admin');
  });

  it('rejects a wrong code', async () => {
    const { challengeToken } = await passwordStep();
    const res = await request(app).post('/auth/2fa/challenge').send({ challengeToken, code: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('accepts a backup code once, then refuses it', async () => {
    const first = await passwordStep();
    const ok = await request(app).post('/auth/2fa/challenge').send({ challengeToken: first.challengeToken, backupCode: backupCodes[0] });
    expect(ok.status).toBe(200);

    const second = await passwordStep();
    const reuse = await request(app).post('/auth/2fa/challenge').send({ challengeToken: second.challengeToken, backupCode: backupCodes[0] });
    expect(reuse.status).toBe(401);
  });

  it('refuses forged tokens, and a normal session token is not a valid challenge', async () => {
    const forged = jwt.sign({ userId: 'u-admin', purpose: '2fa' }, 'wrong-secret');
    expect((await request(app).post('/auth/2fa/challenge').send({ challengeToken: forged, code: generateTotp(secret) })).status).toBe(401);

    const session = jwt.sign({ userId: 'u-admin', role: 'admin' }, env.jwt.secret);
    const res = await request(app).post('/auth/2fa/challenge').send({ challengeToken: session, code: generateTotp(secret) });
    expect(res.status).toBe(401);
    expect(res.body.restartLogin).toBe(true);
  });
});
