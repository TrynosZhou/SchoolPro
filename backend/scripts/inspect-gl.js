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

  const tables = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('general_ledger_entries', 'chart_of_accounts')
  `);
  console.log('TABLES:', tables.rows);

  if (tables.rows.length) {
    const gl = await c.query('SELECT COUNT(*)::int as n FROM general_ledger_entries');
    console.log('GL_COUNT:', gl.rows[0]);
    const coa = await c.query('SELECT "accountCode", "accountName" FROM chart_of_accounts ORDER BY "accountCode"');
    console.log('COA:', coa.rows.length, 'accounts');
    const sample = await c.query(`
      SELECT id, "transactionDate", description, "debitAmount", "creditAmount", "referenceType", "createdAt"
      FROM general_ledger_entries ORDER BY "createdAt" DESC LIMIT 8
    `);
    console.log('SAMPLE:', JSON.stringify(sample.rows, null, 2));
  }

  const pays = await c.query(`
    SELECT id, amount, "paidAt", "paymentReference" FROM payments ORDER BY "paidAt" DESC LIMIT 5
  `);
  console.log('RECENT PAYMENTS:', JSON.stringify(pays.rows, null, 2));

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
