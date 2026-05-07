-- Wave 6a: Calendar Foundation
-- GoogleCalendarOAuthToken, GoogleCalendar, CalendarEvent, CalendarEventAttendee

CREATE TABLE "GoogleCalendarOAuthToken" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "encrypted_data" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "email" TEXT,
  "expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "GoogleCalendarOAuthToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleCalendarOAuthToken_user_id_key" ON "GoogleCalendarOAuthToken"("user_id");
CREATE INDEX "GoogleCalendarOAuthToken_user_id_idx" ON "GoogleCalendarOAuthToken"("user_id");
ALTER TABLE "GoogleCalendarOAuthToken" ADD CONSTRAINT "GoogleCalendarOAuthToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GoogleCalendar" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "google_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "time_zone" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "access_role" TEXT NOT NULL DEFAULT 'reader',
  "google_color_id" TEXT,
  "color_override" TEXT,
  "is_visible" BOOLEAN NOT NULL DEFAULT true,
  "is_synced" BOOLEAN NOT NULL DEFAULT true,
  "next_sync_token" TEXT,
  "last_synced_at" TIMESTAMPTZ,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "GoogleCalendar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleCalendar_user_id_google_id_key" ON "GoogleCalendar"("user_id", "google_id");
CREATE INDEX "GoogleCalendar_user_id_idx" ON "GoogleCalendar"("user_id");
CREATE INDEX "GoogleCalendar_deleted_at_idx" ON "GoogleCalendar"("deleted_at");
ALTER TABLE "GoogleCalendar" ADD CONSTRAINT "GoogleCalendar_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CalendarEvent" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "calendar_id" UUID,
  "source" TEXT NOT NULL DEFAULT 'atlas',
  "google_event_id" TEXT,
  "title" TEXT NOT NULL DEFAULT '',
  "description" TEXT,
  "location" TEXT,
  "start_at" TIMESTAMPTZ NOT NULL,
  "end_at" TIMESTAMPTZ NOT NULL,
  "all_day" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "recurrence_rule" TEXT,
  "recurrence_master_id" UUID,
  "external_url" TEXT,
  "linked_task_id" UUID,
  "linked_project_id" UUID,
  "linked_note_id" UUID,
  "organizer_email" TEXT,
  "organizer_name" TEXT,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarEvent_user_id_google_event_id_calendar_id_key" ON "CalendarEvent"("user_id", "google_event_id", "calendar_id");
CREATE INDEX "CalendarEvent_user_id_idx" ON "CalendarEvent"("user_id");
CREATE INDEX "CalendarEvent_user_id_calendar_id_idx" ON "CalendarEvent"("user_id", "calendar_id");
CREATE INDEX "CalendarEvent_user_id_start_at_end_at_idx" ON "CalendarEvent"("user_id", "start_at", "end_at");
CREATE INDEX "CalendarEvent_linked_task_id_idx" ON "CalendarEvent"("linked_task_id");
CREATE INDEX "CalendarEvent_linked_project_id_idx" ON "CalendarEvent"("linked_project_id");
CREATE INDEX "CalendarEvent_linked_note_id_idx" ON "CalendarEvent"("linked_note_id");
CREATE INDEX "CalendarEvent_recurrence_master_id_idx" ON "CalendarEvent"("recurrence_master_id");
CREATE INDEX "CalendarEvent_deleted_at_idx" ON "CalendarEvent"("deleted_at");
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "GoogleCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_linked_task_id_fkey" FOREIGN KEY ("linked_task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_linked_project_id_fkey" FOREIGN KEY ("linked_project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_linked_note_id_fkey" FOREIGN KEY ("linked_note_id") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_recurrence_master_id_fkey" FOREIGN KEY ("recurrence_master_id") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CalendarEventAttendee" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "display_name" TEXT,
  "response_status" TEXT NOT NULL DEFAULT 'needsAction',
  "is_organizer" BOOLEAN NOT NULL DEFAULT false,
  "is_self" BOOLEAN NOT NULL DEFAULT false,
  "person_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "CalendarEventAttendee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarEventAttendee_event_id_email_key" ON "CalendarEventAttendee"("event_id", "email");
CREATE INDEX "CalendarEventAttendee_event_id_idx" ON "CalendarEventAttendee"("event_id");
CREATE INDEX "CalendarEventAttendee_person_id_idx" ON "CalendarEventAttendee"("person_id");
ALTER TABLE "CalendarEventAttendee" ADD CONSTRAINT "CalendarEventAttendee_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventAttendee" ADD CONSTRAINT "CalendarEventAttendee_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
