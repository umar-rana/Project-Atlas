"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "./person-avatar";
import { deriveDisplayName } from "@/core/people/validation";

type Tag = { id: string; name: string; color?: string | null };

interface PersonData {
  id: string;
  handle: string;
  display_name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  nickname?: string | null;
  photo_url?: string | null;
  relationship_type?: string | null;
  emails: Array<{ email: string; type: string }>;
  phones: Array<{ number: string; type: string }>;
  organizations: Array<{ name: string; title?: string | null }>;
  addresses: Array<{
    city?: string | null;
    country_name?: string | null;
    country_code?: string | null;
  }>;
  tags: Array<{ tag: Tag }>;
}

interface Props {
  person: PersonData;
  view?: "card" | "list";
  className?: string;
}

export function PersonCard({ person, view = "card", className }: Props) {
  const displayName = deriveDisplayName({
    display_name: person.display_name,
    given_name: person.given_name,
    family_name: person.family_name,
    nickname: person.nickname,
    handle: person.handle,
  });

  const primaryOrg = person.organizations[0];
  const primaryAddress = person.addresses[0];
  const locationParts = [primaryAddress?.city, primaryAddress?.country_name].filter(Boolean);
  const location = locationParts.join(", ");

  const orgLine = [primaryOrg?.title, primaryOrg?.name].filter(Boolean).join(" @ ");

  if (view === "list") {
    return (
      <Link href={`/people/${person.id}`} className={cn("group block", className)}>
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 transition-colors last:border-0 hover:bg-surface-hover">
          <PersonAvatar displayName={displayName} photoUrl={person.photo_url} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-text-primary">{displayName}</span>
              {person.relationship_type && (
                <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-2xs capitalize text-text-tertiary">
                  {person.relationship_type.replace(/-/g, " ")}
                </span>
              )}
            </div>
            {orgLine && <div className="truncate text-xs text-text-tertiary">{orgLine}</div>}
          </div>
          <div className="sm:flex hidden shrink-0 flex-col items-end gap-0.5 text-right">
            {person.emails[0] && (
              <span className="max-w-[160px] truncate text-xs text-text-secondary">
                {person.emails[0].email}
              </span>
            )}
            {location && <span className="text-xs text-text-tertiary">{location}</span>}
          </div>
          {person.tags.length > 0 && (
            <div className="md:flex hidden max-w-[120px] shrink-0 flex-wrap justify-end gap-1">
              {person.tags.slice(0, 2).map(({ tag }) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center whitespace-nowrap rounded-xs border border-border-subtle bg-surface-raised px-1 font-ui text-2xs font-medium text-text-secondary"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/people/${person.id}`} className={cn("group block", className)}>
      <div className="flex h-full flex-col gap-2 rounded-lg border border-border-default bg-surface-raised p-4 transition-colors hover:border-border-strong hover:bg-surface-hover">
        <div className="flex items-start gap-3">
          <PersonAvatar displayName={displayName} photoUrl={person.photo_url} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text-primary">{displayName}</div>
            {orgLine && <div className="mt-0.5 truncate text-xs text-text-tertiary">{orgLine}</div>}
            {location && <div className="truncate text-xs text-text-tertiary">{location}</div>}
          </div>
        </div>
        {person.tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {person.tags.slice(0, 3).map(({ tag }) => (
              <span
                key={tag.id}
                className="inline-flex items-center whitespace-nowrap rounded-xs border border-border-subtle bg-surface-raised px-1 font-ui text-2xs font-medium text-text-secondary"
              >
                #{tag.name}
              </span>
            ))}
            {person.tags.length > 3 && (
              <span className="text-2xs text-text-disabled">+{person.tags.length - 3}</span>
            )}
          </div>
        )}
        {person.relationship_type && (
          <span className="self-start rounded border border-border-subtle px-1.5 py-0.5 text-2xs capitalize text-text-tertiary">
            {person.relationship_type.replace(/-/g, " ")}
          </span>
        )}
      </div>
    </Link>
  );
}
