-- AddColumn: tracker fields to Project
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "tracker_table_id"  UUID,
  ADD COLUMN IF NOT EXISTS "tracker_column_id" UUID,
  ADD COLUMN IF NOT EXISTS "tracker_aggregation" TEXT,
  ADD COLUMN IF NOT EXISTS "tracker_target_value" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "tracker_target_label" TEXT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tracker_table_id_fkey"
  FOREIGN KEY ("tracker_table_id") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_tracker_column_id_fkey"
  FOREIGN KEY ("tracker_column_id") REFERENCES "TableColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_tracker_table_id_idx" ON "Project"("tracker_table_id");
CREATE INDEX IF NOT EXISTS "Project_tracker_column_id_idx" ON "Project"("tracker_column_id");
