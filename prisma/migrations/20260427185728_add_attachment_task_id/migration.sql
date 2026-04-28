-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "task_id" UUID;

-- CreateIndex
CREATE INDEX "Attachment_task_id_idx" ON "Attachment"("task_id");
