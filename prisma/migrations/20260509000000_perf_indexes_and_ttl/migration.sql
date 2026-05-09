-- Performance indexes (audit perf-1)
--
-- 1. AICallLog: cost-cap and per-task-rate-limit checks in
--    src/core/ai/limits.ts filter on (user_id, task, created_at). The existing
--    (user_id, created_at) index requires a post-filter on `task`. This compound
--    index lets the planner satisfy the predicate from the index directly.
CREATE INDEX IF NOT EXISTS "AICallLog_user_id_task_created_at_idx"
    ON "AICallLog" ("user_id", "task", "created_at");

-- 2. RateLimitTracker: the daily cleanup job (handlers/rate-limit-tracker-cleanup.ts)
--    runs DELETE WHERE window_start < cutoff. Without this index the delete is
--    a full table scan as RateLimitTracker grows.
CREATE INDEX IF NOT EXISTS "RateLimitTracker_window_start_idx"
    ON "RateLimitTracker" ("window_start");
