-- CreateTable
CREATE TABLE "TaskWorkLog" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "duration_minutes" INTEGER,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "TaskWorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskWorkLog_task_id_created_at_idx" ON "TaskWorkLog"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "TaskWorkLog_user_id_created_at_idx" ON "TaskWorkLog"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "TaskWorkLog_deleted_at_idx" ON "TaskWorkLog"("deleted_at");

-- AddForeignKey
ALTER TABLE "TaskWorkLog" ADD CONSTRAINT "TaskWorkLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskWorkLog" ADD CONSTRAINT "TaskWorkLog_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
