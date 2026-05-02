-- Wave 4b: Tables module — TablesFolder, Table, TableColumn, TableRow, TableCell

-- AlterTable
ALTER TABLE "DriveConfig" ADD COLUMN     "folder_tables" TEXT;

-- CreateTable
CREATE TABLE "TablesFolder" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "TablesFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "folder_id" UUID,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "manual_row_order" JSONB NOT NULL DEFAULT '[]',
    "drive_csv_file_id" TEXT,
    "drive_json_file_id" TEXT,
    "drive_synced_at" TIMESTAMPTZ,
    "drive_sync_error" TEXT,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableColumn" (
    "id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "aggregation" TEXT,
    "width" INTEGER NOT NULL DEFAULT 160,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "TableColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableRow" (
    "id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "TableRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableCell" (
    "id" UUID NOT NULL,
    "row_id" UUID NOT NULL,
    "column_id" UUID NOT NULL,
    "value" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "TableCell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TablesFolder_user_id_idx" ON "TablesFolder"("user_id");

-- CreateIndex
CREATE INDEX "TablesFolder_user_id_parent_id_idx" ON "TablesFolder"("user_id", "parent_id");

-- CreateIndex
CREATE INDEX "TablesFolder_deleted_at_idx" ON "TablesFolder"("deleted_at");

-- CreateIndex
CREATE INDEX "Table_user_id_idx" ON "Table"("user_id");

-- CreateIndex
CREATE INDEX "Table_user_id_folder_id_idx" ON "Table"("user_id", "folder_id");

-- CreateIndex
CREATE INDEX "Table_user_id_project_id_idx" ON "Table"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "Table_deleted_at_idx" ON "Table"("deleted_at");

-- CreateIndex
CREATE INDEX "TableColumn_table_id_idx" ON "TableColumn"("table_id");

-- CreateIndex
CREATE INDEX "TableColumn_table_id_position_idx" ON "TableColumn"("table_id", "position");

-- CreateIndex
CREATE INDEX "TableColumn_deleted_at_idx" ON "TableColumn"("deleted_at");

-- CreateIndex
CREATE INDEX "TableRow_table_id_idx" ON "TableRow"("table_id");

-- CreateIndex
CREATE INDEX "TableRow_table_id_position_idx" ON "TableRow"("table_id", "position");

-- CreateIndex
CREATE INDEX "TableRow_deleted_at_idx" ON "TableRow"("deleted_at");

-- CreateIndex
CREATE INDEX "TableCell_row_id_idx" ON "TableCell"("row_id");

-- CreateIndex
CREATE INDEX "TableCell_column_id_idx" ON "TableCell"("column_id");

-- CreateIndex
CREATE UNIQUE INDEX "TableCell_row_id_column_id_key" ON "TableCell"("row_id", "column_id");

-- AddForeignKey
ALTER TABLE "TablesFolder" ADD CONSTRAINT "TablesFolder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TablesFolder" ADD CONSTRAINT "TablesFolder_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "TablesFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "TablesFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableColumn" ADD CONSTRAINT "TableColumn_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableRow" ADD CONSTRAINT "TableRow_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableCell" ADD CONSTRAINT "TableCell_row_id_fkey" FOREIGN KEY ("row_id") REFERENCES "TableRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableCell" ADD CONSTRAINT "TableCell_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "TableColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
