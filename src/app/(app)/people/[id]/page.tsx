"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { PersonAvatar } from "@/components/people/person-avatar";
import { deriveDisplayName } from "@/core/people/validation";
import { EmptyState } from "@/components/composed/empty-state";
import { Hint } from "@/components/ui/hint";
import { useLocale } from "@/core/locale/hooks";
import { formatDate } from "@/core/locale/formatters";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

function Section({ id, title, icon, children, hidden }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <section id={id} className="scroll-mt-20 pt-6 first:pt-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-text-tertiary">{icon}</span>
        <h2 className="font-semibold text-text-primary text-sm uppercase tracking-wide">{title}</h2>
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
  id: string; handle: string; display_name: string | null; honorific_prefix: string | null;
  given_name: string | null; middle_name: string | null; family_name: string | null;
  honorific_suffix: string | null; nickname: string | null; biography: string | null;
  photo_url: string | null; relationship_type: string | null;
  emails: { id: string; email: string; type: string; is_primary: boolean }[];
  phones: { id: string; number: string; e164_normalized: string | null; type: string; is_primary: boolean }[];
  addresses: { id: string; type: string; street: string | null; city: string | null; region: string | null; postal_code: string | null; country_code: string | null; country_name: string | null; formatted: string | null; is_primary: boolean }[];
  organizations: { id: string; name: string; title: string | null; department: string | null; is_current: boolean; is_primary: boolean; start_date: Date | null; end_date: Date | null }[];
  urls: { id: string; url: string; type: string; label: string | null }[];
  events: { id: string; type: string; date: Date; label: string | null }[];
  relations: { id: string; type: string; related_text: string | null; related_person: { id: string; display_name: string | null; given_name: string | null; family_name: string | null; nickname: string | null; handle: string; photo_url: string | null } | null }[];
  reverse_relations: { id: string; type: string; person: { id: string; display_name: string | null; given_name: string | null; family_name: string | null; nickname: string | null; handle: string; photo_url: string | null } }[];
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

function NotesTab({ personId, displayName, handle }: { personId: string; displayName: string; handle: string }) {
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
    return <div className="text-sm text-text-tertiary py-8 text-center">Loading notes…</div>;
  }

  if (results.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileText size={28} className="mx-auto mb-2 text-text-disabled" />
        <p className="text-sm text-text-tertiary">No notes mention {displayName} yet.</p>
        <p className="text-xs text-text-disabled mt-1">Use <kbd className="font-mono">@@</kbd> in any note to mention this person.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 pt-4">
      {results.map((note) => (
        <Link
          key={note.id}
          href={`/notes/${note.id}`}
          className="block rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 hover:border-border-default transition-colors"
        >
          <div className="text-sm font-medium text-text-primary truncate">{note.title || "Untitled"}</div>
          {note.body_text && (
            <div className="text-xs text-text-tertiary truncate mt-0.5">{note.body_text.slice(0, 100)}</div>
          )}
          <div className="text-xs text-text-disabled mt-1">
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
    return <div className="text-sm text-text-tertiary py-8 text-center">Loading tasks…</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="py-12 text-center">
        <CheckSquare size={28} className="mx-auto mb-2 text-text-disabled" />
        <p className="text-sm text-text-tertiary">No tasks reference this person yet.</p>
        <p className="text-xs text-text-disabled mt-1">Mention this person in a task to see it here.</p>
      </div>
    );
  }

  const active = tasks.filter((t) => t.status === "active");
  const completed = tasks.filter((t) => t.status !== "active");

  return (
    <div className="space-y-4 pt-4">
      {active.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">Active</div>
          <div className="space-y-1">
            {active.map((task) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-4 py-2.5 hover:border-border-default transition-colors"
              >
                <CheckSquare size={14} className="text-text-tertiary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary truncate">{task.title}</div>
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
          <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">Completed</div>
          <div className="space-y-1">
            {completed.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-sunken px-4 py-2.5"
              >
                <CheckSquare size={14} className="text-text-disabled shrink-0" />
                <div className="text-sm text-text-disabled line-through truncate">{task.title}</div>
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
    return <div className="text-sm text-text-tertiary py-8 text-center">Loading files…</div>;
  }

  if (files.length === 0) {
    return (
      <div className="py-12 text-center">
        <Paperclip size={28} className="mx-auto mb-2 text-text-disabled" />
        <p className="text-sm text-text-tertiary">No files attached to this person yet.</p>
        <p className="text-xs text-text-disabled mt-1">Files attached via this person&apos;s record will appear here.</p>
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
          <File size={14} className="text-text-tertiary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-text-primary truncate">{f.filename}</div>
            <div className="text-xs text-text-disabled">
              {f.size_bytes != null ? formatFileSize(f.size_bytes) : ""}{" "}
              {f.created_at ? `· ${formatDate(f.created_at, locale)}` : ""}
            </div>
          </div>
          <span className="text-2xs text-text-disabled uppercase shrink-0">
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
    <div className="flex flex-wrap gap-1 mt-2 items-center">
      {currentTags.map(({ tag }) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-xs border border-border-subtle bg-surface-raised px-1.5 font-ui text-2xs font-medium text-text-secondary whitespace-nowrap"
        >
          #{tag.name}
          <button
            type="button"
            onClick={() => removeTag.mutate({ person_id: personId, tag_id: tag.id })}
            className="text-text-disabled hover:text-accent-danger transition-colors"
            aria-label={`Remove tag ${tag.name}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => { setPickerOpen((v) => !v); setTagQuery(""); }}
          className="inline-flex items-center gap-0.5 rounded-xs border border-dashed border-border-default px-1.5 text-2xs text-text-disabled hover:text-text-tertiary hover:border-border-default transition-colors"
          aria-label="Add tag"
        >
          <Plus size={10} />
          <Tag size={10} />
        </button>
        {pickerOpen && (
          <div className="absolute left-0 top-full mt-1 z-dropdown w-52 rounded-lg border border-border-default bg-surface-raised shadow-2 overflow-hidden">
            <div className="p-1.5 border-b border-border-subtle">
              <input
                type="text"
                placeholder="Filter tags…"
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-disabled outline-none px-1"
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
                    className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover transition-colors"
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

export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locale = useLocale();
  const [activeSection, setActiveSection] = useState("about");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>("profile");

  const { data: person, isLoading } = trpc.people.get.useQuery({ id: params.id ?? "" }, { enabled: !!params.id });

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
    return <div className="flex items-center justify-center h-full text-text-tertiary text-sm">Loading…</div>;
  }

  if (!person) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState icon={<User size={28} />} title="Person not found" body="This person may have been deleted." />
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

  const primaryOrg = p.organizations.find((o) => o.is_primary && o.is_current) ?? p.organizations.find((o) => o.is_current) ?? p.organizations[0];
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
        <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-base">
          <Link href="/people" className="flex items-center gap-1 text-sm text-text-tertiary hover:text-text-primary transition-colors">
            <ArrowLeft size={14} />
            People
          </Link>
          <span className="text-text-disabled mx-1">/</span>
          <span className="text-sm text-text-primary truncate flex-1">{displayName}</span>
          <div className="flex items-center gap-1 shrink-0">
            <Hint label="Edit">
              <Link href={`/people/${p.id}/edit`} className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors">
                <Pencil size={14} />
              </Link>
            </Hint>
            <Hint label="Delete">
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-hover hover:text-accent-danger transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </Hint>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-16 pt-6">
          {/* Identity header */}
          <div className="flex items-start gap-4 mb-6">
            <PersonAvatar displayName={displayName} photoUrl={p.photo_url} size="lg" />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-text-primary">{displayName}</h1>
              {p.honorific_prefix && p.display_name && (
                <div className="text-sm text-text-tertiary">{p.honorific_prefix}</div>
              )}
              {p.nickname && (
                <div className="text-sm text-text-tertiary italic">&ldquo;{p.nickname}&rdquo;</div>
              )}
              {primaryOrg && (
                <div className="text-sm text-text-secondary mt-0.5">
                  {[primaryOrg.title, primaryOrg.name].filter(Boolean).join(" @ ")}
                </div>
              )}
              {primaryAddress && (
                <div className="flex items-center gap-1 text-xs text-text-tertiary mt-1">
                  <MapPin size={11} />
                  {[primaryAddress.city, primaryAddress.country_name ?? primaryAddress.country_code].filter(Boolean).join(", ")}
                </div>
              )}
              {p.relationship_type && (
                <span className="inline-block mt-1.5 text-2xs capitalize text-text-tertiary border border-border-subtle rounded px-1.5 py-0.5">
                  {p.relationship_type.replace(/-/g, " ")}
                </span>
              )}
              <TagManager personId={p.id} currentTags={p.tags} />
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-0.5 border-b border-border-subtle mb-0 -mx-1 px-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-md transition-colors border-b-2 -mb-px",
                  activeTab === tab.id
                    ? "text-accent-primary border-accent-primary font-medium"
                    : "text-text-tertiary border-transparent hover:text-text-primary hover:bg-surface-hover",
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
          {activeTab === "tasks" && (
            <TasksTab personId={p.id} />
          )}
          {activeTab === "files" && (
            <FilesTab personId={p.id} />
          )}
          {activeTab === "profile" && (
            <div className="space-y-1 pt-2">
              <Section id="about" title="About" icon={<User size={14} />} hidden={!hasBio}>
                <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{p.biography}</p>
              </Section>

              <Section id="contact" title="Contact" icon={<Mail size={14} />} hidden={!hasContact}>
                <div className="space-y-2">
                  {p.emails.map((e) => (
                    <div key={e.id} className="flex items-center gap-2">
                      {e.is_primary && <Star size={11} className="text-accent-warning shrink-0" />}
                      <Mail size={13} className="text-text-tertiary shrink-0" />
                      <a href={`mailto:${e.email}`} className="text-sm text-text-link hover:underline truncate">{e.email}</a>
                      <span className="text-xs text-text-disabled capitalize">{e.type}</span>
                    </div>
                  ))}
                  {p.phones.map((ph) => (
                    <div key={ph.id} className="flex items-center gap-2">
                      {ph.is_primary && <Star size={11} className="text-accent-warning shrink-0" />}
                      <Phone size={13} className="text-text-tertiary shrink-0" />
                      <a href={`tel:${ph.e164_normalized ?? ph.number}`} className="text-sm text-text-link hover:underline">{ph.number}</a>
                      <span className="text-xs text-text-disabled capitalize">{ph.type}</span>
                    </div>
                  ))}
                  {p.urls.map((u) => (
                    <div key={u.id} className="flex items-center gap-2">
                      <LinkIcon size={13} className="text-text-tertiary shrink-0" />
                      <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-sm text-text-link hover:underline truncate flex items-center gap-1">
                        {u.label ?? u.url}
                        <ExternalLink size={11} className="text-text-disabled shrink-0" />
                      </a>
                      <span className="text-xs text-text-disabled capitalize">{u.type}</span>
                    </div>
                  ))}
                </div>
              </Section>

              <Section id="work" title="Work" icon={<Briefcase size={14} />} hidden={!hasWork}>
                {currentOrgs.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Current</div>
                    <div className="space-y-2">
                      {currentOrgs.map((o) => (
                        <div key={o.id} className="flex items-start gap-2">
                          {o.is_primary && <Star size={11} className="text-accent-warning shrink-0 mt-0.5" />}
                          <div>
                            <div className="text-sm font-medium text-text-primary">{o.name}</div>
                            {o.title && <div className="text-xs text-text-secondary">{o.title}</div>}
                            {o.department && <div className="text-xs text-text-tertiary">{o.department}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pastOrgs.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Past</div>
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

              <Section id="addresses" title="Addresses" icon={<MapPin size={14} />} hidden={!hasAddresses}>
                <div className="space-y-3">
                  {p.addresses.map((a) => (
                    <div key={a.id} className="flex items-start gap-2">
                      {a.is_primary && <Star size={11} className="text-accent-warning shrink-0 mt-0.5" />}
                      <div>
                        <div className="text-xs text-text-disabled capitalize mb-0.5">{a.type}</div>
                        <div className="text-sm text-text-primary whitespace-pre-wrap">{formatAddress(a)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section id="events" title="Events" icon={<Calendar size={14} />} hidden={!hasEvents}>
                <div className="space-y-2">
                  {p.events.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 text-sm text-text-primary">
                      <span className="capitalize text-text-tertiary w-20 shrink-0">{e.label ?? e.type}</span>
                      <span>{formatDate(e.date, locale)}</span>
                    </div>
                  ))}
                </div>
              </Section>

              <Section id="relations" title="Relations" icon={<Users size={14} />} hidden={!hasRelations}>
                <div className="space-y-2">
                  {p.relations.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-sm">
                      <span className="text-text-tertiary capitalize w-20 shrink-0">{r.type}</span>
                      {r.related_person ? (
                        <Link href={`/people/${r.related_person.id}`} className="flex items-center gap-1.5 text-text-link hover:underline">
                          <PersonAvatar displayName={deriveDisplayName(r.related_person)} photoUrl={r.related_person.photo_url} size="xs" />
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
                      <span className="text-text-disabled capitalize w-20 shrink-0">{r.type} ←</span>
                      <Link href={`/people/${r.person.id}`} className="flex items-center gap-1.5 text-text-link hover:underline">
                        <PersonAvatar displayName={deriveDisplayName(r.person)} photoUrl={r.person.photo_url} size="xs" />
                        {deriveDisplayName(r.person)}
                      </Link>
                    </div>
                  ))}
                </div>
              </Section>

              <Section id="skills" title="Skills" icon={<Star size={14} />} hidden={!hasSkills}>
                <div className="flex flex-wrap gap-1.5">
                  {p.skills.map((s) => (
                    <span key={s.id} className="inline-flex items-center rounded-md border border-border-default bg-surface-raised px-2.5 py-1 text-sm text-text-primary">
                      {s.name}
                    </span>
                  ))}
                </div>
              </Section>

              <Section id="interests" title="Interests" icon={<Lightbulb size={14} />} hidden={!hasInterests}>
                <div className="flex flex-wrap gap-1.5">
                  {p.interests.map((i) => (
                    <span key={i.id} className="inline-flex items-center rounded-md border border-border-default bg-surface-raised px-2.5 py-1 text-sm text-text-primary">
                      {i.name}
                    </span>
                  ))}
                </div>
              </Section>

              <Section id="interactions" title="Interactions" icon={<Users size={14} />}>
                <div className="rounded-lg border border-dashed border-border-subtle bg-surface-sunken px-4 py-6 text-center">
                  <p className="text-sm text-text-tertiary">Interaction timeline coming in Wave 5a-ii.</p>
                  <p className="text-xs text-text-disabled mt-1">Calls, meetings, emails, and touchpoint history will appear here.</p>
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>

      {/* Sticky TOC — only shown on profile tab */}
      {activeTab === "profile" && (
        <aside className="hidden lg:flex w-44 shrink-0 flex-col py-6 pr-4 overflow-y-auto">
          <div className="text-xs font-semibold text-text-disabled uppercase tracking-wider mb-3">On this page</div>
          <nav className="space-y-1">
            {PROFILE_TOC_SECTIONS.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className={cn(
                  "block text-xs py-1 px-2 rounded transition-colors",
                  activeSection === id
                    ? "text-accent-primary bg-accent-primary-subtle font-medium"
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
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-surface-base/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border-default bg-surface-raised p-5 shadow-2 mx-4">
            <h3 className="font-semibold text-text-primary mb-2">Delete {displayName}?</h3>
            <p className="text-sm text-text-tertiary mb-4">This will soft-delete the person. All data can be recovered by an admin.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteOpen(false)} className="px-3 py-1.5 text-sm rounded-md border border-border-default text-text-secondary hover:bg-surface-hover">Cancel</button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ id: p.id })}
                className="px-3 py-1.5 text-sm rounded-md bg-accent-danger text-white hover:opacity-90 disabled:opacity-60"
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
