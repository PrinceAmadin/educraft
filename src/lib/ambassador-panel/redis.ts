import { createClient } from "redis";

/**
 * Redis access for the ambassador panel. SERVER ONLY.
 *
 * Same store and same keys as the original Educraft_Ambassador deployment, so
 * both can run side by side during the move: a click on an old
 * edu-craft-ambassador.vercel.app link and a click on an HQ link increment the
 * same counter.
 *
 * One short-lived connection per request, as the original did — serverless
 * functions don't keep sockets between invocations.
 */

export type RedisClient = ReturnType<typeof createClient>;

export class PanelNotConfiguredError extends Error {
  constructor(readonly missing: string) {
    super(`${missing} is not set. Add it to .env.local (and to the Vercel project) to use the ambassador panel.`);
  }
}

export function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export async function withRedis<T>(fn: (client: RedisClient) => Promise<T>): Promise<T> {
  const url = process.env.REDIS_URL;
  if (!url) throw new PanelNotConfiguredError("REDIS_URL");

  const client = createClient({ url });
  // A dropped socket must never crash the function; the command that needed it
  // will reject on its own and surface as a normal error.
  client.on("error", () => {});
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.quit().catch(() => client.disconnect().catch(() => {}));
  }
}
