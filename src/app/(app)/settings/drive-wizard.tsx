"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useLocale } from "@/core/locale/hooks";
import { formatDate as localeFormatDate } from "@/core/locale/formatters";

type Step =
  | "loading"
  | "authorize"
  | "choose-type"
  | "shared-drive"
  | "browse-folder"
  | "confirm"
  | "linking"
  | "success";

interface FolderItem {
  id: string;
  name: string;
  mimeType: string;
}

export function DriveWizard({ onClose }: { onClose: () => void }) {
  const locale = useLocale();
  const [step, setStep] = useState<Step>("loading");
  const [driveType, setDriveType] = useState<"personal" | "shared">("personal");
  const [selectedSharedDrive, setSelectedSharedDrive] = useState<{ id: string; name: string } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const { data: linkStatus, isLoading: statusLoading } = trpc.drive.linkStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (statusLoading) return;
    if (linkStatus?.hasToken) {
      setStep("choose-type");
    } else {
      setStep("authorize");
    }
  }, [statusLoading, linkStatus?.hasToken]);

  const isAlreadyLinked = !statusLoading && !!linkStatus?.linked;

  const { data: sharedDrives } = trpc.drive.listSharedDrives.useQuery(undefined, {
    enabled: step === "shared-drive",
  });

  const folderId =
    driveType === "personal" ? "root" : (selectedSharedDrive?.id ?? "root");

  const { data: folderContents } = trpc.drive.browseFolder.useQuery(
    { folderId, driveId: selectedSharedDrive?.id },
    { enabled: step === "browse-folder" },
  );

  const utils = trpc.useUtils();

  const createFolderMutation = trpc.drive.createFolder.useMutation({
    onSuccess: (folder) => {
      if (folder.id) {
        setSelectedFolder({ id: folder.id, name: folder.name });
      }
      setNewFolderName("");
      setCreatingFolder(false);
      utils.drive.browseFolder.invalidate();
    },
    onError: () => {
      setCreatingFolder(false);
    },
  });

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const parentId = driveType === "personal" ? "root" : (selectedSharedDrive?.id ?? "root");
    setCreatingFolder(true);
    createFolderMutation.mutate({ parentId, name, driveId: selectedSharedDrive?.id });
  }

  const completeLinkMutation = trpc.drive.completeLinkFlow.useMutation({
    onSuccess: () => {
      utils.drive.linkStatus.invalidate();
      setStep("success");
    },
    onError: (err) => {
      setError(err.message);
      setStep("confirm");
    },
  });

  const folders: FolderItem[] = (folderContents ?? [])
    .filter((f) => f.mimeType === "application/vnd.google-apps.folder")
    .map((f) => ({ id: f.id ?? "", name: f.name ?? "Unnamed", mimeType: f.mimeType ?? "" }))
    .filter((f) => f.id);

  function handleLink() {
    if (!selectedFolder) return;
    setStep("linking");
    completeLinkMutation.mutate({
      driveType,
      rootFolderId: selectedFolder.id,
      rootFolderName: selectedFolder.name,
      sharedDriveId: selectedSharedDrive?.id,
    });
  }

  const rootOption = {
    id: driveType === "personal" ? "root" : (selectedSharedDrive?.id ?? "root"),
    name:
      driveType === "personal"
        ? "My Drive (root)"
        : (selectedSharedDrive?.name ?? "Drive root"),
  };

  return (
    <div className="rounded-xl border border-border-default bg-surface-overlay p-6 shadow-3">
      {/* Currently linked banner */}
      {isAlreadyLinked && step !== "loading" && step !== "success" && step !== "linking" && (
        <div className="mb-5 rounded-lg border border-border-default bg-surface-base px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Currently connected</p>
          <p className="mt-1 text-sm font-medium text-text-primary">
            {linkStatus?.config?.root_folder_name ?? "Drive folder"}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-tertiary">
            <span className="capitalize">{linkStatus?.config?.drive_type ?? "personal"} drive</span>
            {linkStatus?.config?.verified_at ? (
              <span>
                Last verified{" "}
                {localeFormatDate(linkStatus.config.verified_at, locale)}
              </span>
            ) : linkStatus?.config?.verified ? (
              <span className="text-accent-success">Verified</span>
            ) : (
              <span className="text-accent-warning">Not yet verified</span>
            )}
          </div>
        </div>
      )}

      {/* Loading */}
      {step === "loading" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-atlas-spin rounded-full border-4 border-accent-primary border-t-transparent" />
          <p className="text-sm text-text-secondary">Checking Drive status…</p>
        </div>
      )}

      {/* Step 0: Authorize */}
      {step === "authorize" && (
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-text-primary">
            Connect Google Drive
          </h3>
          <p className="text-sm text-text-secondary">
            Atlas needs permission to access your Google Drive to store and organize files.
            You&apos;ll be redirected to Google to authorize access, then return here to choose a folder.
          </p>
          <div className="rounded-lg border border-border-default bg-surface-base p-4">
            <ul className="space-y-1.5 text-xs text-text-secondary">
              {[
                "Read and write files Atlas creates",
                "Browse folder structure",
                "Refresh access automatically",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-between">
            <button
              onClick={onClose}
              className="rounded-md border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <a
              href="/api/drive/connect"
              className="inline-flex items-center rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover"
            >
              Authorize with Google
            </a>
          </div>
        </div>
      )}

      {/* Step 1: Choose type */}
      {step === "choose-type" && (
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-text-primary">
            Where should Atlas store files?
          </h3>
          <div className="flex gap-3">
            {(
              [
                { value: "personal" as const, label: "My Drive", desc: "Personal Google Drive" },
                { value: "shared" as const, label: "Shared Drive", desc: "Team shared Drive" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                onClick={() => setDriveType(option.value)}
                className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
                  driveType === option.value
                    ? "border-accent-primary bg-accent-primary-subtle"
                    : "border-border-default hover:bg-surface-hover"
                }`}
              >
                <p className="text-sm font-medium text-text-primary">{option.label}</p>
                <p className="mt-1 text-xs text-text-secondary">{option.desc}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (driveType === "shared") {
                  setStep("shared-drive");
                } else {
                  setStep("browse-folder");
                }
              }}
              className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Shared drive */}
      {step === "shared-drive" && (
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-text-primary">
            Select a shared drive
          </h3>
          {!sharedDrives ? (
            <div className="flex items-center gap-2 py-4 text-sm text-text-secondary">
              <div className="h-4 w-4 animate-atlas-spin rounded-full border-2 border-accent-primary border-t-transparent" />
              Loading…
            </div>
          ) : sharedDrives.length === 0 ? (
            <p className="text-sm text-text-secondary">No shared drives found.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sharedDrives.map((drive) => (
                <button
                  key={drive.id}
                  onClick={() =>
                    setSelectedSharedDrive({ id: drive.id ?? "", name: drive.name ?? "Unnamed" })
                  }
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selectedSharedDrive?.id === drive.id
                      ? "border-accent-primary bg-accent-primary-subtle"
                      : "border-border-default hover:bg-surface-hover"
                  }`}
                >
                  <p className="text-sm font-medium text-text-primary">{drive.name}</p>
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-between">
            <button
              onClick={() => setStep("choose-type")}
              className="rounded-md border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover"
            >
              Back
            </button>
            <button
              onClick={() => setStep("browse-folder")}
              disabled={!selectedSharedDrive}
              className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Browse folder */}
      {step === "browse-folder" && (
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-text-primary">
            Choose a parent folder
          </h3>
          <p className="text-xs text-text-tertiary">
            Atlas will create an <strong>Atlas</strong> folder here containing:
            database-backups, notes, project-briefs, meeting-notes, research,
            strategy-docs, general, journal, attachments.
          </p>

          {!folderContents ? (
            <div className="flex items-center gap-2 py-4 text-sm text-text-secondary">
              <div className="h-4 w-4 animate-atlas-spin rounded-full border-2 border-accent-primary border-t-transparent" />
              Loading…
            </div>
          ) : (
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              <button
                onClick={() => setSelectedFolder(rootOption)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedFolder?.id === rootOption.id
                    ? "border-accent-primary bg-accent-primary-subtle"
                    : "border-border-default hover:bg-surface-hover"
                }`}
              >
                <span className="font-medium text-text-primary">{rootOption.name}</span>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolder({ id: folder.id, name: folder.name })}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    selectedFolder?.id === folder.id
                      ? "border-accent-primary bg-accent-primary-subtle"
                      : "border-border-default hover:bg-surface-hover"
                  }`}
                >
                  <span className="text-text-primary">{folder.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={newFolderInputRef}
              type="text"
              placeholder="New folder name…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); }}
              className="min-w-0 flex-1 rounded-md border border-border-default bg-surface-base px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || creatingFolder}
              className="rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              {creatingFolder ? "Creating…" : "Create"}
            </button>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() =>
                setStep(driveType === "shared" ? "shared-drive" : "choose-type")
              }
              className="rounded-md border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover"
            >
              Back
            </button>
            <button
              onClick={() => setStep("confirm")}
              disabled={!selectedFolder}
              className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === "confirm" && (
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-text-primary">
            Confirm Drive link
          </h3>
          <div className="rounded-lg border border-border-default bg-surface-base p-4">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Drive type</span>
                <span className="font-medium capitalize text-text-primary">{driveType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Parent folder</span>
                <span className="font-medium text-text-primary">{selectedFolder?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Atlas folder</span>
                <span className="font-medium text-text-primary">
                  {selectedFolder?.name} / Atlas
                </span>
              </div>
            </div>
          </div>
          {error && (
            <p className="rounded-md bg-accent-danger-muted px-3 py-2 text-sm text-accent-danger">
              {error}
            </p>
          )}
          <div className="flex justify-between">
            <button
              onClick={() => setStep("browse-folder")}
              className="rounded-md border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover"
            >
              Back
            </button>
            <button
              onClick={handleLink}
              className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover"
            >
              Link Drive
            </button>
          </div>
        </div>
      )}

      {/* Linking */}
      {step === "linking" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-10 w-10 animate-atlas-spin rounded-full border-4 border-accent-primary border-t-transparent" />
          <p className="text-sm text-text-secondary">
            Creating Atlas folder structure in Drive…
          </p>
        </div>
      )}

      {/* Success */}
      {step === "success" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-success-muted">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M6 14L11 19L22 8"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-accent-success"
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-text-primary">
              Drive linked successfully
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Atlas folder structure created in {selectedFolder?.name}.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md bg-accent-primary px-6 py-2.5 text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
