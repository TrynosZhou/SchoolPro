# Backend automated tests

## Install (dev dependencies)
    npm i -D jest ts-jest @types/jest supertest @types/supertest

## package.json scripts
    "test": "jest",
    "test:unit": "jest src/__tests__/unit",
    "test:e2e": "jest src/__tests__/e2e"

## What is covered
Unit  (src/__tests__/unit)
- totp.test.ts            RFC 6238 vectors, drift window, backup-code format
- two-factor.test.ts      enrolment, TOTP/backup-code challenge, single-use codes, revoke
- paynow.test.ts          SHA512 hash sign/verify, form parsing, status + method mapping
- paynow-webhook.test.ts  hash check, post-once idempotency, cancel/fail, retry-on-error
- finance-payments.test.ts recordFeePayment: allocation, partial/paid, overpayment, ledger, cashbook, GL, receipt, rollback
- general-ledger.test.ts  postEntry double entry, running balances, validation, fee→account mapping
- payroll.test.ts         period bounds (UTC, leap year), gross/deductions/net

E2E   (src/__tests__/e2e) - real Express routers via supertest; persistence is an in-memory fake
- auth-login.e2e.test.ts          login, lockout, 2FA challenge (TOTP + backup code), forged tokens
- invoicing-payment.e2e.test.ts   create invoice → parent starts Paynow → signed webhook → invoice paid,
                                  ledger credit, GL post, receipt; replay-safe; forged hash; manual payment
