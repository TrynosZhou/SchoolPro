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
  const pay = await c.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='payments' AND column_name='feeType'`,
  );
  const inv = await c.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='invoices' AND column_name='feeType'`,
  );
  const fees = await c.query(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='school_fees') AS exists`,
  );
  console.log('payments feeType:', pay.rows);
  console.log('invoices feeType:', inv.rows);
  console.log('school_fees table:', fees.rows[0]);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
