-- CreateTable: TaskTemplate
CREATE TABLE "TaskTemplate" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "default_project_id" UUID,
    "estimated_minutes" INTEGER,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_rule" TEXT,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TaskTemplateChecklistItem
CREATE TABLE "TaskTemplateChecklistItem" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "TaskTemplateChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ContextOnTaskTemplate
CREATE TABLE "ContextOnTaskTemplate" (
    "template_id" UUID NOT NULL,
    "context_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContextOnTaskTemplate_pkey" PRIMARY KEY ("template_id","context_id")
);

-- CreateTable: TagOnTaskTemplate
CREATE TABLE "TagOnTaskTemplate" (
    "template_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TagOnTaskTemplate_pkey" PRIMARY KEY ("template_id","tag_id")
);

-- CreateIndex
CREATE INDEX "TaskTemplate_user_id_idx" ON "TaskTemplate"("user_id");
CREATE INDEX "TaskTemplate_user_id_usage_count_idx" ON "TaskTemplate"("user_id", "usage_count");
CREATE INDEX "TaskTemplate_user_id_deleted_at_idx" ON "TaskTemplate"("user_id", "deleted_at");
CREATE INDEX "TaskTemplate_deleted_at_idx" ON "TaskTemplate"("deleted_at");
CREATE INDEX "TaskTemplateChecklistItem_template_id_position_idx" ON "TaskTemplateChecklistItem"("template_id", "position");
CREATE INDEX "ContextOnTaskTemplate_context_id_idx" ON "ContextOnTaskTemplate"("context_id");
CREATE INDEX "TagOnTaskTemplate_tag_id_idx" ON "TagOnTaskTemplate"("tag_id");

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_default_project_id_fkey" FOREIGN KEY ("default_project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskTemplateChecklistItem" ADD CONSTRAINT "TaskTemplateChecklistItem_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextOnTaskTemplate" ADD CONSTRAINT "ContextOnTaskTemplate_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextOnTaskTemplate" ADD CONSTRAINT "ContextOnTaskTemplate_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "Context"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TagOnTaskTemplate" ADD CONSTRAINT "TagOnTaskTemplate_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TagOnTaskTemplate" ADD CONSTRAINT "TagOnTaskTemplate_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
