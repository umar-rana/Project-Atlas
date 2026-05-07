import { z } from "zod";

// ─── Constants ────────────────────────────────────────────────────────────────

export const CURATED_RELATIONSHIP_TYPES = [
  "friend",
  "colleague",
  "family",
  "client",
  "advisor",
  "mentor",
  "acquaintance",
] as const;

export const EMAIL_TYPES = ["home", "work", "other"] as const;
export const PHONE_TYPES = ["mobile", "home", "work", "fax", "other"] as const;
export const ADDRESS_TYPES = ["home", "work", "other"] as const;
export const URL_TYPES = ["linkedin", "twitter", "github", "website", "other"] as const;
export const EVENT_TYPES = ["birthday", "anniversary", "other"] as const;
export const RELATION_TYPES = [
  "spouse",
  "partner",
  "parent",
  "child",
  "sibling",
  "friend",
  "colleague",
  "other",
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function deriveDisplayName(fields: {
  display_name?: string | null;
  honorific_prefix?: string | null;
  given_name?: string | null;
  middle_name?: string | null;
  family_name?: string | null;
  honorific_suffix?: string | null;
  nickname?: string | null;
  handle?: string;
}): string {
  if (fields.display_name?.trim()) return fields.display_name.trim();
  const parts = [
    fields.honorific_prefix,
    fields.given_name,
    fields.middle_name,
    fields.family_name,
    fields.honorific_suffix,
  ]
    .filter(Boolean)
    .map((s) => s!.trim());
  if (parts.length > 0) return parts.join(" ");
  if (fields.nickname?.trim()) return fields.nickname.trim();
  return fields.handle ?? "";
}

export function detectUrlType(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("linkedin.com")) return "linkedin";
    if (host.includes("twitter.com") || host.includes("x.com")) return "twitter";
    if (host.includes("github.com")) return "github";
  } catch {
    // ignore
  }
  return "other";
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

// ─── Person schemas ───────────────────────────────────────────────────────────

export const PersonCreateSchema = z.object({
  handle: z.string().min(1).max(100).optional(),
  display_name: z.string().max(500).optional(),
  honorific_prefix: z.string().max(50).optional(),
  given_name: z.string().max(200).optional(),
  middle_name: z.string().max(200).optional(),
  family_name: z.string().max(200).optional(),
  honorific_suffix: z.string().max(50).optional(),
  nickname: z.string().max(200).optional(),
  biography: z.string().max(10000).optional(),
  photo_url: z.string().url().max(2000).optional().or(z.literal("")),
  relationship_type: z.string().max(100).optional(),
  cadence_days: z.number().int().min(1).max(3650).optional(),
  next_follow_up_at: z.string().datetime().optional(),
  last_contacted_at: z.string().datetime().optional(),
  external_data: z.record(z.unknown()).optional(),
});

export const PersonUpdateSchema = PersonCreateSchema.partial();

// ─── Multi-value schemas ──────────────────────────────────────────────────────

export const PersonEmailSchema = z.object({
  email: z
    .string()
    .min(1)
    .max(500)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"),
  type: z.string().max(50).default("other"),
  is_primary: z.boolean().default(false),
  source: z.string().max(100).optional(),
  source_id: z.string().max(200).optional(),
});

export const PersonPhoneSchema = z.object({
  number: z.string().min(1).max(50),
  type: z.string().max(50).default("other"),
  is_primary: z.boolean().default(false),
  source: z.string().max(100).optional(),
  source_id: z.string().max(200).optional(),
});

export const PersonAddressSchema = z
  .object({
    type: z.string().max(50).default("other"),
    street: z.string().max(500).optional(),
    city: z.string().max(200).optional(),
    region: z.string().max(200).optional(),
    postal_code: z.string().max(20).optional(),
    country_code: z
      .string()
      .length(2)
      .regex(/^[A-Z]{2}$/, "Must be ISO 3166-1 alpha-2")
      .optional(),
    country_name: z.string().max(200).optional(),
    formatted: z.string().max(1000).optional(),
    is_primary: z.boolean().default(false),
    source: z.string().max(100).optional(),
    source_id: z.string().max(200).optional(),
  })
  .refine(
    (d) =>
      d.street || d.city || d.region || d.postal_code || d.country_code || d.formatted,
    { message: "At least one address component is required" },
  );

export const PersonOrganizationSchema = z
  .object({
    name: z.string().min(1).max(500),
    title: z.string().max(300).optional(),
    department: z.string().max(300).optional(),
    is_current: z.boolean().default(true),
    is_primary: z.boolean().default(false),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
    source: z.string().max(100).optional(),
    source_id: z.string().max(200).optional(),
  })
  .refine(
    (d) => {
      if (d.is_current) return true;
      if (d.start_date && d.end_date) {
        return new Date(d.start_date) <= new Date(d.end_date);
      }
      return true;
    },
    { message: "start_date must be before or equal to end_date" },
  )
  .refine((d) => !(d.is_current && d.end_date), {
    message: "end_date must be null when is_current is true",
  });

export const PersonUrlSchema = z.object({
  url: z.string().min(1).max(2000),
  type: z.string().max(50).default("other"),
  label: z.string().max(200).optional(),
  source: z.string().max(100).optional(),
  source_id: z.string().max(200).optional(),
});

export const PersonEventSchema = z.object({
  type: z.string().max(50).default("other"),
  date: z.string().datetime(),
  label: z.string().max(200).optional(),
  source: z.string().max(100).optional(),
  source_id: z.string().max(200).optional(),
});

export const PersonRelationSchema = z
  .object({
    related_person_id: z.string().uuid().optional(),
    related_text: z.string().max(300).optional(),
    type: z.string().max(50).default("other"),
    source: z.string().max(100).optional(),
    source_id: z.string().max(200).optional(),
  })
  .refine(
    (d) => d.related_person_id || d.related_text,
    { message: "Either related_person_id or related_text is required" },
  )
  .refine(
    (d) => !(d.related_person_id && d.related_text),
    { message: "Provide only one of related_person_id or related_text, not both" },
  );

export const PersonSkillSchema = z.object({
  name: z.string().min(1).max(200),
});

export const PersonInterestSchema = z.object({
  name: z.string().min(1).max(200),
});

// ─── Suggestion helpers ───────────────────────────────────────────────────────

export function isCustomType(type: string, curated: readonly string[]): boolean {
  return !curated.includes(type as (typeof curated)[number]);
}
