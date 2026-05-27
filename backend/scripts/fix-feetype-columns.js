/**
 * One-time fix: migrate payments/invoices feeType from PostgreSQL enum to varchar.
 * Run: node scripts/fix-feetype-columns.js
 */
const { Client } = require('pg');

async function migrateFeeType(client, table) {
  const col = await client.query(
    `SELECT data_type, udt_name FROM information_schema.columns WHERE table_name=$1 AND column_name='feeType'`,
    [table],
  );
  if (!col.rows.length) {
    console.log(`${table}: feeType column missing — will be created by TypeORM`);
    return;
  }
  const { data_type, udt_name } = col.rows[0];
  if (data_type === 'character varying' || data_type === 'varchar') {
    console.log(`${table}: feeType already varchar`);
    return;
  }
  console.log(`${table}: migrating feeType from ${udt_name} to varchar`);
  await client.query(`ALTER TABLE "${table}" ALTER COLUMN "feeType" TYPE varchar(64) USING "feeType"::text`);
  await client.query(`UPDATE "${table}" SET "feeType" = 'other' WHERE "feeType" IS NULL OR "feeType" = ''`);
  await client.query(`ALTER TABLE "${table}" ALTER COLUMN "feeType" SET DEFAULT 'other'`);
  await client.query(`ALTER TABLE "${table}" ALTER COLUMN "feeType" SET NOT NULL`);
}

async function dropOrphanEnum(client, enumName) {
  const res = await client.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [enumName]);
  if (res.rows.length) {
    await client.query(`DROP TYPE IF EXISTS "${enumName}"`);
    console.log(`Dropped enum ${enumName}`);
  }
}

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'admin',
    database: 'schoolpro',
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await migrateFeeType(client, 'payments');
    await migrateFeeType(client, 'invoices');
    await dropOrphanEnum(client, 'payments_feetype_enum');
    await dropOrphanEnum(client, 'invoices_feetype_enum');
    await client.query('COMMIT');
    console.log('Done.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
