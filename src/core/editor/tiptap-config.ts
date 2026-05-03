import StarterKit from "@tiptap/starter-kit";
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
import { DragHandle } from "@tiptap/extension-drag-handle";
import { createLowlight } from "lowlight";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import sql from "highlight.js/lib/languages/sql";

const lowlight = createLowlight();
lowlight.register("javascript", javascript);
lowlight.register("typescript", typescript);
lowlight.register("python", python);
lowlight.register("bash", bash);
lowlight.register("css", css);
lowlight.register("json", json);
lowlight.register("sql", sql);

export { lowlight };

export function buildExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      codeBlock: false,
      strike: false,
      blockquote: false,
      horizontalRule: false,
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: "editor-link",
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
    CodeBlockLowlight.configure({
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
    DragHandle,
    Placeholder.configure({
      placeholder: placeholder ?? "Start writing…",
    }),
  ];
}
