-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "folder_id" UUID,
ADD COLUMN     "last_reviewed_at" TIMESTAMPTZ,
ADD COLUMN     "review_interval_days" INTEGER;

-- CreateTable
CREATE TABLE "ProjectFolder" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "collapsed" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ProjectFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectFolder_user_id_idx" ON "ProjectFolder"("user_id");

-- CreateIndex
CREATE INDEX "ProjectFolder_user_id_parent_id_idx" ON "ProjectFolder"("user_id", "parent_id");

-- CreateIndex
CREATE INDEX "ProjectFolder_deleted_at_idx" ON "ProjectFolder"("deleted_at");

-- CreateIndex
CREATE INDEX "Project_user_id_folder_id_idx" ON "Project"("user_id", "folder_id");

-- AddForeignKey
ALTER TABLE "ProjectFolder" ADD CONSTRAINT "ProjectFolder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFolder" ADD CONSTRAINT "ProjectFolder_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ProjectFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "ProjectFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
