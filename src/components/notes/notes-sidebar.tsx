"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  FileText,
  Users,
  BookOpen,
  Glasses,
  Plus,
  Table2,
  Clock,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { NavRow } from "@/components/sidebar/nav-row";
import { SectionHeader, useSidebarSection } from "@/components/sidebar/section-header";
import { NotesFolderTreeNode, type NotesFolderNode } from "./notes-folder-tree-node";
import { TablesFolderTreeNode } from "./tables-folder-tree-node";
import { NewTableDialog } from "@/components/tables/new-table-dialog";
import Link from "next/link";
import { cn } from "@/lib/utils";

const PURPOSE_ITEMS = [
  { id: "note",          label: "Notes",          icon: <FileText size={14} /> },
  { id: "meeting_note",  label: "Meeting Notes",  icon: <Users size={14} /> },
  { id: "project_brief", label: "Project Briefs", icon: <BookOpen size={14} /> },
  { id: "reading_note",  label: "Reading Notes",  icon: <Glasses size={14} /> },
];

function findNode(nodes: NotesFolderNode[], id: string): NotesFolderNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
}

function getSortedSiblings(nodes: NotesFolderNode[], parentId: string | null): NotesFolderNode[] {
  if (parentId === null) return nodes;
  const parent = findNode(nodes, parentId);
  return parent ? parent.children : [];
}

export function NotesSidebar(): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();

  const [foldersOpen, setFoldersOpen] = useSidebarSection("notes-folders", true);
  const [purposesOpen, setPurposesOpen] = useSidebarSection("notes-purposes", true);
  const [recentOpen, setRecentOpen] = useSidebarSection("notes-recent", true);
  const [addingFolder, setAddingFolder] = React.useState(false);
  const [folderNameDraft, setFolderNameDraft] = React.useState("");

  const utils = trpc.useUtils();

  const foldersQuery = trpc.notesFolder.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const countsQuery = trpc.notes.counts.useQuery(undefined, { refetchOnWindowFocus: false });
  const recentQuery = trpc.notes.list.useQuery(
    { limit: 5 },
    { refetchOnWindowFocus: false },
  );

  const recentNotes = recentQuery.data?.notes ?? [];
  const allNotesCount = countsQuery.data?.total ?? 0;
  const purposeCounts = countsQuery.data ?? {};

  const createFolder = trpc.notesFolder.create.useMutation({
    onSuccess: (folder) => {
      setAddingFolder(false);
      setFolderNameDraft("");
      utils.notesFolder.list.invalidate();
      router.push(`/notes/folder/${folder.id}`);
    },
    onError: () => toast.error("Failed to create folder"),
  });

  const reorderFolder = trpc.notesFolder.reorder.useMutation({
    onSuccess: () => utils.notesFolder.list.invalidate(),
    onError: () => toast.error("Failed to reorder folder"),
  });

  function handleSubmitFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = folderNameDraft.trim();
    if (!name) return;
    createFolder.mutate({ name });
  }

  function handleCancelFolder() {
    setAddingFolder(false);
    setFolderNameDraft("");
  }

  function handleAddFolder() {
    setFolderNameDraft("");
    setAddingFolder(true);
    if (!foldersOpen) setFoldersOpen(true);
  }

  function handleDrop(draggedId: string, targetId: string, position: "before" | "after") {
    const allFolders = foldersQuery.data ?? [];
    const dragged = findNode(allFolders, draggedId);
    const target = findNode(allFolders, targetId);
    if (!dragged || !target) return;

    const newParentId = target.parent_id;
    const siblings = getSortedSiblings(allFolders, newParentId);

    let insertAfterId: string | null;
    if (position === "before") {
      const targetIdx = siblings.findIndex((s) => s.id === targetId);
      insertAfterId = targetIdx > 0 ? (siblings[targetIdx - 1]?.id ?? null) : null;
    } else {
      insertAfterId = targetId;
    }

    if (insertAfterId === draggedId) return;

    reorderFolder.mutate({
      id: draggedId,
      parent_id: newParentId,
      insert_after_id: insertAfterId,
    });
  }

  return (
    <nav aria-label="Notes navigation" className="flex h-full flex-col gap-px overflow-y-auto p-2">
      <NavRow
        href="/notes"
        active={pathname === "/notes"}
        icon={<FileText size={14} />}
        label="All notes"
        badge={allNotesCount > 0 ? allNotesCount : undefined}
      />

      {/* Recent section */}
      <SectionHeader
        label="Recent"
        expanded={recentOpen}
        onToggle={() => setRecentOpen(!recentOpen)}
        count={recentNotes.length}
      />
      {recentOpen ? (
        <div className="flex flex-col gap-px">
          {recentNotes.length === 0 ? (
            <p className="px-2 py-1 font-ui text-2xs text-text-disabled">No recent notes</p>
          ) : (
            recentNotes.map((note) => {
              const href = `/notes/${note.id}`;
              const active = pathname === href;
              const displayTitle = note.title.trim() || "Untitled";
              return (
                <Link
                  key={note.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-ui text-sm transition-colors",
                    active
                      ? "bg-accent-primary-subtle text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                  )}
                >
                  <Clock size={11} className="shrink-0 text-text-disabled" />
                  <span className="flex-1 truncate">{displayTitle}</span>
                </Link>
              );
            })
          )}
        </div>
      ) : null}

      {/* Folders section */}
      <SectionHeader
        label="Folders"
        expanded={foldersOpen}
        onToggle={() => setFoldersOpen(!foldersOpen)}
        onAdd={handleAddFolder}
      />

      {foldersOpen ? (
        <div className="flex flex-col gap-px">
          {addingFolder ? (
            <form onSubmit={handleSubmitFolder} className="flex items-center gap-1 px-2 py-0.5">
              <input
                autoFocus
                value={folderNameDraft}
                onChange={(e) => setFolderNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") handleCancelFolder(); }}
                placeholder="Folder name"
                className="min-w-0 flex-1 rounded-sm border border-border-focus bg-surface-base px-1.5 py-0.5 font-ui text-2xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
              <button
                type="submit"
                disabled={!folderNameDraft.trim() || createFolder.isPending}
                className="rounded-sm bg-accent-primary px-1.5 py-0.5 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                onClick={handleCancelFolder}
                className="rounded-sm border border-border-default px-1.5 py-0.5 font-ui text-2xs text-text-secondary hover:bg-surface-hover"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={handleAddFolder}
              className="flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-ui text-2xs text-text-disabled hover:bg-surface-hover hover:text-text-tertiary"
            >
              <Plus size={10} />
              Add folder
            </button>
          )}

          {(foldersQuery.data ?? []).length === 0 && !addingFolder ? (
            <p className="px-2 py-1 font-ui text-2xs text-text-disabled">No folders yet</p>
          ) : null}

          {(foldersQuery.data ?? []).map((folder, idx) => (
            <NotesFolderTreeNode
              key={folder.id}
              folder={folder}
              depth={0}
              pathname={pathname}
              allFolders={foldersQuery.data ?? []}
              siblingIndex={idx}
              siblingCount={(foldersQuery.data ?? []).length}
              onRefresh={() => {
                utils.notesFolder.list.invalidate();
                utils.notes.list.invalidate();
              }}
              onDrop={handleDrop}
            />
          ))}
        </div>
      ) : null}

      {/* Purposes section */}
      <SectionHeader
        label="Purposes"
        expanded={purposesOpen}
        onToggle={() => setPurposesOpen(!purposesOpen)}
        count={purposesOpen ? undefined : 4}
      />

      {purposesOpen ? (
        <div className="flex flex-col gap-px">
          {PURPOSE_ITEMS.map((p) => (
            <NavRow
              key={p.id}
              href={`/notes/purpose/${p.id}`}
              active={pathname === `/notes/purpose/${p.id}`}
              icon={p.icon}
              label={p.label}
              badge={purposeCounts[p.id as keyof typeof purposeCounts] as number | undefined}
            />
          ))}
        </div>
      ) : null}

      {/* Tables section */}
      <div className="mt-3 border-t border-border-subtle pt-2">
        <TablesSection pathname={pathname} />
      </div>
    </nav>
  );
}

function TablesSection({ pathname }: { pathname: string }) {
  const utils = trpc.useUtils();
  const [showNewDialog, setShowNewDialog] = React.useState(false);
  const [tablesOpen, setTablesOpen] = useSidebarSection("tables-section", true);
  const [foldersOpen, setFoldersOpen] = useSidebarSection("tables-folders", true);

  const foldersQuery = trpc.tablesFolders.list.useQuery();
  const folders = foldersQuery.data ?? [];

  const router = useRouter();

  function handleCreated(tableId: string) {
    setShowNewDialog(false);
    utils.tables.list.invalidate();
    router.push(`/notes/tables/${tableId}`);
  }

  return (
    <>
      <SectionHeader
        label="Tables"
        expanded={tablesOpen}
        onToggle={() => setTablesOpen(!tablesOpen)}
        addElement={
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowNewDialog(true); }}
            title="New table"
            className="inline-flex size-4 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            <Plus size={11} />
          </button>
        }
      />
      {tablesOpen && (
        <div className="flex flex-col gap-px">
          <NavRow
            href="/notes/tables"
            active={pathname === "/notes/tables"}
            icon={<Table2 size={13} />}
            label="All tables"
          />

          {folders.length > 0 && (
            <div className="mt-1">
              <SectionHeader
                label="Folders"
                expanded={foldersOpen}
                onToggle={() => setFoldersOpen(!foldersOpen)}
              />
              {foldersOpen && (
                <div className="mt-px flex flex-col gap-px">
                  {folders.map((folder) => (
                    <TablesFolderTreeNode
                      key={folder.id}
                      folder={folder}
                      depth={0}
                      pathname={pathname}
                      onRefresh={() => {
                        utils.tablesFolders.list.invalidate();
                        utils.tables.list.invalidate();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showNewDialog && (
        <NewTableDialog
          onClose={() => setShowNewDialog(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
