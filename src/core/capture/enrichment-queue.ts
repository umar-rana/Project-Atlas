import { createLogger } from "@/core/logging";

const log = createLogger({ module: "enrichment-queue" });

export type EnrichmentJob = () => Promise<void>;

let running = false;
const queue: EnrichmentJob[] = [];

async function drain(): Promise<void> {
  if (running) return;
  running = true;

  while (queue.length > 0) {
    const job = queue.shift();
    if (!job) break;
    try {
      await job();
    } catch (err) {
      log.error({ err }, "Enrichment job failed");
    }
  }

  running = false;
}

export function enqueueEnrichment(job: EnrichmentJob): void {
  queue.push(job);
  void drain();
}

export function getQueueDepth(): number {
  return queue.length;
}
