-- CreateIndex
CREATE INDEX "AICallLog_user_id_created_at_idx" ON "AICallLog"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "Capture_user_id_created_at_idx" ON "Capture"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "Task_user_id_defer_date_idx" ON "Task"("user_id", "defer_date");

-- CreateIndex
CREATE INDEX "Task_recurrence_parent_id_idx" ON "Task"("recurrence_parent_id");
