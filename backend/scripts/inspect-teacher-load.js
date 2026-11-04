require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'school_pro',
  });
  await c.connect();

  const staff = await c.query(`
    SELECT st.id, st."employeeNumber", u."firstName", u."lastName", u.role, st."isActive"
    FROM staff st
    JOIN users u ON u.id = st."userId"
    WHERE u."lastName" ILIKE '%Zhou%' OR u."firstName" ILIKE '%Trynos%'
  `);
  console.log('Staff:', JSON.stringify(staff.rows, null, 2));

  const cols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'class_subjects' ORDER BY ordinal_position
  `);
  console.log('class_subjects columns:', cols.rows.map((r) => r.column_name).join(', '));

  const cs = await c.query(`
    SELECT cs.id, cs."classId", cs."subjectId", cs."teacherId",
      COALESCE(cs."weeklyPeriods", 0) AS "weeklyPeriods",
      c.name AS class_name, s.name AS subject_name,
      u."firstName", u."lastName", u.role, st."isActive"
    FROM class_subjects cs
    LEFT JOIN classes c ON c.id = cs."classId"
    LEFT JOIN subjects s ON s.id = cs."subjectId"
    LEFT JOIN staff st ON st.id = cs."teacherId"
    LEFT JOIN users u ON u.id = st."userId"
    WHERE cs."teacherId" IS NOT NULL
    ORDER BY u."lastName", c.name
  `);
  console.log('Assignments:', JSON.stringify(cs.rows, null, 2));

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
