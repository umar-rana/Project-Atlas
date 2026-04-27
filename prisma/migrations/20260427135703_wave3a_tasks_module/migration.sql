-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "handle" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Context" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Context_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "color" TEXT,
    "sequential" BOOLEAN NOT NULL DEFAULT false,
    "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "parent_id" UUID,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "defer_date" TIMESTAMPTZ,
    "due_date" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "estimated_minutes" INTEGER,
    "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "referenced_person_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referenced_tag_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referenced_entity_refs" JSONB,
    "search_vector" TEXT,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextOnTask" (
    "task_id" UUID NOT NULL,
    "context_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextOnTask_pkey" PRIMARY KEY ("task_id","context_id")
);

-- CreateTable
CREATE TABLE "TagOnTask" (
    "task_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagOnTask_pkey" PRIMARY KEY ("task_id","tag_id")
);

-- CreateIndex
CREATE INDEX "Person_user_id_idx" ON "Person"("user_id");

-- CreateIndex
CREATE INDEX "Person_deleted_at_idx" ON "Person"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "Person_user_id_handle_key" ON "Person"("user_id", "handle");

-- CreateIndex
CREATE INDEX "Tag_user_id_idx" ON "Tag"("user_id");

-- CreateIndex
CREATE INDEX "Tag_user_id_usage_count_idx" ON "Tag"("user_id", "usage_count");

-- CreateIndex
CREATE INDEX "Tag_deleted_at_idx" ON "Tag"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_user_id_name_key" ON "Tag"("user_id", "name");

-- CreateIndex
CREATE INDEX "Context_user_id_idx" ON "Context"("user_id");

-- CreateIndex
CREATE INDEX "Context_deleted_at_idx" ON "Context"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "Context_user_id_name_key" ON "Context"("user_id", "name");

-- CreateIndex
CREATE INDEX "Project_user_id_idx" ON "Project"("user_id");

-- CreateIndex
CREATE INDEX "Project_user_id_status_idx" ON "Project"("user_id", "status");

-- CreateIndex
CREATE INDEX "Project_user_id_position_idx" ON "Project"("user_id", "position");

-- CreateIndex
CREATE INDEX "Project_deleted_at_idx" ON "Project"("deleted_at");

-- CreateIndex
CREATE INDEX "Task_user_id_idx" ON "Task"("user_id");

-- CreateIndex
CREATE INDEX "Task_user_id_project_id_idx" ON "Task"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "Task_user_id_status_idx" ON "Task"("user_id", "status");

-- CreateIndex
CREATE INDEX "Task_user_id_due_date_idx" ON "Task"("user_id", "due_date");

-- CreateIndex
CREATE INDEX "Task_user_id_flagged_idx" ON "Task"("user_id", "flagged");

-- CreateIndex
CREATE INDEX "Task_user_id_parent_id_idx" ON "Task"("user_id", "parent_id");

-- CreateIndex
CREATE INDEX "Task_project_id_position_idx" ON "Task"("project_id", "position");

-- CreateIndex
CREATE INDEX "Task_deleted_at_idx" ON "Task"("deleted_at");

-- CreateIndex
CREATE INDEX "ContextOnTask_context_id_idx" ON "ContextOnTask"("context_id");

-- CreateIndex
CREATE INDEX "TagOnTask_tag_id_idx" ON "TagOnTask"("tag_id");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Context" ADD CONSTRAINT "Context_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextOnTask" ADD CONSTRAINT "ContextOnTask_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextOnTask" ADD CONSTRAINT "ContextOnTask_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "Context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagOnTask" ADD CONSTRAINT "TagOnTask_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagOnTask" ADD CONSTRAINT "TagOnTask_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
