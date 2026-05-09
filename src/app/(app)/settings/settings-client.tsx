"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { User } from "@prisma/client";
import {
  User as UserIcon,
  Palette,
  Inbox,
  Link2,
  Cpu,
  HardDrive,
  Database,
  LogOut,
  CheckSquare,
  Package,
  Sliders,
  Settings2,
  LayoutTemplate,
  Info,
} from "lucide-react";
import { TwoPaneLayout } from "@/components/layout/two-pane-layout";
import { cn } from "@/lib/utils";

type Section =
  | "profile"
  | "appearance"
  | "preferences"
  | "capture"
  | "tasks"
  | "templates"
  | "gtd"
  | "integrations"
  | "ai"
  | "backups"
  | "storage"
  | "data"
  | "account"
  | "system";

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "preferences", label: "Preferences", icon: Sliders },
  { id: "capture", label: "Capture", icon: Inbox },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "gtd", label: "GTD", icon: Info },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "ai", label: "AI", icon: Cpu },
  { id: "backups", label: "Backups", icon: HardDrive },
  { id: "storage", label: "Storage", icon: Package },
  { id: "data", label: "Data", icon: Database },
  { id: "account", label: "Account", icon: LogOut },
  { id: "system", label: "System", icon: Settings2 },
];

const VALID_SECTIONS = new Set<Section>([
  "profile",
  "appearance",
  "preferences",
  "capture",
  "tasks",
  "templates",
  "gtd",
  "integrations",
  "ai",
  "backups",
  "storage",
  "data",
  "account",
  "system",
]);

function resolveSection(raw: string | undefined, fallback: Section): Section {
  if (raw && VALID_SECTIONS.has(raw as Section)) return raw as Section;
  return fallback;
}

const sectionLoading = () => (
  <div className="flex h-32 items-center justify-center">
    <span className="font-ui text-sm text-text-tertiary">Loading…</span>
  </div>
);

const ProfileSection = dynamic(
  () => import("./sections/profile").then((m) => m.ProfileSection),
  { ssr: false, loading: sectionLoading },
);
const AppearanceSection = dynamic(
  () => import("./sections/appearance").then((m) => m.AppearanceSection),
  { ssr: false, loading: sectionLoading },
);
const PreferencesSection = dynamic(
  () => import("./sections/preferences").then((m) => m.PreferencesSection),
  { ssr: false, loading: sectionLoading },
);
const CaptureSection = dynamic(
  () => import("./sections/capture").then((m) => m.CaptureSection),
  { ssr: false, loading: sectionLoading },
);
const TasksSection = dynamic(
  () => import("./sections/tasks").then((m) => m.TasksSection),
  { ssr: false, loading: sectionLoading },
);
const TemplatesSection = dynamic(
  () => import("./sections/templates").then((m) => m.TemplatesSection),
  { ssr: false, loading: sectionLoading },
);
const GtdSection = dynamic(
  () => import("./sections/gtd").then((m) => m.GtdSection),
  { ssr: false, loading: sectionLoading },
);
const IntegrationsSection = dynamic(
  () => import("./sections/integrations").then((m) => m.IntegrationsSection),
  { ssr: false, loading: sectionLoading },
);
const AISection = dynamic(
  () => import("./sections/ai").then((m) => m.AISection),
  { ssr: false, loading: sectionLoading },
);
const BackupsSection = dynamic(
  () => import("./sections/backups").then((m) => m.BackupsSection),
  { ssr: false, loading: sectionLoading },
);
const StorageSection = dynamic(
  () => import("./sections/storage").then((m) => m.StorageSection),
  { ssr: false, loading: sectionLoading },
);
const DataSection = dynamic(
  () => import("./sections/data").then((m) => m.DataSection),
  { ssr: false, loading: sectionLoading },
);
const AccountSection = dynamic(
  () => import("./sections/account").then((m) => m.AccountSection),
  { ssr: false, loading: sectionLoading },
);
const SystemSection = dynamic(
  () => import("./sections/system").then((m) => m.SystemSection),
  { ssr: false, loading: sectionLoading },
);

interface SettingsClientProps {
  user: User;
  initialSection?: string;
  autoOpenWizard?: boolean;
  driveLinked?: boolean;
  driveError?: string;
  calLinked?: boolean;
  calError?: string;
}

export function SettingsClient({
  user,
  initialSection,
  autoOpenWizard,
  driveLinked,
  driveError,
  calLinked,
  calError,
}: SettingsClientProps) {
  const router = useRouter();
  const defaultSection = resolveSection(
    initialSection,
    autoOpenWizard ? "integrations" : "profile",
  );
  const [section, setSection] = useState<Section>(defaultSection);

  const navigate = useCallback(
    (id: Section) => {
      setSection(id);
      router.replace(`/settings?section=${id}`, { scroll: false });
    },
    [router],
  );

  const nav = (
    <nav aria-label="Settings sections" className="flex flex-col gap-0.5 p-2">
      {SECTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => navigate(id)}
          aria-current={section === id ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-3 py-2 font-ui text-sm transition-colors",
            section === id
              ? "bg-accent-primary-subtle font-medium text-accent-primary"
              : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <Icon size={15} aria-hidden />
          {label}
        </button>
      ))}
    </nav>
  );

  const content = (
    <div className="h-full overflow-y-auto p-6">
      {section === "profile" && <ProfileSection initialUser={user} />}
      {section === "appearance" && <AppearanceSection />}
      {section === "preferences" && <PreferencesSection initialUser={user} />}
      {section === "capture" && <CaptureSection userId={user.id} userEmail={user.email} />}
      {section === "tasks" && <TasksSection />}
      {section === "templates" && <TemplatesSection />}
      {section === "gtd" && <GtdSection />}
      {section === "integrations" && (
        <IntegrationsSection
          autoOpenWizard={autoOpenWizard}
          driveLinked={driveLinked}
          driveError={driveError}
          calLinked={calLinked}
          calError={calError}
        />
      )}
      {section === "ai" && <AISection userData={user} />}
      {section === "backups" && <BackupsSection />}
      {section === "storage" && <StorageSection />}
      {section === "data" && <DataSection />}
      {section === "account" && <AccountSection />}
      {section === "system" && <SystemSection userEmail={user.email} />}
    </div>
  );

  return (
    <TwoPaneLayout list={nav} detail={content} listWidth={220} collapseListBelowTablet={false} />
  );
}
