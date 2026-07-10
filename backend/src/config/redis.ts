import Redis from 'ioredis';
import { env } from './env';

export function getRedisConnectionOptions() {
  return {
    url: env.redis.url,
    maxRetriesPerRequest: null as null,
  };
}

/** Quick connectivity probe — used at boot to avoid a BullMQ worker that spams ECONNREFUSED. */
export async function probeRedis(timeoutMs = 2500): Promise<boolean> {
  if (!env.redis.enabled) return false;

  const client = new Redis(env.redis.url, {
    connectTimeout: timeoutMs,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy: () => null,
  });

  try {
    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}
