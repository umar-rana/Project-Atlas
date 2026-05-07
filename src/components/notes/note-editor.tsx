"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import { buildExtensions } from "@/core/editor/tiptap-config";
import {
  ReferenceNode,
  ReferencePickerExtension,
  REFERENCE_PICKER_PLUGIN_KEY,
  type ReferencePickerType,
} from "@/core/editor/reference-extension";
import {
  SlashCommandExtension,
  SLASH_COMMAND_PLUGIN_KEY,
} from "@/core/editor/slash-command-extension";
import { ReferencePicker, type ReferenceItem } from "./reference-picker";
import { SlashCommandMenu } from "./slash-command-menu";
import { EditorBubbleMenu } from "./editor-bubble-menu";
import { EditorBlockHandle } from "./editor-block-handle";
import { tiptapToMarkdown } from "@/core/editor/markdown-export";
import { extractPlainText } from "@/core/editor/text-extraction";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { ReferenceTooltipLayer } from "./reference-tooltip";
import { colorDotClass } from "@/components/tasks/folder-tree-node";
import { Hint } from "@/components/ui/hint";
import { Plus } from "lucide-react";

type SaveStatus = "saved" | "saving" | "error" | "idle";

type Props = {
  noteId: string;
  initialJson?: string;
  initialMarkdown?: string;
  initialTitle?: string;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
};

function markdownToTiptapFallback(markdown: string): object {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      type: "paragraph",
      content: [{ type: "text", text: block }],
    }));
  return {
    type: "doc",
    content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }],
  };
}

type PickerPosition = { top: number; left: number };

function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        fnRef.current(...args);
      }, delay);
    },
    [delay],
  ) as T;
}

function getCaretPosition(editor: Editor): PickerPosition {
  const { view } = editor;
  const { from } = view.state.selection;
  const coords = view.coordsAtPos(from);
  return {
    top: coords.bottom + 4,
    left: coords.left,
  };
}

async function uploadFileToNote(
  file: File,
  noteId: string,
): Promise<{ file_id: string } | null> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("parent_type", "Note");
  formData.append("parent_id", noteId);

  try {
    const res = await fetch("/api/attachments/upload", {
      method: "POST",
      body: formData,
    });
    const data = (await res.json()) as unknown;
    if (data && typeof data === "object" && "file_id" in data) {
      return data as { file_id: string };
    }
    return null;
  } catch {
    return null;
  }
}

export function NoteEditor({
  noteId,
  initialJson,
  initialMarkdown,
  initialTitle,
  placeholder,
  className,
  readOnly = false,
}: Props) {
  const router = useRouter();
  const updateMutation = trpc.notes.update.useMutation();
  const createNoteMutation = trpc.notes.create.useMutation();
  const addTagMutation = trpc.notes.addTag.useMutation();
  const removeTagMutation = trpc.notes.removeTag.useMutation();
  const utils = trpc.useUtils();

  const noteQuery = trpc.notes.get.useQuery({ id: noteId });
  const tagsQuery = trpc.tags.list.useQuery({ limit: 500 });

  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [title, setTitle] = useState(initialTitle ?? "");
  const [removingTagId, setRemovingTagId] = useState<string | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const tagPickerRef = useRef<HTMLDivElement | null>(null);

  const currentTags = noteQuery.data?.tag_on_notes ?? [];
  const currentTagIds = new Set(currentTags.map((t) => t.tag.id));
  const availableTags = (tagsQuery.data ?? []).filter((t) => !currentTagIds.has(t.id));

  useEffect(() => {
    if (!tagPickerOpen) return;
    function handleOutside(e: MouseEvent) {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setTagPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [tagPickerOpen]);

  const [referencePickerState, setReferencePickerState] = useState<{
    active: boolean;
    trigger: ReferencePickerType;
    query: string;
    from: number;
    to: number;
    position: PickerPosition;
  } | null>(null);

  const [slashMenuState, setSlashMenuState] = useState<{
    active: boolean;
    query: string;
    from: number;
    position: PickerPosition;
  } | null>(null);

  const saveNote = useCallback(
    async (editor: Editor, overrideTitle?: string) => {
      const json = JSON.stringify(editor.getJSON());
      const text = extractPlainText(editor.getJSON() as Parameters<typeof extractPlainText>[0]);
      const markdown = tiptapToMarkdown(editor.getJSON() as Parameters<typeof tiptapToMarkdown>[0]);
      const currentTitle = overrideTitle !== undefined ? overrideTitle : title;

      setSaveStatus("saving");
      try {
        await updateMutation.mutateAsync({
          id: noteId,
          title: currentTitle,
          body_json: json,
          body_text: text,
          body_markdown: markdown,
        });
        await utils.notes.get.invalidate({ id: noteId });
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    },
    [noteId, title, updateMutation, utils],
  );

  const debouncedSave = useDebouncedCallback(
    (editor: Editor, overrideTitle?: string) => {
      void saveNote(editor, overrideTitle);
    },
    1000,
  );

  const editor = useEditor({
    extensions: [
      ...buildExtensions(placeholder),
      ReferenceNode,
      ReferencePickerExtension,
      SlashCommandExtension,
    ],
    content: (() => {
      if (initialJson && initialJson !== "{}") {
        try {
          const parsed = JSON.parse(initialJson) as { type?: string; content?: unknown[] };
          const isValidDoc =
            parsed.type === "doc" &&
            Array.isArray(parsed.content) &&
            parsed.content.length > 0;
          if (isValidDoc) {
            return parsed;
          }
        } catch {
          // fall through to markdown fallback
        }
      }
      if (initialMarkdown && initialMarkdown.trim()) {
        return markdownToTiptapFallback(initialMarkdown);
      }
      return { type: "doc", content: [{ type: "paragraph" }] };
    })(),
    editable: !readOnly,

    onUpdate({ editor }) {
      setSaveStatus("idle");
      debouncedSave(editor);

      const pickerPluginState = REFERENCE_PICKER_PLUGIN_KEY.getState(editor.state);
      const slashPluginState = SLASH_COMMAND_PLUGIN_KEY.getState(editor.state);

      if (pickerPluginState?.active) {
        setReferencePickerState({
          ...pickerPluginState,
          position: getCaretPosition(editor),
        });
      } else {
        setReferencePickerState(null);
      }

      if (slashPluginState?.active) {
        setSlashMenuState({
          ...slashPluginState,
          position: getCaretPosition(editor),
        });
      } else {
        setSlashMenuState(null);
      }
    },

    onTransaction({ editor }) {
      const pickerPluginState = REFERENCE_PICKER_PLUGIN_KEY.getState(editor.state);
      const slashPluginState = SLASH_COMMAND_PLUGIN_KEY.getState(editor.state);

      if (pickerPluginState?.active) {
        setReferencePickerState((prev) => ({
          ...pickerPluginState,
          position: prev?.position ?? getCaretPosition(editor),
        }));
      } else {
        setReferencePickerState(null);
      }

      if (slashPluginState?.active) {
        setSlashMenuState((prev) => ({
          ...slashPluginState,
          position: prev?.position ?? getCaretPosition(editor),
        }));
      } else {
        setSlashMenuState(null);
      }
    },

    editorProps: {
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item?.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file) continue;
            event.preventDefault();

            uploadFileToNote(file, noteId)
              .then((data) => {
                if (data) {
                  const imgUrl = `/api/attachments/${data.file_id}`;
                  view.dispatch(
                    view.state.tr.replaceSelectionWith(
                      view.state.schema.nodes.image!.create({ src: imgUrl }),
                    ),
                  );
                } else {
                  setSaveStatus("error");
                }
              })
              .catch(() => {
                setSaveStatus("error");
              });

            return true;
          }
        }

        const text = event.clipboardData?.getData("text/plain") ?? "";
        const { selection } = view.state;
        if (!selection.empty && /^https?:\/\//.test(text.trim())) {
          const { from, to } = selection;
          const selectedText = view.state.doc.textBetween(from, to);
          if (selectedText) {
            event.preventDefault();
            view.dispatch(
              view.state.tr.addMark(
                from,
                to,
                view.state.schema.marks.link!.create({ href: text.trim() }),
              ),
            );
            return true;
          }
        }

        return false;
      },

      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
        const otherFiles = Array.from(files).filter((f) => !f.type.startsWith("image/"));

        if (imageFiles.length === 0 && otherFiles.length === 0) return false;

        event.preventDefault();

        const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY });

        const invalidateAfterUpload = () => {
          void utils.attachments.byParentId.invalidate({
            parent_type: "Note",
            parent_id: noteId,
          });
        };

        for (const file of imageFiles) {
          uploadFileToNote(file, noteId)
            .then((data) => {
              if (data) {
                const imgUrl = `/api/attachments/${data.file_id}`;
                const pos = dropPos?.pos ?? view.state.doc.content.size;
                view.dispatch(
                  view.state.tr.insert(
                    pos,
                    view.state.schema.nodes.image!.create({ src: imgUrl }),
                  ),
                );
                invalidateAfterUpload();
              } else {
                setSaveStatus("error");
              }
            })
            .catch(() => setSaveStatus("error"));
        }

        for (const file of otherFiles) {
          uploadFileToNote(file, noteId)
            .then((data) => {
              if (data) invalidateAfterUpload();
            })
            .catch(() => setSaveStatus("error"));
        }

        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void saveNote(editor);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, saveNote]);

  const handleReferenceSelect = useCallback(
    (item: ReferenceItem) => {
      if (!editor || !referencePickerState) return;

      const { from } = referencePickerState;
      const triggerLength =
        referencePickerState.trigger === "note"
          ? 2 + referencePickerState.query.length
          : 1 + referencePickerState.query.length;

      editor
        .chain()
        .focus()
        .deleteRange({ from, to: from + triggerLength })
        .insertContent({
          type: "reference",
          attrs: {
            target_type: item.target_type,
            target_id: item.id,
            display_text: item.display_text,
          },
        })
        .run();

      if (item.target_type === "tag") {
        addTagMutation.mutate(
          { note_id: noteId, tag_id: item.id },
          {
            onSuccess: () => {
              void utils.notes.get.invalidate({ id: noteId });
              void utils.notes.list.invalidate();
            },
          },
        );
      }

      setReferencePickerState(null);
    },
    [editor, referencePickerState, addTagMutation, noteId, utils],
  );

  const handleCreateNote = useCallback(
    async (titleText: string) => {
      if (!editor || !referencePickerState) return;

      try {
        const newNote = await createNoteMutation.mutateAsync({
          title: titleText || "Untitled",
        });
        await utils.notes.list.invalidate();

        const { from } = referencePickerState;
        const triggerLength = 2 + referencePickerState.query.length;

        editor
          .chain()
          .focus()
          .deleteRange({ from, to: from + triggerLength })
          .insertContent({
            type: "reference",
            attrs: {
              target_type: "note",
              target_id: newNote.id,
              display_text: newNote.title || "Untitled",
            },
          })
          .run();

        setReferencePickerState(null);
      } catch {
        setReferencePickerState(null);
      }
    },
    [editor, referencePickerState, createNoteMutation, utils],
  );

  const handleReferenceClose = useCallback(() => {
    setReferencePickerState(null);
    if (editor) {
      editor.view.dispatch(
        editor.view.state.tr.setMeta(REFERENCE_PICKER_PLUGIN_KEY, {
          active: false,
          trigger: "note",
          query: "",
          from: 0,
          to: 0,
        }),
      );
    }
  }, [editor]);

  const handleSlashClose = useCallback(() => {
    setSlashMenuState(null);
    if (editor) {
      editor.view.dispatch(
        editor.view.state.tr.setMeta(SLASH_COMMAND_PLUGIN_KEY, {
          active: false,
          query: "",
          from: 0,
        }),
      );
    }
  }, [editor]);

  const handleReferenceNodeClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const refNode = target.closest("[data-reference]") as HTMLElement | null;
      if (!refNode) return;

      const targetType = refNode.dataset["targetType"];
      const targetId = refNode.dataset["targetId"];
      if (!targetType || !targetId) return;

      if (targetType === "note") {
        router.push(`/notes/${targetId}`);
      } else if (targetType === "task") {
        router.push(`/tasks?selected=${targetId}`);
      } else if (targetType === "project") {
        router.push(`/projects/${targetId}`);
      } else if (targetType === "context") {
        router.push(`/tasks?context=${targetId}`);
      } else if (targetType === "tag") {
        router.push(`/notes?tag=${encodeURIComponent(targetId)}`);
      }
    },
    [router],
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      if (editor) {
        debouncedSave(editor, newTitle);
      }
    },
    [editor, debouncedSave],
  );

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle flex-shrink-0">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder="Note title…"
          className="flex-1 text-xl font-semibold bg-transparent border-none outline-none placeholder:text-text-disabled focus-visible:focus-ring"
          disabled={readOnly}
        />
        <div className="flex items-center gap-2 text-xs text-text-tertiary ml-4 flex-shrink-0">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1">
              <span className="animate-spin">⟳</span>
              saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-accent-success">✓ saved</span>
          )}
          {saveStatus === "error" && (
            <span className="text-accent-danger">⚠ error saving</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 px-4 py-1.5 border-b border-border-subtle flex-shrink-0">
        {currentTags.map(({ tag }) => (
          <Hint key={tag.id} label={`Remove "${tag.name}"`} side="top" delayDuration={600}>
            <button
              type="button"
              disabled={readOnly || removeTagMutation.isPending}
              onClick={() => {
                if (removingTagId === tag.id) {
                  removeTagMutation.mutate(
                    { note_id: noteId, tag_id: tag.id },
                    {
                      onSuccess: () => {
                        void utils.notes.get.invalidate({ id: noteId });
                        void utils.notes.list.invalidate();
                        setRemovingTagId(null);
                      },
                    },
                  );
                } else {
                  setRemovingTagId(tag.id);
                  setTimeout(() => setRemovingTagId(null), 3000);
                }
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-ui text-2xs font-medium transition-colors",
                removingTagId === tag.id
                  ? "bg-accent-danger-muted text-accent-danger"
                  : "bg-accent-primary-muted text-accent-primary hover:bg-accent-danger-muted hover:text-accent-danger",
              )}
            >
              <span
                className={cn("size-1.5 shrink-0 rounded-full", colorDotClass(tag.color))}
                aria-hidden
              />
              <span>#</span>
              <span>{tag.name}</span>
              {removingTagId === tag.id && <span className="ml-0.5">×</span>}
            </button>
          </Hint>
        ))}
        {!readOnly && (
          <div className="relative" ref={tagPickerRef}>
            <Hint label="Add tag" side="top">
              <button
                type="button"
                onClick={() => setTagPickerOpen((o) => !o)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-default px-2 py-0.5 font-ui text-2xs text-text-disabled hover:border-border-focus hover:text-accent-primary"
              >
                <Plus size={10} />
                Tag
              </button>
            </Hint>
            {tagPickerOpen && (
              <div className="absolute left-0 top-full z-overlay mt-1 w-48 rounded-md border border-border-default bg-surface-raised shadow-2">
                <div className="max-h-40 overflow-y-auto py-1">
                  {availableTags.length === 0 ? (
                    <p className="px-3 py-2 font-ui text-2xs text-text-disabled">
                      {(tagsQuery.data ?? []).length === 0 ? "No tags yet" : "All tags added"}
                    </p>
                  ) : (
                    availableTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          addTagMutation.mutate(
                            { note_id: noteId, tag_id: tag.id },
                            {
                              onSuccess: () => {
                                void utils.notes.get.invalidate({ id: noteId });
                                void utils.notes.list.invalidate();
                                setTagPickerOpen(false);
                              },
                            },
                          );
                        }}
                        disabled={addTagMutation.isPending}
                        className="flex w-full items-center gap-2 px-3 py-1.5 font-ui text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      >
                        <span className="text-text-tertiary">#</span>
                        {tag.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        ref={editorContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 relative"
        onClick={handleReferenceNodeClick}
      >
        {editor && !readOnly && <EditorBubbleMenu editor={editor} />}

        <EditorContent
          editor={editor}
          className="note-editor-content prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-full"
        />
      </div>

      {editor && !readOnly && (
        <EditorBlockHandle editor={editor} />
      )}

      {referencePickerState?.active && editor && (
        <ReferencePicker
          trigger={referencePickerState.trigger}
          query={referencePickerState.query}
          position={referencePickerState.position}
          onSelect={handleReferenceSelect}
          onCreateNote={
            referencePickerState.trigger === "note" ? handleCreateNote : undefined
          }
          onClose={handleReferenceClose}
        />
      )}

      {slashMenuState?.active && editor && (
        <SlashCommandMenu
          query={slashMenuState.query}
          position={slashMenuState.position}
          editor={editor}
          from={slashMenuState.from}
          onClose={handleSlashClose}
        />
      )}

      <ReferenceTooltipLayer containerRef={editorContainerRef} />
    </div>
  );
}
