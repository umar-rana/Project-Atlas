-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "recurrence_anchor" TEXT NOT NULL DEFAULT 'due_date',
ADD COLUMN     "recurrence_parent_id" UUID,
ADD COLUMN     "recurrence_rule" TEXT;
