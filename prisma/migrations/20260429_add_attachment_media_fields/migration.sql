-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "parent_type" TEXT,
ADD COLUMN "parent_id" TEXT,
ADD COLUMN "thumbnail_path" TEXT,
ADD COLUMN "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
ADD COLUMN "description" TEXT,
ADD COLUMN "reviewed" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN "image_width" INTEGER,
ADD COLUMN "image_height" INTEGER,
ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Attachment_parent_type_parent_id_idx" ON "Attachment"("parent_type", "parent_id");
CREATE INDEX "Attachment_user_id_reviewed_idx" ON "Attachment"("user_id", "reviewed");

-- CreateTable
CREATE TABLE "TagOnAttachment" (
    "attachment_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TagOnAttachment_pkey" PRIMARY KEY ("attachment_id","tag_id")
);

-- CreateIndex
CREATE INDEX "TagOnAttachment_tag_id_idx" ON "TagOnAttachment"("tag_id");

-- AddForeignKey
ALTER TABLE "TagOnAttachment" ADD CONSTRAINT "TagOnAttachment_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagOnAttachment" ADD CONSTRAINT "TagOnAttachment_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
