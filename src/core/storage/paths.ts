export function storagePath(
  userId: string,
  fileId: string,
  filename: string,
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `users/${userId}/attachments/${year}/${month}/${fileId}-${filename}`;
}
