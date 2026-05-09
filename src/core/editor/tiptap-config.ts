import StarterKit from "@tiptap/starter-kit";
import { EmbedNode } from "./embed-extension";
import Link from "@tiptap/extension-link";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Blockquote from "@tiptap/extension-blockquote";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { createLowlight } from "lowlight";

// `highlight.js` ships ~159KB across many language modules. Defer registration
// until a code block is actually rendered/inserted to keep it out of the
// initial editor bundle.
export const lowlight = createLowlight();

let languagesLoaded: Promise<void> | null = null;

export function ensureLowlightLanguages(): Promise<void> {
  if (languagesLoaded) return languagesLoaded;
  languagesLoaded = (async () => {
    const [javascript, typescript, python, bash, css, json, sql] = await Promise.all([
      import("highlight.js/lib/languages/javascript").then((m) => m.default),
      import("highlight.js/lib/languages/typescript").then((m) => m.default),
      import("highlight.js/lib/languages/python").then((m) => m.default),
      import("highlight.js/lib/languages/bash").then((m) => m.default),
      import("highlight.js/lib/languages/css").then((m) => m.default),
      import("highlight.js/lib/languages/json").then((m) => m.default),
      import("highlight.js/lib/languages/sql").then((m) => m.default),
    ]);
    lowlight.register("javascript", javascript);
    lowlight.register("typescript", typescript);
    lowlight.register("python", python);
    lowlight.register("bash", bash);
    lowlight.register("css", css);
    lowlight.register("json", json);
    lowlight.register("sql", sql);
  })();
  return languagesLoaded;
}

export function buildExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      codeBlock: false,
      strike: false,
      blockquote: false,
      horizontalRule: false,
      dropcursor: {
        color: "#6366f1",
        width: 2,
      },
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: "editor-link",
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
    CodeBlockLowlight.extend({
      onCreate() {
        // Kick off async language registration the first time an editor with
        // a code block is created. Existing code blocks will re-render once
        // languages register because lowlight's registry is shared.
        void ensureLowlightLanguages();
      },
    }).configure({
      lowlight,
      HTMLAttributes: { class: "code-block" },
    }),
    TaskList.configure({
      HTMLAttributes: { class: "task-list" },
    }),
    TaskItem.configure({
      nested: true,
      HTMLAttributes: { class: "task-item" },
    }),
    HorizontalRule.configure({
      HTMLAttributes: { class: "horizontal-rule" },
    }),
    Blockquote.configure({
      HTMLAttributes: { class: "blockquote" },
    }),
    Underline,
    Strike,
    Image.configure({
      HTMLAttributes: { class: "editor-image" },
    }),
    Highlight.configure({
      multicolor: true,
      HTMLAttributes: { class: "editor-highlight" },
    }),
    TextStyle,
    Color,
    Placeholder.configure({
      placeholder: placeholder ?? "Start writing…",
    }),
    EmbedNode,
  ];
}
