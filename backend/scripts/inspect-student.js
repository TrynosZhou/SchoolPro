const { Client } = require('pg');

async function main() {
  const name = process.argv[2] || 'Zhou';
  const c = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'admin',
    database: 'schoolpro',
  });
  await c.connect();

  const stu = await c.query(
    `SELECT id, "firstName", "lastName", "admissionNumber"
     FROM students
     WHERE "lastName" ILIKE $1 OR "firstName" ILIKE $1 OR "admissionNumber" ILIKE $1`,
    [`%${name}%`],
  );
  console.log('STUDENT:', JSON.stringify(stu.rows, null, 2));
  if (!stu.rows.length) {
    await c.end();
    return;
  }

  const sid = stu.rows[0].id;
  const inv = await c.query(
    `SELECT i.id, i."invoiceNumber", i.description, i."totalAmount", i."amountPaid",
            i.status, i."feeType", i."termId", i."dueDate", i."issuedDate", t.name AS term_name
     FROM invoices i
     LEFT JOIN terms t ON t.id = i."termId"
     WHERE i."studentId" = $1
     ORDER BY i."createdAt"`,
    [sid],
  );
  console.log('INVOICES:', JSON.stringify(inv.rows, null, 2));

  const tb = await c.query(
    `SELECT stb.*, t.name AS term_name
     FROM student_term_balances stb
     LEFT JOIN terms t ON t.id = stb."termId"
     WHERE stb."studentId" = $1`,
    [sid],
  );
  console.log('TERM BALANCES:', JSON.stringify(tb.rows, null, 2));

  const led = await c.query(
    `SELECT "entryDate", description, debit, credit, balance, "referenceType", "referenceId", "termId"
     FROM ledger_entries
     WHERE "studentId" = $1
     ORDER BY "createdAt"`,
    [sid],
  );
  console.log('LEDGER:', JSON.stringify(led.rows, null, 2));

  const pay = await c.query(
    `SELECT "paymentReference", amount, label, "paidAt", "invoiceId"
     FROM payments
     WHERE "studentId" = $1
     ORDER BY "paidAt"`,
    [sid],
  );
  console.log('PAYMENTS:', JSON.stringify(pay.rows, null, 2));

  const bal = await c.query(
    `SELECT
       COALESCE(SUM("totalAmount"), 0) AS "totalInvoiced",
       COALESCE(SUM("amountPaid"), 0) AS "totalPaid",
       COALESCE(SUM(GREATEST("totalAmount" - "amountPaid", 0)), 0) AS balance
     FROM invoices
     WHERE "studentId" = $1
       AND status NOT IN ('cancelled', 'draft')`,
    [sid],
  );
  console.log('BALANCE SUMMARY:', JSON.stringify(bal.rows[0], null, 2));

  await c.end();
}

async function listTerms() {
  const c = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'admin',
    database: 'schoolpro',
  });
  await c.connect();
  const t = await c.query(
    `SELECT t.id, t.name, t."termNumber", t."startDate", t."endDate", t."isCurrent", y.name AS year
     FROM terms t
     JOIN school_years y ON y.id = t."schoolYearId"
     ORDER BY y."startDate", t."termNumber"`,
  );
  console.log('TERMS:', JSON.stringify(t.rows, null, 2));
  await c.end();
}

async function termUsage(termId) {
  const c = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'admin',
    database: 'schoolpro',
  });
  await c.connect();
  const tables = ['invoices', 'student_term_balances', 'ledger_entries', 'payments'];
  for (const table of tables) {
    const r = await c.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE "termId" = $1`, [termId]);
    console.log(`${table}: ${r.rows[0].n}`);
  }
  await c.end();
}

if (process.argv[2] === '--terms') {
  listTerms().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else if (process.argv[2] === '--term-usage') {
  termUsage(process.argv[3]).catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
