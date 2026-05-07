"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { PersonAvatar } from "@/components/people/person-avatar";
import { InteractionLog } from "@/components/people/interaction-log";
import { CadenceSuggestionBanner } from "@/components/people/cadence-banner";
import { deriveDisplayName } from "@/core/people/validation";
import { EmptyState } from "@/components/composed/empty-state";
import { Hint } from "@/components/ui/hint";
import { useLocale } from "@/core/locale/hooks";
import { formatDate, formatRelativeDate } from "@/core/locale/formatters";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Link as LinkIcon,
  Calendar,
  Users,
  Star,
  Lightbulb,
  Pencil,
  Trash2,
  ArrowLeft,
  ExternalLink,
  ChevronRight,
  FileText,
  CheckSquare,
  Paperclip,
  Tag,
  Plus,
  X,
  File,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

function Section({
  id,
  title,
  icon,
  children,
  hidden,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <section id={id} className="scroll-mt-20 pt-6 first:pt-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-text-tertiary">{icon}</span>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-primary">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function formatAddress(addr: {
  street?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  formatted?: string | null;
}) {
  if (addr.formatted) return addr.formatted;
  const parts: string[] = [];
  if (addr.street) parts.push(addr.street);
  const cityLine = [addr.city, addr.region, addr.postal_code].filter(Boolean).join(", ");
  if (cityLine) parts.push(cityLine);
  if (addr.country_name) parts.push(addr.country_name);
  else if (addr.country_code) parts.push(addr.country_code);
  return parts.join("\n") || "Address";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type PersonView = {
  id: string;
  handle: string;
  display_name: string | null;
  honorific_prefix: string | null;
  given_name: string | null;
  middle_name: string | null;
  family_name: string | null;
  honorific_suffix: string | null;
  nickname: string | null;
  biography: string | null;
  photo_url: string | null;
  relationship_type: string | null;
  cadence_days: number | null;
  last_contacted_at: Date | string | null;
  next_follow_up_at: Date | string | null;
  followup_snooze_until: Date | string | null;
  cadence_suggestion_dismissed_at: Date | string | null;
  cadence_suggestion_dismissed_value: number | null;
  cadence_suggestion_dismissed_interaction_count: number | null;
  interactions: {
    id: string;
    kind: string;
    occurred_at: Date | string;
    deleted_at: Date | string | null;
  }[];
  emails: { id: string; email: string; type: string; is_primary: boolean }[];
  phones: {
    id: string;
    number: string;
    e164_normalized: string | null;
    type: string;
    is_primary: boolean;
  }[];
  addresses: {
    id: string;
    type: string;
    street: string | null;
    city: string | null;
    region: string | null;
    postal_code: string | null;
    country_code: string | null;
    country_name: string | null;
    formatted: string | null;
    is_primary: boolean;
  }[];
  organizations: {
    id: string;
    name: string;
    title: string | null;
    department: string | null;
    is_current: boolean;
    is_primary: boolean;
    start_date: Date | null;
    end_date: Date | null;
  }[];
  urls: { id: string; url: string; type: string; label: string | null }[];
  events: { id: string; type: string; date: Date; label: string | null }[];
  relations: {
    id: string;
    type: string;
    related_text: string | null;
    related_person: {
      id: string;
      display_name: string | null;
      given_name: string | null;
      family_name: string | null;
      nickname: string | null;
      handle: string;
      photo_url: string | null;
    } | null;
  }[];
  reverse_relations: {
    id: string;
    type: string;
    person: {
      id: string;
      display_name: string | null;
      given_name: string | null;
      family_name: string | null;
      nickname: string | null;
      handle: string;
      photo_url: string | null;
    };
  }[];
  skills: { id: string; name: string }[];
  interests: { id: string; name: string }[];
  tags: { tag: { id: string; name: string; color: string | null } }[];
};

const PROFILE_TOC_SECTIONS = [
  { id: "about", label: "About" },
  { id: "contact", label: "Contact" },
  { id: "work", label: "Work" },
  { id: "addresses", label: "Addresses" },
  { id: "events", label: "Events" },
  { id: "relations", label: "Relations" },
  { id: "skills", label: "Skills" },
  { id: "interests", label: "Interests" },
  { id: "interactions", label: "Interactions" },
];

type MainTab = "profile" | "notes" | "tasks" | "files";

function NotesTab({
  personId,
  displayName,
  handle,
}: {
  personId: string;
  displayName: string;
  handle: string;
}) {
  const locale = useLocale();
  const handleQuery = `@@${handle}`;
  const { data: byHandle = [], isLoading: loadingHandle } = trpc.notes.search.useQuery(
    { query: handleQuery, limit: 30 },
    { enabled: !!handle },
  );
  const { data: byName = [], isLoading: loadingName } = trpc.notes.search.useQuery(
    { query: displayName, limit: 30 },
    { enabled: !!displayName && displayName !== handle },
  );

  const seen = new Set<string>();
  const results = [...byHandle, ...byName].filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
  const isLoading = loadingHandle || loadingName;

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-text-tertiary">Loading notes…</div>;
  }

  if (results.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileText size={28} className="mx-auto mb-2 text-text-disabled" />
        <p className="text-sm text-text-tertiary">No notes mention {displayName} yet.</p>
        <p className="mt-1 text-xs text-text-disabled">
          Use <kbd className="font-mono">@@</kbd> in any note to mention this person.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 pt-4">
      {results.map((note) => (
        <Link
          key={note.id}
          href={`/notes/${note.id}`}
          className="block rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 transition-colors hover:border-border-default"
        >
          <div className="truncate text-sm font-medium text-text-primary">
            {note.title || "Untitled"}
          </div>
          {note.body_text && (
            <div className="mt-0.5 truncate text-xs text-text-tertiary">
              {note.body_text.slice(0, 100)}
            </div>
          )}
          <div className="mt-1 text-xs text-text-disabled">
            {formatDate(note.updated_at, locale)}
          </div>
        </Link>
      ))}
    </div>
  );
}

function TasksTab({ personId }: { personId: string }) {
  const locale = useLocale();
  const { data: tasks = [], isLoading } = trpc.tasks.list.useQuery(
    { perspective: "all", person_id: personId, include_completed: true, limit: 50 },
    { enabled: !!personId },
  );

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-text-tertiary">Loading tasks…</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="py-12 text-center">
        <CheckSquare size={28} className="mx-auto mb-2 text-text-disabled" />
        <p className="text-sm text-text-tertiary">No tasks reference this person yet.</p>
        <p className="mt-1 text-xs text-text-disabled">
          Mention this person in a task to see it here.
        </p>
      </div>
    );
  }

  const active = tasks.filter((t) => t.status === "active");
  const completed = tasks.filter((t) => t.status !== "active");

  return (
    <div className="space-y-4 pt-4">
      {active.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Active
          </div>
          <div className="space-y-1">
            {active.map((task) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-4 py-2.5 transition-colors hover:border-border-default"
              >
                <CheckSquare size={14} className="shrink-0 text-text-tertiary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-text-primary">{task.title}</div>
                  {task.due_date && (
                    <div className="text-xs text-text-tertiary">
                      Due {formatDate(task.due_date, locale)}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {completed.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Completed
          </div>
          <div className="space-y-1">
            {completed.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-sunken px-4 py-2.5"
              >
                <CheckSquare size={14} className="shrink-0 text-text-disabled" />
                <div className="truncate text-sm text-text-disabled line-through">{task.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilesTab({ personId }: { personId: string }) {
  const locale = useLocale();
  const { data: files = [], isLoading } = trpc.attachments.byParentId.useQuery(
    { parent_type: "Person", parent_id: personId },
    { enabled: !!personId },
  );

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-text-tertiary">Loading files…</div>;
  }

  if (files.length === 0) {
    return (
      <div className="py-12 text-center">
        <Paperclip size={28} className="mx-auto mb-2 text-text-disabled" />
        <p className="text-sm text-text-tertiary">No files attached to this person yet.</p>
        <p className="mt-1 text-xs text-text-disabled">
          Files attached via this person&apos;s record will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 pt-4">
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-4 py-2.5"
        >
          <File size={14} className="shrink-0 text-text-tertiary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-text-primary">{f.filename}</div>
            <div className="text-xs text-text-disabled">
              {f.size_bytes != null ? formatFileSize(f.size_bytes) : ""}{" "}
              {f.created_at ? `· ${formatDate(f.created_at, locale)}` : ""}
            </div>
          </div>
          <span className="shrink-0 text-2xs uppercase text-text-disabled">
            {f.content_type?.split("/")[1] ?? "file"}
          </span>
        </div>
      ))}
    </div>
  );
}

function TagManager({
  personId,
  currentTags,
}: {
  personId: string;
  currentTags: { tag: { id: string; name: string; color: string | null } }[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const { data: allTags = [] } = trpc.tags.list.useQuery({ limit: 200 }, { enabled: pickerOpen });

  const addTag = trpc.people.tags.add.useMutation({
    onSuccess: () => void utils.people.get.invalidate({ id: personId }),
  });
  const removeTag = trpc.people.tags.remove.useMutation({
    onSuccess: () => void utils.people.get.invalidate({ id: personId }),
  });

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setTagQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  const currentTagIds = new Set(currentTags.map((t) => t.tag.id));
  const filtered = allTags.filter(
    (t) =>
      !currentTagIds.has(t.id) &&
      (tagQuery === "" || t.name.toLowerCase().includes(tagQuery.toLowerCase())),
  );

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {currentTags.map(({ tag }) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-xs border border-border-subtle bg-surface-raised px-1.5 font-ui text-2xs font-medium text-text-secondary"
        >
          #{tag.name}
          <button
            type="button"
            onClick={() => removeTag.mutate({ person_id: personId, tag_id: tag.id })}
            className="text-text-disabled transition-colors hover:text-accent-danger"
            aria-label={`Remove tag ${tag.name}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => {
            setPickerOpen((v) => !v);
            setTagQuery("");
          }}
          className="inline-flex items-center gap-0.5 rounded-xs border border-dashed border-border-default px-1.5 text-2xs text-text-disabled transition-colors hover:border-border-default hover:text-text-tertiary"
          aria-label="Add tag"
        >
          <Plus size={10} />
          <Tag size={10} />
        </button>
        {pickerOpen && (
          <div className="z-dropdown absolute left-0 top-full mt-1 w-52 overflow-hidden rounded-lg border border-border-default bg-surface-raised shadow-2">
            <div className="border-b border-border-subtle p-1.5">
              <input
                type="text"
                placeholder="Filter tags…"
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                className="w-full bg-transparent px-1 text-xs text-text-primary outline-none placeholder:text-text-disabled"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-text-disabled">No tags available</div>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      addTag.mutate({ person_id: personId, tag_id: t.id });
                      setPickerOpen(false);
                      setTagQuery("");
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-text-primary transition-colors hover:bg-surface-hover"
                  >
                    #{t.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LastContactOverride({
  personId,
  currentOverride,
}: {
  personId: string;
  currentOverride: Date | string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const utils = trpc.useUtils();

  const overrideMutation = trpc.people.setLastContactOverride.useMutation({
    onSuccess: () => {
      void utils.people.get.invalidate({ id: personId });
      setOpen(false);
      setValue("");
    },
  });

  function handleSave() {
    const iso = value ? new Date(value + "T12:00:00").toISOString() : null;
    overrideMutation.mutate({ id: personId, last_contacted_at: iso });
  }

  function handleClear() {
    overrideMutation.mutate({ id: personId, last_contacted_at: null });
    setOpen(false);
  }

  if (!open) {
    return (
      <Hint label="Override last contact date">
        <button
          type="button"
          onClick={() => {
            setValue(
              currentOverride ? new Date(currentOverride as string).toISOString().slice(0, 10) : "",
            );
            setOpen(true);
          }}
          className="ml-1 text-2xs text-text-disabled transition-colors hover:text-text-tertiary"
        >
          Edit
        </button>
      </Hint>
    );
  }

  return (
    <div className="ml-1 flex items-center gap-1.5">
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        max={new Date().toISOString().slice(0, 10)}
        className="rounded border border-border-default bg-surface-base px-1.5 py-0.5 text-2xs text-text-primary outline-none"
      />
      <button
        type="button"
        disabled={overrideMutation.isPending}
        onClick={handleSave}
        className="text-2xs text-accent-primary hover:underline disabled:opacity-50"
      >
        Save
      </button>
      {currentOverride && (
        <button
          type="button"
          disabled={overrideMutation.isPending}
          onClick={handleClear}
          className="text-2xs text-text-disabled hover:text-text-tertiary disabled:opacity-50"
        >
          Clear
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-2xs text-text-disabled hover:text-text-tertiary"
      >
        ✕
      </button>
    </div>
  );
}

export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locale = useLocale();
  const [activeSection, setActiveSection] = useState("about");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>("profile");

  const { data: person, isLoading } = trpc.people.get.useQuery(
    { id: params.id ?? "" },
    { enabled: !!params.id },
  );

  const utils = trpc.useUtils();
  const deleteMutation = trpc.people.delete.useMutation({
    onSuccess: () => {
      void utils.people.list.invalidate();
      router.push("/people");
    },
  });

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (activeTab !== "profile") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );

    for (const { id } of PROFILE_TOC_SECTIONS) {
      const el = document.getElementById(id);
      if (el) {
        sectionRefs.current[id] = el;
        observer.observe(el);
      }
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id, activeTab]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        Loading…
      </div>
    );
  }

  if (!person) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<User size={28} />}
          title="Person not found"
          body="This person may have been deleted."
        />
      </div>
    );
  }

  const p = person as unknown as PersonView;

  const displayName = deriveDisplayName({
    display_name: p.display_name,
    honorific_prefix: p.honorific_prefix,
    given_name: p.given_name,
    middle_name: p.middle_name,
    family_name: p.family_name,
    honorific_suffix: p.honorific_suffix,
    nickname: p.nickname,
    handle: p.handle,
  });

  const primaryOrg =
    p.organizations.find((o) => o.is_primary && o.is_current) ??
    p.organizations.find((o) => o.is_current) ??
    p.organizations[0];
  const currentOrgs = p.organizations.filter((o) => o.is_current);
  const pastOrgs = p.organizations.filter((o) => !o.is_current);
  const primaryAddress = p.addresses.find((a) => a.is_primary) ?? p.addresses[0];

  const hasBio = !!p.biography;
  const hasContact = p.emails.length > 0 || p.phones.length > 0 || p.urls.length > 0;
  const hasWork = p.organizations.length > 0;
  const hasAddresses = p.addresses.length > 0;
  const hasEvents = p.events.length > 0;
  const hasRelations = p.relations.length > 0 || p.reverse_relations.length > 0;
  const hasSkills = p.skills.length > 0;
  const hasInterests = p.interests.length > 0;

  const TABS: { id: MainTab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "Profile", icon: <User size={13} /> },
    { id: "notes", label: "Notes", icon: <FileText size={13} /> },
    { id: "tasks", label: "Tasks", icon: <CheckSquare size={13} /> },
    { id: "files", label: "Files", icon: <Paperclip size={13} /> },
  ];

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Back + actions header */}
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-subtle bg-surface-base px-4 py-2.5">
          <Link
            href="/people"
            className="flex items-center gap-1 text-sm text-text-tertiary transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={14} />
            People
          </Link>
          <span className="mx-1 text-text-disabled">/</span>
          <span className="flex-1 truncate text-sm text-text-primary">{displayName}</span>
          <div className="flex shrink-0 items-center gap-1">
            <Hint label="Edit">
              <Link
                href={`/people/${p.id}/edit`}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <Pencil size={14} />
              </Link>
            </Hint>
            <Hint label="Delete">
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-accent-danger"
              >
                <Trash2 size={14} />
              </button>
            </Hint>
          </div>
        </div>

        <div className="mx-auto max-w-2xl px-4 pb-16 pt-6">
          {/* Identity header */}
          <div className="mb-6 flex items-start gap-4">
            <PersonAvatar displayName={displayName} photoUrl={p.photo_url} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-text-primary">{displayName}</h1>
              {p.honorific_prefix && p.display_name && (
                <div className="text-sm text-text-tertiary">{p.honorific_prefix}</div>
              )}
              {p.nickname && (
                <div className="text-sm italic text-text-tertiary">&ldquo;{p.nickname}&rdquo;</div>
              )}
              {primaryOrg && (
                <div className="mt-0.5 text-sm text-text-secondary">
                  {[primaryOrg.title, primaryOrg.name].filter(Boolean).join(" @ ")}
                </div>
              )}
              {primaryAddress && (
                <div className="mt-1 flex items-center gap-1 text-xs text-text-tertiary">
                  <MapPin size={11} />
                  {[primaryAddress.city, primaryAddress.country_name ?? primaryAddress.country_code]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              )}
              {p.relationship_type && (
                <span className="mt-1.5 inline-block rounded border border-border-subtle px-1.5 py-0.5 text-2xs capitalize text-text-tertiary">
                  {p.relationship_type.replace(/-/g, " ")}
                </span>
              )}
              {(p.last_contacted_at || p.cadence_days) &&
                (() => {
                  const now = new Date();
                  const lastAt = p.last_contacted_at
                    ? new Date(p.last_contacted_at as string)
                    : null;
                  const nextAt = p.next_follow_up_at
                    ? new Date(p.next_follow_up_at as string)
                    : null;
                  const cadence = p.cadence_days;

                  let statusText: string;
                  if (!cadence && lastAt) {
                    // State 2: no cadence, has last contact
                    statusText = `Last contacted ${formatRelativeDate(lastAt, locale)}`;
                  } else if (cadence && !lastAt) {
                    // State 3: has cadence, no last contact
                    const cadenceStr =
                      cadence === 7
                        ? "weekly"
                        : cadence === 30
                          ? "monthly"
                          : cadence === 90
                            ? "quarterly"
                            : cadence === 365
                              ? "yearly"
                              : `every ${cadence} days`;
                    statusText = `No contact yet · ${cadenceStr}`;
                  } else if (cadence && lastAt && nextAt) {
                    const diffDays = Math.floor(
                      (now.getTime() - nextAt.getTime()) / (24 * 60 * 60 * 1000),
                    );
                    if (diffDays < 0) {
                      // State 4: on track
                      statusText = `On track · next ${formatRelativeDate(nextAt, locale)}`;
                    } else if (diffDays === 0) {
                      // State 5: due today
                      statusText = `Due today · last ${formatRelativeDate(lastAt, locale)}`;
                    } else {
                      // State 6: overdue
                      const label = diffDays === 1 ? "1 day overdue" : `${diffDays} days overdue`;
                      statusText = `${label} · last ${formatRelativeDate(lastAt, locale)}`;
                    }
                  } else {
                    statusText = "";
                  }

                  return statusText ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-text-tertiary">{statusText}</span>
                      <LastContactOverride personId={p.id} currentOverride={p.last_contacted_at} />
                    </div>
                  ) : null;
                })()}
              <TagManager personId={p.id} currentTags={p.tags} />
              <CadenceSuggestionBanner
                personId={p.id}
                cadenceDays={p.cadence_days}
                interactions={p.interactions ?? []}
                dismissedAt={p.cadence_suggestion_dismissed_at}
                dismissedValue={p.cadence_suggestion_dismissed_value}
                dismissedInteractionCount={p.cadence_suggestion_dismissed_interaction_count}
              />
            </div>
          </div>

          {/* Tab bar */}
          <div className="-mx-1 mb-0 flex items-center gap-0.5 border-b border-border-subtle px-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
                  activeTab === tab.id
                    ? "border-accent-primary font-medium text-accent-primary"
                    : "border-transparent text-text-tertiary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "notes" && (
            <NotesTab personId={p.id} displayName={displayName} handle={p.handle} />
          )}
          {activeTab === "tasks" && <TasksTab personId={p.id} />}
          {activeTab === "files" && <FilesTab personId={p.id} />}
          {activeTab === "profile" && (
            <div className="space-y-1 pt-2">
              <Section id="about" title="About" icon={<User size={14} />} hidden={!hasBio}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                  {p.biography}
                </p>
              </Section>

              <Section id="contact" title="Contact" icon={<Mail size={14} />} hidden={!hasContact}>
                <div className="space-y-2">
                  {p.emails.map((e) => (
                    <div key={e.id} className="flex items-center gap-2">
                      {e.is_primary && <Star size={11} className="shrink-0 text-accent-warning" />}
                      <Mail size={13} className="shrink-0 text-text-tertiary" />
                      <a
                        href={`mailto:${e.email}`}
                        className="truncate text-sm text-text-link hover:underline"
                      >
                        {e.email}
                      </a>
                      <span className="text-xs capitalize text-text-disabled">{e.type}</span>
                    </div>
                  ))}
                  {p.phones.map((ph) => (
                    <div key={ph.id} className="flex items-center gap-2">
                      {ph.is_primary && <Star size={11} className="shrink-0 text-accent-warning" />}
                      <Phone size={13} className="shrink-0 text-text-tertiary" />
                      <a
                        href={`tel:${ph.e164_normalized ?? ph.number}`}
                        className="text-sm text-text-link hover:underline"
                      >
                        {ph.number}
                      </a>
                      <span className="text-xs capitalize text-text-disabled">{ph.type}</span>
                    </div>
                  ))}
                  {p.urls.map((u) => (
                    <div key={u.id} className="flex items-center gap-2">
                      <LinkIcon size={13} className="shrink-0 text-text-tertiary" />
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 truncate text-sm text-text-link hover:underline"
                      >
                        {u.label ?? u.url}
                        <ExternalLink size={11} className="shrink-0 text-text-disabled" />
                      </a>
                      <span className="text-xs capitalize text-text-disabled">{u.type}</span>
                    </div>
                  ))}
                </div>
              </Section>

              <Section id="work" title="Work" icon={<Briefcase size={14} />} hidden={!hasWork}>
                {currentOrgs.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      Current
                    </div>
                    <div className="space-y-2">
                      {currentOrgs.map((o) => (
                        <div key={o.id} className="flex items-start gap-2">
                          {o.is_primary && (
                            <Star size={11} className="mt-0.5 shrink-0 text-accent-warning" />
                          )}
                          <div>
                            <div className="text-sm font-medium text-text-primary">{o.name}</div>
                            {o.title && (
                              <div className="text-xs text-text-secondary">{o.title}</div>
                            )}
                            {o.department && (
                              <div className="text-xs text-text-tertiary">{o.department}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pastOrgs.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      Past
                    </div>
                    <div className="space-y-2">
                      {pastOrgs.map((o) => (
                        <div key={o.id} className="text-sm text-text-secondary">
                          {[o.title, o.name].filter(Boolean).join(" @ ")}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              <Section
                id="addresses"
                title="Addresses"
                icon={<MapPin size={14} />}
                hidden={!hasAddresses}
              >
                <div className="space-y-3">
                  {p.addresses.map((a) => (
                    <div key={a.id} className="flex items-start gap-2">
                      {a.is_primary && (
                        <Star size={11} className="mt-0.5 shrink-0 text-accent-warning" />
                      )}
                      <div>
                        <div className="mb-0.5 text-xs capitalize text-text-disabled">{a.type}</div>
                        <div className="whitespace-pre-wrap text-sm text-text-primary">
                          {formatAddress(a)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section id="events" title="Events" icon={<Calendar size={14} />} hidden={!hasEvents}>
                <div className="space-y-2">
                  {p.events.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 text-sm text-text-primary">
                      <span className="w-20 shrink-0 capitalize text-text-tertiary">
                        {e.label ?? e.type}
                      </span>
                      <span>{formatDate(e.date, locale)}</span>
                    </div>
                  ))}
                </div>
              </Section>

              <Section
                id="relations"
                title="Relations"
                icon={<Users size={14} />}
                hidden={!hasRelations}
              >
                <div className="space-y-2">
                  {p.relations.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-sm">
                      <span className="w-20 shrink-0 capitalize text-text-tertiary">{r.type}</span>
                      {r.related_person ? (
                        <Link
                          href={`/people/${r.related_person.id}`}
                          className="flex items-center gap-1.5 text-text-link hover:underline"
                        >
                          <PersonAvatar
                            displayName={deriveDisplayName(r.related_person)}
                            photoUrl={r.related_person.photo_url}
                            size="xs"
                          />
                          {deriveDisplayName(r.related_person)}
                          <ChevronRight size={12} className="text-text-disabled" />
                        </Link>
                      ) : (
                        <span className="text-text-primary">{r.related_text}</span>
                      )}
                    </div>
                  ))}
                  {p.reverse_relations.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-sm">
                      <span className="w-20 shrink-0 capitalize text-text-disabled">
                        {r.type} ←
                      </span>
                      <Link
                        href={`/people/${r.person.id}`}
                        className="flex items-center gap-1.5 text-text-link hover:underline"
                      >
                        <PersonAvatar
                          displayName={deriveDisplayName(r.person)}
                          photoUrl={r.person.photo_url}
                          size="xs"
                        />
                        {deriveDisplayName(r.person)}
                      </Link>
                    </div>
                  ))}
                </div>
              </Section>

              <Section id="skills" title="Skills" icon={<Star size={14} />} hidden={!hasSkills}>
                <div className="flex flex-wrap gap-1.5">
                  {p.skills.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center rounded-md border border-border-default bg-surface-raised px-2.5 py-1 text-sm text-text-primary"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </Section>

              <Section
                id="interests"
                title="Interests"
                icon={<Lightbulb size={14} />}
                hidden={!hasInterests}
              >
                <div className="flex flex-wrap gap-1.5">
                  {p.interests.map((i) => (
                    <span
                      key={i.id}
                      className="inline-flex items-center rounded-md border border-border-default bg-surface-raised px-2.5 py-1 text-sm text-text-primary"
                    >
                      {i.name}
                    </span>
                  ))}
                </div>
              </Section>

              <Section id="interactions" title="Interactions" icon={<Activity size={14} />}>
                {/* Cadence summary row */}
                {(p.cadence_days || p.last_contacted_at) && (
                  <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2">
                    {p.cadence_days && (
                      <span className="text-xs text-text-secondary">
                        <span className="mr-1 text-text-disabled">Cadence:</span>
                        {p.cadence_days === 7
                          ? "Weekly"
                          : p.cadence_days === 30
                            ? "Monthly"
                            : p.cadence_days === 90
                              ? "Quarterly"
                              : p.cadence_days === 365
                                ? "Yearly"
                                : `Every ${p.cadence_days} days`}
                      </span>
                    )}
                    {p.next_follow_up_at && (
                      <span className="text-xs text-text-secondary">
                        <span className="mr-1 text-text-disabled">Follow-up:</span>
                        {new Date(p.next_follow_up_at as string) <= new Date() ? "Overdue — " : ""}
                        {formatRelativeDate(p.next_follow_up_at, locale)}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-3">
                  <InteractionLog personId={p.id} personName={displayName} />
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>

      {/* Sticky TOC — only shown on profile tab */}
      {activeTab === "profile" && (
        <aside className="lg:flex hidden w-44 shrink-0 flex-col overflow-y-auto py-6 pr-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-disabled">
            On this page
          </div>
          <nav className="space-y-1">
            {PROFILE_TOC_SECTIONS.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className={cn(
                  "block rounded px-2 py-1 text-xs transition-colors",
                  activeSection === id
                    ? "bg-accent-primary-subtle font-medium text-accent-primary"
                    : "text-text-tertiary hover:text-text-primary",
                )}
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>
      )}

      {/* Delete confirmation */}
      {deleteOpen && (
        <div className="z-modal bg-surface-base/60 fixed inset-0 flex items-center justify-center backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-border-default bg-surface-raised p-5 shadow-2">
            <h3 className="mb-2 font-semibold text-text-primary">Delete {displayName}?</h3>
            <p className="mb-4 text-sm text-text-tertiary">
              This will soft-delete the person. All data can be recovered by an admin.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="rounded-md border border-border-default px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ id: p.id })}
                className="rounded-md bg-accent-danger px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-60"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
