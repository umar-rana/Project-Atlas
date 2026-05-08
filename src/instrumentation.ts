export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobRunner, stopJobRunner } = await import("@/core/jobs/runner");
    const { createLogger } = await import("@/core/logging");
    const log = createLogger({ module: "instrumentation" });

    await startJobRunner().catch((err) => {
      log.error(
        { err },
        "CRITICAL: job runner failed to start — scheduled jobs will not run. " +
          "Check DATABASE_URL_NEON and pg-boss configuration.",
      );
    });

    const g = globalThis as unknown as { __atlasShutdownInstalled?: boolean };
    if (!g.__atlasShutdownInstalled) {
      g.__atlasShutdownInstalled = true;
      let shuttingDown = false;
      const shutdown = (signal: NodeJS.Signals) => {
        if (shuttingDown) return;
        shuttingDown = true;
        log.info({ signal }, "received shutdown signal — stopping pg-boss");
        const forceExitMs = 4000;
        const forceTimer = setTimeout(() => {
          log.warn({ forceExitMs }, "shutdown timed out — forcing exit");
          process.exit(0);
        }, forceExitMs);
        forceTimer.unref();
        stopJobRunner()
          .catch((err) => log.warn({ err }, "stopJobRunner threw"))
          .finally(() => {
            clearTimeout(forceTimer);
            process.exit(0);
          });
      };
      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
    }
  }
}
