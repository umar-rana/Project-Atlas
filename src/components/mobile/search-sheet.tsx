"use client";

import * as React from "react";
import { X, Search, Clock, CheckSquare, FileText, Inbox, ChevronRight, FolderOpen, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { switchToDesktop } from "@/lib/mobile/switch-to-desktop";

const RECENT_KEY = "mobile-search-recent";
const MAX_RECENT = 8;
const GROUP_LIMIT = 5;

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function addRecent(query: string) {
  const prev = getRecent();
  const next = [query, ...prev.filter((q) => q !== query)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

interface SearchSheetProps {
  open: boolean;
  onClose: () => void;
}

export function SearchSheet({ open, onClose }: SearchSheetProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [recent, setRecent] = React.useState<string[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setRecent(getRecent());
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const q = debouncedQuery.trim();

  const tasksQuery = trpc.search.tasks.useQuery(
    { query: q, limit: GROUP_LIMIT + 1 },
    { enabled: q.length > 0 },
  );

  const notesQuery = trpc.search.notes.useQuery(
    { query: q, limit: GROUP_LIMIT + 1 },
    { enabled: q.length > 0 },
  );

  const capturesQuery = trpc.capture.list.useQuery(
    { search: q, limit: GROUP_LIMIT + 1 },
    { enabled: q.length > 0 },
  );

  const projectsQuery = trpc.projects.list.useQuery(
    { include_all_statuses: false },
    { enabled: q.length > 0 },
  );

  const tagsQuery = trpc.tags.search.useQuery(
    { query: q, limit: GROUP_LIMIT + 1 },
    { enabled: q.length > 0 },
  );

  const taskResults = tasksQuery.data ?? [];
  const noteResults = notesQuery.data ?? [];
  const captureResults = capturesQuery.data?.captures ?? [];

  const ql = q.toLowerCase();
  const allProjects = projectsQuery.data ?? [];
  const filteredProjects = q.length > 0
    ? allProjects.filter((p) => p.title.toLowerCase().includes(ql))
    : [];

  const tagResults = tagsQuery.data ?? [];

  const hasResults =
    taskResults.length > 0 ||
    noteResults.length > 0 ||
    captureResults.length > 0 ||
    filteredProjects.length > 0 ||
    tagResults.length > 0;

  const isLoading =
    q.length > 0 &&
    (tasksQuery.isFetching || notesQuery.isFetching || capturesQuery.isFetching || projectsQuery.isFetching || tagsQuery.isFetching);
  const isEmpty = q.length > 0 && !isLoading && !hasResults;

  function navigate(href: string) {
    if (q) addRecent(q);
    setRecent(getRecent());
    router.push(href);
    onClose();
  }

  function promptDesktopEdit(label: string, desktopHref = "/tasks") {
    toast(`${label} are read-only on mobile — open on desktop to edit`, {
      action: {
        label: "Switch",
        onClick: () => switchToDesktop(desktopHref),
      },
    });
  }

  function handleRecentTap(r: string) {
    setQuery(r);
    setDebouncedQuery(r);
  }

  function clearRecent() {
    localStorage.setItem(RECENT_KEY, "[]");
    setRecent([]);
  }

  if (!open) return null;

  const tasksToShow = taskResults.slice(0, GROUP_LIMIT);
  const hasMoreTasks = taskResults.length > GROUP_LIMIT;
  const notesToShow = noteResults.slice(0, GROUP_LIMIT);
  const hasMoreNotes = noteResults.length > GROUP_LIMIT;
  const capturesToShow = captureResults.slice(0, GROUP_LIMIT);
  const hasMoreCaptures = captureResults.length > GROUP_LIMIT;
  const projectsToShow = filteredProjects.slice(0, GROUP_LIMIT);
  const hasMoreProjects = filteredProjects.length > GROUP_LIMIT;
  const tagsToShow = tagResults.slice(0, GROUP_LIMIT);
  const hasMoreTags = tagResults.length > GROUP_LIMIT;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-base">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 pt-[max(8px,env(safe-area-inset-top))]">
        <div className="relative flex flex-1 items-center">
          <Search size={16} className="absolute left-3 shrink-0 text-text-tertiary" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, notes, projects, tags…"
            className={cn(
              "h-10 w-full rounded-lg border border-border-subtle bg-surface-raised pl-9 pr-3",
              "font-ui text-sm text-text-primary placeholder:text-text-disabled",
              "focus:outline-none focus:ring-2 focus:ring-accent-primary/30",
            )}
          />
        </div>
        <button
          type="button"
          aria-label="Close search"
          onClick={onClose}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-accent-primary"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {q.length === 0 && recent.length > 0 && (
          <section className="px-4 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-ui text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Recent
              </p>
              <button
                type="button"
                onClick={clearRecent}
                className="font-ui text-xs text-accent-primary"
              >
                Clear
              </button>
            </div>
            <ul role="list" className="space-y-1">
              {recent.map((r) => (
                <li key={r}>
                  <button
                    type="button"
                    onClick={() => handleRecentTap(r)}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2 py-2 text-left active:bg-surface-hover"
                  >
                    <Clock size={16} className="shrink-0 text-text-tertiary" aria-hidden />
                    <span className="font-ui text-sm text-text-secondary">{r}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isLoading && (
          <div className="flex h-32 items-center justify-center">
            <p className="font-ui text-sm text-text-tertiary">Searching…</p>
          </div>
        )}

        {isEmpty && (
          <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-ui text-sm text-text-tertiary">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </p>
          </div>
        )}

        {!isLoading && tasksToShow.length > 0 && (
          <section className="px-4 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-ui text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Tasks
              </p>
              {hasMoreTasks && (
                <button
                  type="button"
                  onClick={() => navigate("/m/tasks")}
                  className="flex items-center gap-0.5 font-ui text-xs text-accent-primary"
                >
                  View all
                  <ChevronRight size={12} aria-hidden />
                </button>
              )}
            </div>
            <ul
              role="list"
              className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle"
            >
              {tasksToShow.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/m/tasks/${task.id}`)}
                    className="flex min-h-[44px] w-full items-center gap-3 bg-surface-base px-3 py-2.5 text-left active:bg-surface-hover"
                  >
                    <CheckSquare size={16} className="shrink-0 text-text-tertiary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-ui text-sm text-text-primary">{task.title}</p>
                      {task.project_title && (
                        <p className="truncate font-ui text-xs text-text-tertiary">
                          {task.project_title}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isLoading && notesToShow.length > 0 && (
          <section className="px-4 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-ui text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Notes
              </p>
              {hasMoreNotes && (
                <button
                  type="button"
                  onClick={() => navigate("/m/notes")}
                  className="flex items-center gap-0.5 font-ui text-xs text-accent-primary"
                >
                  View all
                  <ChevronRight size={12} aria-hidden />
                </button>
              )}
            </div>
            <ul
              role="list"
              className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle"
            >
              {notesToShow.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => {
                      navigate(`/m/notes/${note.id}`);
                      toast("Notes are read-only on mobile", {
                        action: {
                          label: "Edit on desktop",
                          onClick: () => {
                            switchToDesktop(`/notes/${note.id}`);
                          },
                        },
                      });
                    }}
                    className="flex min-h-[44px] w-full items-center gap-3 bg-surface-base px-3 py-2.5 text-left active:bg-surface-hover"
                  >
                    <FileText size={16} className="shrink-0 text-text-tertiary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-ui text-sm text-text-primary">
                        {note.title || "Untitled"}
                      </p>
                      {note.body_text && (
                        <p className="truncate font-ui text-xs text-text-tertiary">
                          {note.body_text.slice(0, 80)}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isLoading && projectsToShow.length > 0 && (
          <section className="px-4 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-ui text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Projects
              </p>
              {hasMoreProjects && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    promptDesktopEdit("Projects", "/projects");
                  }}
                  className="flex items-center gap-0.5 font-ui text-xs text-accent-primary"
                >
                  View all
                  <ChevronRight size={12} aria-hidden />
                </button>
              )}
            </div>
            <ul
              role="list"
              className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle"
            >
              {projectsToShow.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      promptDesktopEdit("Projects", `/projects/${project.id}`);
                    }}
                    className="flex min-h-[44px] w-full items-center gap-3 bg-surface-base px-3 py-2.5 text-left active:bg-surface-hover"
                  >
                    <FolderOpen size={16} className="shrink-0 text-text-tertiary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-ui text-sm text-text-primary">{project.title}</p>
                      {project.task_count > 0 && (
                        <p className="font-ui text-xs text-text-tertiary">
                          {project.task_count} task{project.task_count !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isLoading && tagsToShow.length > 0 && (
          <section className="px-4 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-ui text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Tags
              </p>
              {hasMoreTags && (
                <button
                  type="button"
                  onClick={() => navigate(`/m/tasks?tag=${encodeURIComponent(tagsToShow[0]?.name ?? "")}`)}
                  className="flex items-center gap-0.5 font-ui text-xs text-accent-primary"
                >
                  View all
                  <ChevronRight size={12} aria-hidden />
                </button>
              )}
            </div>
            <ul
              role="list"
              className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle"
            >
              {tagsToShow.map((tag) => (
                <li key={tag.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/m/tasks?tag=${encodeURIComponent(tag.name)}`)}
                    className="flex min-h-[44px] w-full items-center gap-3 bg-surface-base px-3 py-2.5 text-left active:bg-surface-hover"
                  >
                    <Tag size={16} className="shrink-0 text-text-tertiary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-ui text-sm text-text-primary">#{tag.name}</p>
                      {tag.usage_count > 0 && (
                        <p className="font-ui text-xs text-text-tertiary">
                          {tag.usage_count} use{tag.usage_count !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isLoading && capturesToShow.length > 0 && (
          <section className="px-4 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-ui text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Captures
              </p>
              {hasMoreCaptures && (
                <button
                  type="button"
                  onClick={() => navigate("/m/captures")}
                  className="flex items-center gap-0.5 font-ui text-xs text-accent-primary"
                >
                  View all
                  <ChevronRight size={12} aria-hidden />
                </button>
              )}
            </div>
            <ul
              role="list"
              className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle"
            >
              {capturesToShow.map((capture) => (
                <li key={capture.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/m/captures/process?id=${capture.id}`)}
                    className="flex min-h-[44px] w-full items-center gap-3 bg-surface-base px-3 py-2.5 text-left active:bg-surface-hover"
                  >
                    <Inbox size={16} className="shrink-0 text-text-tertiary" aria-hidden />
                    <p className="min-w-0 flex-1 truncate font-ui text-sm text-text-primary">
                      {capture.title ?? capture.raw_text}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
