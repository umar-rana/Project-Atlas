-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ai_confidence_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.70;

-- CreateTable
CREATE TABLE "EmailCapture" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "from_address" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "subject" TEXT,
    "body_text" TEXT,
    "body_html" TEXT,
    "message_id" TEXT,
    "received_at" TIMESTAMPTZ NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "task_id" UUID,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "EmailCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureParseLog" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID,
    "raw_text" TEXT NOT NULL,
    "parse_tier" TEXT NOT NULL,
    "local_confidence" DOUBLE PRECISION NOT NULL,
    "ai_used" BOOLEAN NOT NULL DEFAULT false,
    "ai_model" TEXT,
    "ai_input_tokens" INTEGER,
    "ai_output_tokens" INTEGER,
    "ai_cost_usd" DOUBLE PRECISION,
    "parse_duration_ms" INTEGER NOT NULL,
    "title" TEXT,
    "due_date" TIMESTAMPTZ,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contexts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "project_hint" TEXT,
    "ai_error" TEXT,
    "source" TEXT NOT NULL DEFAULT 'modal',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptureParseLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailCapture_message_id_key" ON "EmailCapture"("message_id");

-- CreateIndex
CREATE INDEX "EmailCapture_user_id_idx" ON "EmailCapture"("user_id");

-- CreateIndex
CREATE INDEX "EmailCapture_user_id_status_idx" ON "EmailCapture"("user_id", "status");

-- CreateIndex
CREATE INDEX "EmailCapture_received_at_idx" ON "EmailCapture"("received_at");

-- CreateIndex
CREATE INDEX "CaptureParseLog_user_id_idx" ON "CaptureParseLog"("user_id");

-- CreateIndex
CREATE INDEX "CaptureParseLog_user_id_parse_tier_idx" ON "CaptureParseLog"("user_id", "parse_tier");

-- CreateIndex
CREATE INDEX "CaptureParseLog_user_id_created_at_idx" ON "CaptureParseLog"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "CaptureParseLog_created_at_idx" ON "CaptureParseLog"("created_at");

-- AddForeignKey
ALTER TABLE "EmailCapture" ADD CONSTRAINT "EmailCapture_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureParseLog" ADD CONSTRAINT "CaptureParseLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
