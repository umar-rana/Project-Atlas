-- AlterTable
ALTER TABLE "DriveConfig" ADD COLUMN     "folder_attachments" TEXT,
ADD COLUMN     "folder_database_backups" TEXT,
ADD COLUMN     "folder_journal" TEXT,
ADD COLUMN     "folder_notes" TEXT;
