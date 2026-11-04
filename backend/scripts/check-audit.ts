import { AppDataSource } from '../src/config/data-source';

(async () => {
  await AppDataSource.initialize();
  try {
    const count = await AppDataSource.query('SELECT COUNT(*)::int AS c FROM audit_logs');
    console.log('audit_logs count:', count[0]?.c);
    const sample = await AppDataSource.query(
      `SELECT id, action, module, "recordLabel", "userEmail", "createdAt"
       FROM audit_logs ORDER BY "createdAt" DESC LIMIT 5`,
    );
    console.log('sample:', JSON.stringify(sample, null, 2));
  } catch (err) {
    console.error('ERR:', err instanceof Error ? err.message : err);
  } finally {
    await AppDataSource.destroy();
  }
})();
