const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'admin',
    database: 'schoolpro',
  });
  await c.connect();
  const sid = 'c0880b67-2c80-4538-9c58-767d77a6da8c';

  const inv = await c.query(
    `SELECT id, "invoiceNumber", description, "totalAmount", "amountPaid", status, "feeType", "termId"
     FROM invoices WHERE "studentId" = $1 ORDER BY "createdAt"`,
    [sid],
  );
  console.log('INVOICES:', JSON.stringify(inv.rows, null, 2));

  const adj = await c.query(`SELECT * FROM invoice_adjustments WHERE "studentId" = $1`, [sid]);
  console.log('ADJUSTMENTS:', JSON.stringify(adj.rows, null, 2));

  const lines = await c.query(
    `SELECT i."invoiceNumber", il.description, il.amount
     FROM invoice_lines il JOIN invoices i ON i.id = il."invoiceId"
     WHERE i."studentId" = $1 ORDER BY i."createdAt", il.description`,
    [sid],
  );
  console.log('LINES:', JSON.stringify(lines.rows, null, 2));

  const led = await c.query(
    `SELECT "entryDate", description, debit, credit, balance, "referenceType", "termId"
     FROM ledger_entries WHERE "studentId" = $1 ORDER BY "createdAt"`,
    [sid],
  );
  console.log('LEDGER:', JSON.stringify(led.rows, null, 2));

  const pay = await c.query(
    `SELECT "paymentReference", amount, label, "invoiceId", "paidAt" FROM payments WHERE "studentId" = $1`,
    [sid],
  );
  console.log('PAYMENTS:', JSON.stringify(pay.rows, null, 2));

  const owed = await c.query(
    `SELECT COALESCE(SUM(GREATEST("totalAmount" - "amountPaid", 0)), 0) as owed
     FROM invoices WHERE "studentId" = $1 AND status IN ('sent', 'partial', 'overdue')`,
    [sid],
  );
  console.log('OUTSTANDING:', owed.rows[0]);

  const tb = await c.query(
    `SELECT t.name, stb."openingBalance", stb."closingBalance"
     FROM student_term_balances stb JOIN terms t ON t.id = stb."termId"
     WHERE stb."studentId" = $1`,
    [sid],
  );
  console.log('TERM BALANCES:', JSON.stringify(tb.rows, null, 2));

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
