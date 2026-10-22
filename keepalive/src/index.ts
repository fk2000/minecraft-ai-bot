interface Env {
  TARGET_URL: string;
}

async function ping(env: Env): Promise<string> {
  const base = env.TARGET_URL.replace(/\/+$/, '');
  if (!base || base.includes('REPLACE_ME')) return 'TARGET_URL is not configured';
  try {
    const res = await fetch(`${base}/healthz`, {
      headers: { 'user-agent': 'minecraft-ai-bot-keepalive' },
      signal: AbortSignal.timeout(60_000)
    });
    return `status ${res.status}`;
  } catch (error) {
    return `error ${error instanceof Error ? error.message : String(error)}`;
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(ping(env).then((result) => console.log(`[keepalive] ${result}`)));
  }
} satisfies ExportedHandler<Env>;
