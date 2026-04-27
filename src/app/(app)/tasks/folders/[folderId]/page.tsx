"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { TasksShell } from "@/components/tasks/tasks-shell";
import { FolderDetailView } from "@/components/tasks/folder-detail-view";

export default function FolderPage() {
  const { folderId } = useParams<{ folderId: string }>();
  return (
    <TasksShell>
      <FolderDetailView folderId={folderId} />
    </TasksShell>
  );
}
