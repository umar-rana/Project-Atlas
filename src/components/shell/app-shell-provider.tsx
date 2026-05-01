"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ModuleSwitcherWired } from "@/components/shell/module-switcher-wired";
import { TopBarWired } from "@/components/shell/top-bar-wired";
import { CommandPaletteWired } from "@/components/shell/command-palette-wired";
import { KeyboardShortcutsOverlay } from "@/components/shell/keyboard-shortcuts-overlay";
import { TasksCommands } from "@/components/tasks/tasks-commands";
import { CommandRegistryProvider } from "@/core/commands/registry";
import { ShortcutsRegistryProvider } from "@/core/shortcuts/registry";
import { useShellStore } from "@/lib/shell/store";
import { InspectorPanel } from "@/components/composed/inspector-panel";
import { toast } from "@/lib/toast";
import dynamic from "next/dynamic";

const CaptureModal = dynamic(
  () => import("@/components/shell/capture-modal").then((m) => m.CaptureModal),
  {
    ssr: false,
    loading: () => null,
  },
);

interface AppUser {
  name: string | null;
  email: string;
  image: string | null;
}

interface AppShellProviderProps {
  user: AppUser;
  isAdmin?: boolean;
  children: React.ReactNode;
}

function WelcomeEffectInner(): null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shown = React.useRef(false);

  React.useEffect(() => {
    if (shown.current) return;
    if (searchParams.get("welcome") === "1") {
      shown.current = true;
      toast.success("Welcome to Atlas!", { duration: 4000 });
      router.replace("/tasks", { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function WelcomeEffect(): React.ReactElement {
  return (
    <React.Suspense fallback={null}>
      <WelcomeEffectInner />
    </React.Suspense>
  );
}

function GlobalShortcuts(): null {
  const router = useRouter();
  const setShortcutsOverlayOpen = useShellStore((s) => s.setShortcutsOverlayOpen);
  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);
  const setInspectorOpen = useShellStore((s) => s.setInspectorOpen);
  const inspectorOpen = useShellStore((s) => s.inspectorOpen);

  React.useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === ",") {
        e.preventDefault();
        router.push("/settings");
        return;
      }

      if (meta && e.key === "/") {
        e.preventDefault();
        setShortcutsOverlayOpen(true);
        return;
      }

      if (!meta && !e.altKey && e.key === "?") {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        setShortcutsOverlayOpen(true);
        return;
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setCaptureModalOpen(true);
        return;
      }

      if (meta && e.key === "\\") {
        e.preventDefault();
        setInspectorOpen(!inspectorOpen);
        return;
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [router, setShortcutsOverlayOpen, setCaptureModalOpen, setInspectorOpen, inspectorOpen]);

  return null;
}

function InspectorSlot(): React.ReactElement | null {
  const hydrated = useShellStore((s) => s._shellHydrated);
  const inspectorOpen = useShellStore((s) => s.inspectorOpen);
  const inspectorPinned = useShellStore((s) => s.inspectorPinned);
  const setInspectorOpen = useShellStore((s) => s.setInspectorOpen);
  const setInspectorPinned = useShellStore((s) => s.setInspectorPinned);

  if (!hydrated || !inspectorOpen) return null;

  return (
    <div className="w-72 border-l border-border-subtle bg-surface-overlay max-tablet:hidden">
      <InspectorPanel
        title="Inspector"
        subtitle="Wave 2 — placeholder content"
        pinned={inspectorPinned}
        onTogglePin={() => setInspectorPinned(!inspectorPinned)}
        onClose={() => setInspectorOpen(false)}
        sections={[
          {
            id: "wave2-info",
            title: "About",
            defaultOpen: true,
            children: (
              <p className="font-ui text-xs text-text-secondary">
                The inspector panel will display contextual details for selected items in Wave 3+.
              </p>
            ),
          },
        ]}
      />
    </div>
  );
}

function ShellHydration(): null {
  React.useEffect(() => {
    useShellStore.persist.rehydrate();
  }, []);
  return null;
}

function LazyCapture(): React.ReactElement | null {
  const captureModalOpen = useShellStore((s) => s.captureModalOpen);
  const [everOpened, setEverOpened] = React.useState(false);

  React.useEffect(() => {
    if (captureModalOpen && !everOpened) {
      setEverOpened(true);
    }
  }, [captureModalOpen, everOpened]);

  if (!everOpened) return null;
  return <CaptureModal />;
}

function ShellInner({ user, isAdmin, children }: AppShellProviderProps): React.ReactElement {
  return (
    <>
      <ShellHydration />
      <WelcomeEffect />
      <GlobalShortcuts />
      <AppShell
        rail={<ModuleSwitcherWired />}
        topBar={<TopBarWired user={user} isAdmin={isAdmin} />}
      >
        <div className="flex h-full min-h-0 w-full">
          <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
          <InspectorSlot />
        </div>
      </AppShell>
      <CommandPaletteWired />
      <TasksCommands />
      <KeyboardShortcutsOverlay />
      <LazyCapture />
    </>
  );
}

export function AppShellProvider({ user, isAdmin, children }: AppShellProviderProps): React.ReactElement {
  return (
    <CommandRegistryProvider>
      <ShortcutsRegistryProvider>
        <ShellInner user={user} isAdmin={isAdmin}>{children}</ShellInner>
      </ShortcutsRegistryProvider>
    </CommandRegistryProvider>
  );
}
