export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobRunner } = await import("@/core/jobs/runner");
    const { createLogger } = await import("@/core/logging");
    const log = createLogger({ module: "instrumentation" });

    await startJobRunner().catch((err) => {
      log.error(
        { err },
        "CRITICAL: job runner failed to start — scheduled jobs will not run. " +
          "Check DATABASE_URL_NEON and pg-boss configuration.",
      );
    });
  }
}
