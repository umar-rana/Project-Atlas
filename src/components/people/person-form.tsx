"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { PersonAvatar } from "./person-avatar";
import { RelationshipTypePicker } from "./relationship-type-picker";
import { deriveDisplayName } from "@/core/people/validation";
import { cn } from "@/lib/utils";
import { Plus, X, Star, ArrowLeft, ChevronRight } from "lucide-react";

const EMAIL_TYPES = ["home", "work", "other"];
const PHONE_TYPES = ["mobile", "home", "work", "fax", "other"];
const ADDRESS_TYPES = ["home", "work", "other"];
const URL_TYPES = ["linkedin", "twitter", "github", "website", "other"];
const EVENT_TYPES = ["birthday", "anniversary", "other"];
const RELATION_TYPES = ["spouse", "partner", "parent", "child", "sibling", "friend", "colleague", "other"];

const ISO_COUNTRIES = [
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" }, { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" },
  { code: "JP", name: "Japan" }, { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" }, { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" }, { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" }, { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" }, { code: "ZA", name: "South Africa" },
];

interface Email { id?: string; email: string; type: string; is_primary: boolean }
interface Phone { id?: string; number: string; type: string; is_primary: boolean }
interface Address { id?: string; type: string; street: string; city: string; region: string; postal_code: string; country_code: string; country_name: string; is_primary: boolean }
interface Org { id?: string; name: string; title: string; department: string; is_current: boolean; is_primary: boolean; start_date: string; end_date: string }
interface Url { id?: string; url: string; type: string; label: string }
interface Event_ { id?: string; type: string; date: string; label: string }
interface Relation { id?: string; related_person_id?: string; related_text: string; type: string; use_picker: boolean }
interface Chip { id?: string; name: string }

const TOC = [
  { id: "name", label: "Name" },
  { id: "profile", label: "Profile" },
  { id: "contact", label: "Contact" },
  { id: "work", label: "Work" },
  { id: "addresses", label: "Addresses" },
  { id: "events", label: "Events" },
  { id: "relations", label: "Relations" },
  { id: "skills", label: "Skills" },
  { id: "interests", label: "Interests" },
  { id: "cadence", label: "Follow-up" },
];

const CADENCE_PRESETS = [
  { label: "None", value: null },
  { label: "Weekly", value: 7 },
  { label: "Monthly", value: 30 },
  { label: "Quarterly", value: 90 },
  { label: "Yearly", value: 365 },
  { label: "Custom", value: -1 },
] as const;

interface Props {
  mode: "create" | "edit";
  personId?: string;
}

export function PersonForm({ mode, personId }: Props) {
  const router = useRouter();
  const [isDirty, setIsDirty] = useState(false);
  const [activeSection, setActiveSection] = useState("name");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic fields
  const [displayName, setDisplayName] = useState("");
  const [honorificPrefix, setHonorificPrefix] = useState("");
  const [givenName, setGivenName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [honorificSuffix, setHonorificSuffix] = useState("");
  const [nickname, setNickname] = useState("");
  const [biography, setBiography] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [relationshipType, setRelationshipType] = useState("");

  // Multi-value
  const [emails, setEmails] = useState<Email[]>([]);
  const [phones, setPhones] = useState<Phone[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [urls, setUrls] = useState<Url[]>([]);
  const [events, setEvents] = useState<Event_[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [skills, setSkills] = useState<Chip[]>([]);
  const [interests, setInterests] = useState<Chip[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [interestInput, setInterestInput] = useState("");

  // Cadence
  const [cadencePreset, setCadencePreset] = useState<null | number | -1>(null);
  const [cadenceCustom, setCadenceCustom] = useState("");

  const utils = trpc.useUtils();

  const { data: existingPerson } = trpc.people.get.useQuery(
    { id: personId ?? "" },
    { enabled: mode === "edit" && !!personId },
  );

  const { data: allSkills = [] } = trpc.people.skills.listAll.useQuery();
  const { data: allInterests = [] } = trpc.people.interests.listAll.useQuery();
  const { data: peopleSearch } = trpc.people.search.useQuery({ query: "", limit: 20 });

  // Sub-router add mutations
  const addEmail = trpc.people.emails.add.useMutation();
  const updateEmail = trpc.people.emails.update.useMutation();
  const removeEmail = trpc.people.emails.remove.useMutation();
  const addPhone = trpc.people.phones.add.useMutation();
  const updatePhone = trpc.people.phones.update.useMutation();
  const removePhone = trpc.people.phones.remove.useMutation();
  const addAddress = trpc.people.addresses.add.useMutation();
  const updateAddress = trpc.people.addresses.update.useMutation();
  const removeAddress = trpc.people.addresses.remove.useMutation();
  const addOrg = trpc.people.organizations.add.useMutation();
  const updateOrg = trpc.people.organizations.update.useMutation();
  const removeOrg = trpc.people.organizations.remove.useMutation();
  const addUrl = trpc.people.urls.add.useMutation();
  const updateUrl_ = trpc.people.urls.update.useMutation();
  const removeUrl = trpc.people.urls.remove.useMutation();
  const addEvent = trpc.people.events.add.useMutation();
  const updateEvent = trpc.people.events.update.useMutation();
  const removeEvent = trpc.people.events.remove.useMutation();
  const addRelation = trpc.people.relations.add.useMutation();
  const updateRelation = trpc.people.relations.update.useMutation();
  const removeRelation = trpc.people.relations.remove.useMutation();
  const addSkill = trpc.people.skills.add.useMutation();
  const removeSkill = trpc.people.skills.remove.useMutation();
  const addInterest = trpc.people.interests.add.useMutation();
  const removeInterest = trpc.people.interests.remove.useMutation();

  const createMutation = trpc.people.create.useMutation();
  const updateMutation = trpc.people.update.useMutation();

  // Load existing person data (include IDs for edit-mode diffing)
  useEffect(() => {
    if (!existingPerson) return;
    // Cast to a simple shape to avoid TS2589 on deeply inferred tRPC types
    const p = existingPerson as unknown as {
      display_name: string | null; honorific_prefix: string | null; given_name: string | null;
      middle_name: string | null; family_name: string | null; honorific_suffix: string | null;
      nickname: string | null; biography: string | null; photo_url: string | null; relationship_type: string | null;
      cadence_days: number | null | undefined;
      emails: { id: string; email: string; type: string; is_primary: boolean }[];
      phones: { id: string; number: string; type: string; is_primary: boolean }[];
      addresses: { id: string; type: string; street: string | null; city: string | null; region: string | null; postal_code: string | null; country_code: string | null; country_name: string | null; is_primary: boolean }[];
      organizations: { id: string; name: string; title: string | null; department: string | null; is_current: boolean; is_primary: boolean; start_date: Date | null; end_date: Date | null }[];
      urls: { id: string; url: string; type: string; label: string | null }[];
      events: { id: string; type: string; date: Date; label: string | null }[];
      relations: { id: string; related_person_id: string | null; related_text: string | null; type: string }[];
      skills: { id: string; name: string }[];
      interests: { id: string; name: string }[];
    };
    setDisplayName(p.display_name ?? "");
    setHonorificPrefix(p.honorific_prefix ?? "");
    setGivenName(p.given_name ?? "");
    setMiddleName(p.middle_name ?? "");
    setFamilyName(p.family_name ?? "");
    setHonorificSuffix(p.honorific_suffix ?? "");
    setNickname(p.nickname ?? "");
    setBiography(p.biography ?? "");
    setPhotoUrl(p.photo_url ?? "");
    setRelationshipType(p.relationship_type ?? "");
    setEmails(p.emails.map((e) => ({ id: e.id, email: e.email, type: e.type, is_primary: e.is_primary })));
    setPhones(p.phones.map((ph) => ({ id: ph.id, number: ph.number, type: ph.type, is_primary: ph.is_primary })));
    setAddresses(p.addresses.map((a) => ({ id: a.id, type: a.type, street: a.street ?? "", city: a.city ?? "", region: a.region ?? "", postal_code: a.postal_code ?? "", country_code: a.country_code ?? "", country_name: a.country_name ?? "", is_primary: a.is_primary })));
    setOrgs(p.organizations.map((o) => ({ id: o.id, name: o.name, title: o.title ?? "", department: o.department ?? "", is_current: o.is_current, is_primary: o.is_primary, start_date: o.start_date ? new Date(o.start_date).toISOString().slice(0, 10) : "", end_date: o.end_date ? new Date(o.end_date).toISOString().slice(0, 10) : "" })));
    setUrls(p.urls.map((u) => ({ id: u.id, url: u.url, type: u.type, label: u.label ?? "" })));
    setEvents(p.events.map((e) => ({ id: e.id, type: e.type, date: new Date(e.date).toISOString().slice(0, 10), label: e.label ?? "" })));
    setRelations(p.relations.map((r) => ({ id: r.id, related_person_id: r.related_person_id ?? undefined, related_text: r.related_text ?? "", type: r.type, use_picker: !!r.related_person_id })));
    setSkills(p.skills.map((s) => ({ id: s.id, name: s.name })));
    setInterests(p.interests.map((i) => ({ id: i.id, name: i.name })));

    const cd = p.cadence_days ?? null;
    if (cd === null) {
      setCadencePreset(null);
    } else {
      const preset = CADENCE_PRESETS.find((x) => x.value === cd && x.value !== null && x.value !== -1);
      if (preset) {
        setCadencePreset(cd);
      } else {
        setCadencePreset(-1);
        setCadenceCustom(String(cd));
      }
    }
  }, [existingPerson]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  function handleCancel() {
    if (isDirty && !confirm("Discard unsaved changes?")) return;
    if (mode === "edit" && personId) {
      router.push(`/people/${personId}`);
    } else {
      router.push("/people");
    }
  }

  function scrollToFirstInvalid(sectionId: string) {
    const el = document.getElementById(`section-${sectionId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // ── Client-side validation (scroll to first failing section) ──────────────
    const hasAnyName = displayName.trim() || givenName.trim() || familyName.trim() || nickname.trim();
    if (!hasAnyName) {
      setError("A name is required. Provide a display name, given/family name, or nickname.");
      scrollToFirstInvalid("name");
      return;
    }
    for (const em of emails) {
      if (em.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.email.trim())) {
        setError(`Invalid email address: "${em.email.trim()}"`);
        scrollToFirstInvalid("contact");
        return;
      }
    }
    for (const org of orgs) {
      if (!org.is_current && org.start_date && org.end_date) {
        if (new Date(org.start_date) > new Date(org.end_date)) {
          setError(`Work history: start date must be before end date for "${org.name}".`);
          scrollToFirstInvalid("work");
          return;
        }
      }
    }

    setSubmitting(true);

    try {
      // Compute cadence_days from form state
      let cadenceDaysValue: number | null | undefined = undefined;
      if (cadencePreset === null) {
        cadenceDaysValue = null;
      } else if (cadencePreset === -1) {
        const parsed = parseInt(cadenceCustom, 10);
        cadenceDaysValue = !isNaN(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : null;
      } else {
        cadenceDaysValue = cadencePreset as number;
      }

      const coreData = {
        display_name: displayName || undefined,
        honorific_prefix: honorificPrefix || undefined,
        given_name: givenName || undefined,
        middle_name: middleName || undefined,
        family_name: familyName || undefined,
        honorific_suffix: honorificSuffix || undefined,
        nickname: nickname || undefined,
        biography: biography || undefined,
        photo_url: photoUrl || undefined,
        relationship_type: relationshipType || undefined,
        ...(cadenceDaysValue !== undefined ? { cadence_days: cadenceDaysValue } : {}),
      };

      let pid: string;

      if (mode === "create") {
        const created = await createMutation.mutateAsync(coreData);
        pid = created.id;
      } else {
        if (!personId) throw new Error("Missing personId");
        await updateMutation.mutateAsync({ id: personId, ...coreData });
        pid = personId;
      }

      // ── Persist child rows ────────────────────────────────────────────
      // For each child type: rows with no id → add; rows with id retained → update; ids from original not in state → remove

      // Use typed helper to avoid TS2589 deep instantiation on tRPC inferred types
      const toIdSet = (arr: { id: string }[] | undefined): Set<string> =>
        new Set((arr ?? []).map((r) => r.id));
      const ep = existingPerson as { emails?: { id: string }[]; phones?: { id: string }[]; addresses?: { id: string }[]; organizations?: { id: string }[]; urls?: { id: string }[]; events?: { id: string }[]; relations?: { id: string }[]; skills?: { id: string }[]; interests?: { id: string }[] } | undefined;
      const origEmailIds = toIdSet(ep?.emails);
      const origPhoneIds = toIdSet(ep?.phones);
      const origAddressIds = toIdSet(ep?.addresses);
      const origOrgIds = toIdSet(ep?.organizations);
      const origUrlIds = toIdSet(ep?.urls);
      const origEventIds = toIdSet(ep?.events);
      const origRelationIds = toIdSet(ep?.relations);
      const origSkillIds = toIdSet(ep?.skills);
      const origInterestIds = toIdSet(ep?.interests);

      const currEmailIds = new Set(emails.filter((r) => r.id).map((r) => r.id!));
      const currPhoneIds = new Set(phones.filter((r) => r.id).map((r) => r.id!));
      const currAddressIds = new Set(addresses.filter((r) => r.id).map((r) => r.id!));
      const currOrgIds = new Set(orgs.filter((r) => r.id).map((r) => r.id!));
      const currUrlIds = new Set(urls.filter((r) => r.id).map((r) => r.id!));
      const currEventIds = new Set(events.filter((r) => r.id).map((r) => r.id!));
      const currRelationIds = new Set(relations.filter((r) => r.id).map((r) => r.id!));
      const currSkillIds = new Set(skills.filter((r) => r.id).map((r) => r.id!));
      const currInterestIds = new Set(interests.filter((r) => r.id).map((r) => r.id!));

      const toIso = (s: string) => new Date(s).toISOString();

      // Removes — cast to unknown[] to avoid TS depth limit on heterogeneous spreads
      const removals: Promise<unknown>[] = [
        ...[...origEmailIds].filter((id) => !currEmailIds.has(id)).map((id) => removeEmail.mutateAsync({ id })),
        ...[...origPhoneIds].filter((id) => !currPhoneIds.has(id)).map((id) => removePhone.mutateAsync({ id })),
        ...[...origAddressIds].filter((id) => !currAddressIds.has(id)).map((id) => removeAddress.mutateAsync({ id })),
        ...[...origOrgIds].filter((id) => !currOrgIds.has(id)).map((id) => removeOrg.mutateAsync({ id })),
        ...[...origUrlIds].filter((id) => !currUrlIds.has(id)).map((id) => removeUrl.mutateAsync({ id })),
        ...[...origEventIds].filter((id) => !currEventIds.has(id)).map((id) => removeEvent.mutateAsync({ id })),
        ...[...origRelationIds].filter((id) => !currRelationIds.has(id)).map((id) => removeRelation.mutateAsync({ id })),
        ...[...origSkillIds].filter((id) => !currSkillIds.has(id)).map((id) => removeSkill.mutateAsync({ id })),
        ...[...origInterestIds].filter((id) => !currInterestIds.has(id)).map((id) => removeInterest.mutateAsync({ id })),
      ];
      await Promise.all(removals);

      // Adds and Updates — collect into typed unknown[] arrays to avoid TS2589
      const upserts: Promise<unknown>[] = [];

      for (const r of emails) {
        if (!r.id && r.email.trim()) upserts.push(addEmail.mutateAsync({ person_id: pid, email: r.email.trim(), type: r.type, is_primary: r.is_primary }));
        else if (r.id) upserts.push(updateEmail.mutateAsync({ id: r.id, email: r.email.trim(), type: r.type, is_primary: r.is_primary }));
      }
      for (const r of phones) {
        if (!r.id && r.number.trim()) upserts.push(addPhone.mutateAsync({ person_id: pid, number: r.number.trim(), type: r.type, is_primary: r.is_primary }));
        else if (r.id) upserts.push(updatePhone.mutateAsync({ id: r.id, number: r.number.trim(), type: r.type, is_primary: r.is_primary }));
      }
      for (const r of addresses) {
        const addrData = { type: r.type, street: r.street || undefined, city: r.city || undefined, region: r.region || undefined, postal_code: r.postal_code || undefined, country_code: r.country_code || undefined, country_name: r.country_name || undefined, is_primary: r.is_primary };
        if (!r.id && (r.street.trim() || r.city.trim())) upserts.push(addAddress.mutateAsync({ person_id: pid, ...addrData }));
        else if (r.id) upserts.push(updateAddress.mutateAsync({ id: r.id, ...addrData }));
      }
      for (const r of orgs) {
        const orgData = { name: r.name.trim(), title: r.title || undefined, department: r.department || undefined, is_current: r.is_current, is_primary: r.is_primary, start_date: r.start_date ? toIso(r.start_date) : undefined, end_date: r.end_date ? toIso(r.end_date) : undefined };
        if (!r.id && r.name.trim()) upserts.push(addOrg.mutateAsync({ person_id: pid, ...orgData }));
        else if (r.id) upserts.push(updateOrg.mutateAsync({ id: r.id, ...orgData }));
      }
      for (const r of urls) {
        const urlData = { url: r.url.trim(), type: r.type, label: r.label || undefined };
        if (!r.id && r.url.trim()) upserts.push(addUrl.mutateAsync({ person_id: pid, ...urlData }));
        else if (r.id) upserts.push(updateUrl_.mutateAsync({ id: r.id, ...urlData }));
      }
      for (const r of events) {
        if (!r.date) continue;
        const evtData = { type: r.type, date: toIso(r.date), label: r.label || undefined };
        if (!r.id) upserts.push(addEvent.mutateAsync({ person_id: pid, ...evtData }));
        else upserts.push(updateEvent.mutateAsync({ id: r.id, ...evtData }));
      }
      for (const r of relations) {
        if (!r.related_person_id && !r.related_text.trim()) continue;
        const relData = { type: r.type, related_person_id: r.related_person_id || undefined, related_text: r.related_text || undefined };
        if (!r.id) upserts.push(addRelation.mutateAsync({ person_id: pid, ...relData }));
        else upserts.push(updateRelation.mutateAsync({ id: r.id, ...relData }));
      }
      for (const r of skills) {
        if (!r.id && r.name.trim()) upserts.push(addSkill.mutateAsync({ person_id: pid, name: r.name.trim() }));
      }
      for (const r of interests) {
        if (!r.id && r.name.trim()) upserts.push(addInterest.mutateAsync({ person_id: pid, name: r.name.trim() }));
      }

      await Promise.all(upserts);

      await void utils.people.list.invalidate();
      if (personId) await void utils.people.get.invalidate({ id: personId });

      router.push(`/people/${pid}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  // TOC scroll observer
  const sectionObserver = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    sectionObserver.current?.disconnect();
    sectionObserver.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );
    for (const { id } of TOC) {
      const el = document.getElementById(`section-${id}`);
      if (el) sectionObserver.current.observe(el);
    }
    return () => sectionObserver.current?.disconnect();
  });

  const previewName = deriveDisplayName({ display_name: displayName, given_name: givenName, family_name: familyName, nickname, handle: "person" });

  function setPrimary<T extends { is_primary: boolean }>(list: T[], idx: number): T[] {
    return list.map((item, i) => ({ ...item, is_primary: i === idx }));
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main form */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-base">
          <button type="button" onClick={handleCancel} className="flex items-center gap-1 text-sm text-text-tertiary hover:text-text-primary transition-colors">
            <ArrowLeft size={14} />
            {mode === "edit" ? "Back" : "People"}
          </button>
          <span className="text-sm text-text-primary truncate flex-1 pl-2">
            {mode === "create" ? "New person" : (previewName || "Edit person")}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={handleCancel} className="px-3 py-1.5 text-sm rounded-md border border-border-default text-text-secondary hover:bg-surface-hover">Cancel</button>
            <button type="submit" form="person-form" disabled={submitting} className="px-3 py-1.5 text-sm rounded-md bg-accent-primary text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-60 transition-colors">
              {submitting ? "Saving…" : mode === "create" ? "Create" : "Save"}
            </button>
          </div>
        </div>

        <form id="person-form" onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 pb-16 pt-6 space-y-8">
          {error && (
            <div className="rounded-md border border-accent-danger bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">{error}</div>
          )}

          {/* Preview avatar */}
          <div className="flex justify-center">
            <PersonAvatar displayName={previewName} photoUrl={photoUrl || undefined} size="lg" />
          </div>

          {/* Name section */}
          <section id="section-name">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-disabled mb-3">Name</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Display name</label>
                <input className={INPUT} value={displayName} onChange={(e) => { setDisplayName(e.target.value); markDirty(); }} placeholder="How to address them" />
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Nickname</label>
                <input className={INPUT} value={nickname} onChange={(e) => { setNickname(e.target.value); markDirty(); }} placeholder="Nickname or alias" />
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Honorific prefix</label>
                <input className={INPUT} value={honorificPrefix} onChange={(e) => { setHonorificPrefix(e.target.value); markDirty(); }} placeholder="Mr., Dr., Prof." />
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Given name</label>
                <input className={INPUT} value={givenName} onChange={(e) => { setGivenName(e.target.value); markDirty(); }} placeholder="First name" />
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Middle name</label>
                <input className={INPUT} value={middleName} onChange={(e) => { setMiddleName(e.target.value); markDirty(); }} />
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Family name</label>
                <input className={INPUT} value={familyName} onChange={(e) => { setFamilyName(e.target.value); markDirty(); }} placeholder="Last name" />
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Honorific suffix</label>
                <input className={INPUT} value={honorificSuffix} onChange={(e) => { setHonorificSuffix(e.target.value); markDirty(); }} placeholder="Jr., Sr., III" />
              </div>
            </div>
          </section>

          {/* Profile section */}
          <section id="section-profile">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-disabled mb-3">Profile</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Relationship type</label>
                <RelationshipTypePicker value={relationshipType || undefined} onChange={(t) => { setRelationshipType(t); markDirty(); }} />
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Photo URL</label>
                <input className={INPUT} value={photoUrl} onChange={(e) => { setPhotoUrl(e.target.value); markDirty(); }} placeholder="https://…" />
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Biography</label>
                <textarea className={cn(INPUT, "min-h-[100px] resize-y")} value={biography} onChange={(e) => { setBiography(e.target.value); markDirty(); }} placeholder="A short bio…" />
              </div>
            </div>
          </section>

          {/* Contact section */}
          <section id="section-contact">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-disabled mb-3">Contact</h2>

            {/* Emails */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-tertiary">Email addresses</span>
                <button type="button" onClick={() => { setEmails([...emails, { email: "", type: "other", is_primary: emails.length === 0 }]); markDirty(); }} className={ADD_BTN}>
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="space-y-2">
                {emails.map((email, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <button type="button" onClick={() => { setEmails(setPrimary(emails, idx)); markDirty(); }} className={cn("shrink-0", email.is_primary ? "text-accent-warning" : "text-text-disabled hover:text-text-tertiary")}>
                      <Star size={14} fill={email.is_primary ? "currentColor" : "none"} />
                    </button>
                    <select className={cn(INPUT, "w-24 shrink-0")} value={email.type} onChange={(e) => { const n = [...emails]; n[idx] = { ...n[idx]!, type: e.target.value }; setEmails(n); markDirty(); }}>
                      {EMAIL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input className={cn(INPUT, "flex-1")} type="email" value={email.email} onChange={(e) => { const n = [...emails]; n[idx] = { ...n[idx]!, email: e.target.value }; setEmails(n); markDirty(); }} placeholder="email@example.com" />
                    <button type="button" onClick={() => { setEmails(emails.filter((_, i) => i !== idx)); markDirty(); }} className="shrink-0 text-text-disabled hover:text-accent-danger"><X size={14} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* Phones */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-tertiary">Phone numbers</span>
                <button type="button" onClick={() => { setPhones([...phones, { number: "", type: "mobile", is_primary: phones.length === 0 }]); markDirty(); }} className={ADD_BTN}>
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="space-y-2">
                {phones.map((phone, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <button type="button" onClick={() => { setPhones(setPrimary(phones, idx)); markDirty(); }} className={cn("shrink-0", phone.is_primary ? "text-accent-warning" : "text-text-disabled hover:text-text-tertiary")}>
                      <Star size={14} fill={phone.is_primary ? "currentColor" : "none"} />
                    </button>
                    <select className={cn(INPUT, "w-24 shrink-0")} value={phone.type} onChange={(e) => { const n = [...phones]; n[idx] = { ...n[idx]!, type: e.target.value }; setPhones(n); markDirty(); }}>
                      {PHONE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input className={cn(INPUT, "flex-1")} type="tel" value={phone.number} onChange={(e) => { const n = [...phones]; n[idx] = { ...n[idx]!, number: e.target.value }; setPhones(n); markDirty(); }} placeholder="+1 555 000 0000" />
                    <button type="button" onClick={() => { setPhones(phones.filter((_, i) => i !== idx)); markDirty(); }} className="shrink-0 text-text-disabled hover:text-accent-danger"><X size={14} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* URLs */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-tertiary">Links & websites</span>
                <button type="button" onClick={() => { setUrls([...urls, { url: "", type: "other", label: "" }]); markDirty(); }} className={ADD_BTN}>
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="space-y-2">
                {urls.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select className={cn(INPUT, "w-24 shrink-0")} value={url.type} onChange={(e) => { const n = [...urls]; n[idx] = { ...n[idx]!, type: e.target.value }; setUrls(n); markDirty(); }}>
                      {URL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input className={cn(INPUT, "flex-1")} value={url.url} onChange={(e) => { const n = [...urls]; n[idx] = { ...n[idx]!, url: e.target.value }; setUrls(n); markDirty(); }} placeholder="https://…" />
                    <input className={cn(INPUT, "w-24")} value={url.label} onChange={(e) => { const n = [...urls]; n[idx] = { ...n[idx]!, label: e.target.value }; setUrls(n); markDirty(); }} placeholder="Label" />
                    <button type="button" onClick={() => { setUrls(urls.filter((_, i) => i !== idx)); markDirty(); }} className="shrink-0 text-text-disabled hover:text-accent-danger"><X size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Work section */}
          <section id="section-work">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-disabled mb-3">Work</h2>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-tertiary">Organizations</span>
              <button type="button" onClick={() => { setOrgs([...orgs, { name: "", title: "", department: "", is_current: true, is_primary: orgs.length === 0, start_date: "", end_date: "" }]); markDirty(); }} className={ADD_BTN}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-4">
              {orgs.map((org, idx) => (
                <div key={idx} className="rounded-lg border border-border-subtle p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { setOrgs(setPrimary(orgs, idx)); markDirty(); }} className={cn("shrink-0", org.is_primary ? "text-accent-warning" : "text-text-disabled hover:text-text-tertiary")}>
                      <Star size={14} fill={org.is_primary ? "currentColor" : "none"} />
                    </button>
                    <input className={cn(INPUT, "flex-1")} value={org.name} onChange={(e) => { const n = [...orgs]; n[idx] = { ...n[idx]!, name: e.target.value }; setOrgs(n); markDirty(); }} placeholder="Organization name" />
                    <button type="button" onClick={() => { setOrgs(orgs.filter((_, i) => i !== idx)); markDirty(); }} className="shrink-0 text-text-disabled hover:text-accent-danger"><X size={14} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={INPUT} value={org.title} onChange={(e) => { const n = [...orgs]; n[idx] = { ...n[idx]!, title: e.target.value }; setOrgs(n); markDirty(); }} placeholder="Title / role" />
                    <input className={INPUT} value={org.department} onChange={(e) => { const n = [...orgs]; n[idx] = { ...n[idx]!, department: e.target.value }; setOrgs(n); markDirty(); }} placeholder="Department" />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                      <input type="checkbox" checked={org.is_current} onChange={(e) => { const n = [...orgs]; n[idx] = { ...n[idx]!, is_current: e.target.checked, end_date: e.target.checked ? "" : n[idx]!.end_date }; setOrgs(n); markDirty(); }} className="rounded" />
                      Current
                    </label>
                    <input type="date" className={cn(INPUT, "flex-1")} value={org.start_date} onChange={(e) => { const n = [...orgs]; n[idx] = { ...n[idx]!, start_date: e.target.value }; setOrgs(n); markDirty(); }} placeholder="Start date" />
                    {!org.is_current && (
                      <input type="date" className={cn(INPUT, "flex-1")} value={org.end_date} onChange={(e) => { const n = [...orgs]; n[idx] = { ...n[idx]!, end_date: e.target.value }; setOrgs(n); markDirty(); }} placeholder="End date" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Addresses section */}
          <section id="section-addresses">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-disabled mb-3">Addresses</h2>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-tertiary">Addresses</span>
              <button type="button" onClick={() => { setAddresses([...addresses, { type: "home", street: "", city: "", region: "", postal_code: "", country_code: "", country_name: "", is_primary: addresses.length === 0 }]); markDirty(); }} className={ADD_BTN}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-4">
              {addresses.map((addr, idx) => (
                <div key={idx} className="rounded-lg border border-border-subtle p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { setAddresses(setPrimary(addresses, idx)); markDirty(); }} className={cn("shrink-0", addr.is_primary ? "text-accent-warning" : "text-text-disabled hover:text-text-tertiary")}>
                      <Star size={14} fill={addr.is_primary ? "currentColor" : "none"} />
                    </button>
                    <select className={cn(INPUT, "w-24 shrink-0")} value={addr.type} onChange={(e) => { const n = [...addresses]; n[idx] = { ...n[idx]!, type: e.target.value }; setAddresses(n); markDirty(); }}>
                      {ADDRESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button type="button" onClick={() => { setAddresses(addresses.filter((_, i) => i !== idx)); markDirty(); }} className="shrink-0 text-text-disabled hover:text-accent-danger ml-auto"><X size={14} /></button>
                  </div>
                  <input className={INPUT} value={addr.street} onChange={(e) => { const n = [...addresses]; n[idx] = { ...n[idx]!, street: e.target.value }; setAddresses(n); markDirty(); }} placeholder="Street address" />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={INPUT} value={addr.city} onChange={(e) => { const n = [...addresses]; n[idx] = { ...n[idx]!, city: e.target.value }; setAddresses(n); markDirty(); }} placeholder="City" />
                    <input className={INPUT} value={addr.region} onChange={(e) => { const n = [...addresses]; n[idx] = { ...n[idx]!, region: e.target.value }; setAddresses(n); markDirty(); }} placeholder="State / Province" />
                    <input className={INPUT} value={addr.postal_code} onChange={(e) => { const n = [...addresses]; n[idx] = { ...n[idx]!, postal_code: e.target.value }; setAddresses(n); markDirty(); }} placeholder="Postal code" />
                    <select className={INPUT} value={addr.country_code} onChange={(e) => { const opt = ISO_COUNTRIES.find((c) => c.code === e.target.value); const n = [...addresses]; n[idx] = { ...n[idx]!, country_code: e.target.value, country_name: opt?.name ?? "" }; setAddresses(n); markDirty(); }}>
                      <option value="">Country…</option>
                      {ISO_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Events section */}
          <section id="section-events">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-disabled mb-3">Events</h2>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-tertiary">Events</span>
              <button type="button" onClick={() => { setEvents([...events, { type: "birthday", date: "", label: "" }]); markDirty(); }} className={ADD_BTN}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {events.map((evt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select className={cn(INPUT, "w-28 shrink-0")} value={evt.type} onChange={(e) => { const n = [...events]; n[idx] = { ...n[idx]!, type: e.target.value }; setEvents(n); markDirty(); }}>
                    {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="date" className={cn(INPUT, "flex-1")} value={evt.date} onChange={(e) => { const n = [...events]; n[idx] = { ...n[idx]!, date: e.target.value }; setEvents(n); markDirty(); }} />
                  <input className={cn(INPUT, "w-24")} value={evt.label} onChange={(e) => { const n = [...events]; n[idx] = { ...n[idx]!, label: e.target.value }; setEvents(n); markDirty(); }} placeholder="Label" />
                  <button type="button" onClick={() => { setEvents(events.filter((_, i) => i !== idx)); markDirty(); }} className="shrink-0 text-text-disabled hover:text-accent-danger"><X size={14} /></button>
                </div>
              ))}
            </div>
          </section>

          {/* Relations section */}
          <section id="section-relations">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-disabled mb-3">Relations</h2>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-tertiary">Relations</span>
              <button type="button" onClick={() => { setRelations([...relations, { related_text: "", type: "other", use_picker: false }]); markDirty(); }} className={ADD_BTN}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {relations.map((rel, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select className={cn(INPUT, "w-24 shrink-0")} value={rel.type} onChange={(e) => { const n = [...relations]; n[idx] = { ...n[idx]!, type: e.target.value }; setRelations(n); markDirty(); }}>
                    {RELATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-text-tertiary shrink-0 cursor-pointer">
                    <input type="checkbox" checked={rel.use_picker} onChange={(e) => { const n = [...relations]; n[idx] = { ...n[idx]!, use_picker: e.target.checked, related_person_id: undefined, related_text: "" }; setRelations(n); markDirty(); }} />
                    Pick
                  </label>
                  {rel.use_picker ? (
                    <select className={cn(INPUT, "flex-1")} value={rel.related_person_id ?? ""} onChange={(e) => { const n = [...relations]; n[idx] = { ...n[idx]!, related_person_id: e.target.value || undefined }; setRelations(n); markDirty(); }}>
                      <option value="">Select person…</option>
                      {(peopleSearch ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {deriveDisplayName({ display_name: p.display_name, given_name: p.given_name, family_name: p.family_name, handle: p.handle })}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className={cn(INPUT, "flex-1")} value={rel.related_text} onChange={(e) => { const n = [...relations]; n[idx] = { ...n[idx]!, related_text: e.target.value }; setRelations(n); markDirty(); }} placeholder="Person name" />
                  )}
                  <button type="button" onClick={() => { setRelations(relations.filter((_, i) => i !== idx)); markDirty(); }} className="shrink-0 text-text-disabled hover:text-accent-danger"><X size={14} /></button>
                </div>
              ))}
            </div>
          </section>

          {/* Skills section */}
          <section id="section-skills">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-disabled mb-3">Skills</h2>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {skills.map((s, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-raised px-2 py-0.5 text-sm text-text-primary">
                  {s.name}
                  <button type="button" onClick={() => { setSkills(skills.filter((_, i) => i !== idx)); markDirty(); }} className="text-text-disabled hover:text-accent-danger"><X size={11} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className={cn(INPUT, "flex-1")}
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = skillInput.trim();
                    if (val && !skills.some((s) => s.name === val)) { setSkills([...skills, { name: val }]); markDirty(); }
                    setSkillInput("");
                  }
                }}
                placeholder="Add skill…"
                list="skills-autocomplete"
              />
              <datalist id="skills-autocomplete">
                {allSkills.filter((s) => s.toLowerCase().includes(skillInput.toLowerCase())).map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
          </section>

          {/* Follow-up Cadence section */}
          <section id="section-cadence">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-disabled mb-3">Follow-up Cadence</h2>
            <p className="text-xs text-text-tertiary mb-3">
              Set how often you want to stay in touch. Atlas will show this person on your follow-up list when the cadence period has passed.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {CADENCE_PRESETS.map((preset) => {
                const isActive = cadencePreset === preset.value;
                return (
                  <button
                    key={String(preset.value)}
                    type="button"
                    onClick={() => { setCadencePreset(preset.value as number | null); markDirty(); }}
                    className={cn(
                      "px-3 py-1.5 rounded-md border text-xs transition-colors",
                      isActive
                        ? "border-accent-primary bg-accent-primary-subtle text-accent-primary font-medium"
                        : "border-border-default text-text-tertiary hover:text-text-primary hover:border-border-strong",
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            {cadencePreset === -1 && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className={cn(INPUT, "w-32")}
                  value={cadenceCustom}
                  onChange={(e) => { setCadenceCustom(e.target.value); markDirty(); }}
                  placeholder="Days"
                  min={1}
                  max={3650}
                />
                <span className="text-xs text-text-tertiary">days between follow-ups (1–3650)</span>
              </div>
            )}
          </section>

          {/* Interests section */}
          <section id="section-interests">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-disabled mb-3">Interests</h2>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {interests.map((i, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-raised px-2 py-0.5 text-sm text-text-primary">
                  {i.name}
                  <button type="button" onClick={() => { setInterests(interests.filter((_, ii) => ii !== idx)); markDirty(); }} className="text-text-disabled hover:text-accent-danger"><X size={11} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className={cn(INPUT, "flex-1")}
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = interestInput.trim();
                    if (val && !interests.some((i) => i.name === val)) { setInterests([...interests, { name: val }]); markDirty(); }
                    setInterestInput("");
                  }
                }}
                placeholder="Add interest…"
                list="interests-autocomplete"
              />
              <datalist id="interests-autocomplete">
                {allInterests.filter((i) => i.toLowerCase().includes(interestInput.toLowerCase())).map((i) => <option key={i} value={i} />)}
              </datalist>
            </div>
          </section>
        </form>
      </div>

      {/* TOC sidebar */}
      <aside className="hidden lg:flex w-40 shrink-0 flex-col py-6 pr-4 overflow-y-auto">
        <div className="text-xs font-semibold text-text-disabled uppercase tracking-wider mb-3">Sections</div>
        <nav className="space-y-1">
          {TOC.map(({ id, label }) => (
            <a
              key={id}
              href={`#section-${id}`}
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
    </div>
  );
}

const INPUT = "w-full rounded-md border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-border-focus";
const ADD_BTN = "flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-colors";
