-- CreateTable
CREATE TABLE "Capture" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "raw_text" TEXT NOT NULL,
    "title" TEXT,
    "tags" TEXT[],
    "due_date" TIMESTAMPTZ,
    "action_items" TEXT[],
    "ai_parsed" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Capture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Capture_user_id_idx" ON "Capture"("user_id");

-- CreateIndex
CREATE INDEX "Capture_deleted_at_idx" ON "Capture"("deleted_at");

-- AddForeignKey
ALTER TABLE "Capture" ADD CONSTRAINT "Capture_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
