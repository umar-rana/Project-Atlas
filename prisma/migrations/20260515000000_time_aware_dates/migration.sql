-- Time-aware date fields (Capture Processing Refinement CR, CP-2)
--
-- Adds three Boolean flags to Task and a String preference to User.
-- The flags carry user-intent ("did the parser/user specify a time?")
-- through to display logic, so we can show "Tomorrow at 3:00 PM" vs.
-- "Tomorrow" without inferring from the time component of the datetime.
-- Per CR rule 8.11, the flag is the source of truth — display checks the
-- flag, not the time component.
--
-- All flags default to false so existing rows are treated as all-day,
-- which matches the pre-CR behavior. The default_event_time defaults to
-- 09:00 (per CR §3.4.5).
--
-- Non-breaking: existing dates continue to work; the new columns just
-- give the system a way to record whether a time was explicitly chosen.

ALTER TABLE "Task"
    ADD COLUMN "due_date_has_time"       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN "defer_date_has_time"     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN "follow_up_date_has_time" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "User"
    ADD COLUMN "default_event_time" TEXT NOT NULL DEFAULT '09:00';
