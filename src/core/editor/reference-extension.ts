"use client";

import { Node, mergeAttributes, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export type ReferencePickerType = "note" | "tag" | "context" | "person";

export type ReferencePickerState = {
  active: boolean;
  trigger: ReferencePickerType;
  query: string;
  from: number;
  to: number;
};

export const REFERENCE_PICKER_PLUGIN_KEY = new PluginKey<ReferencePickerState>("referencePicker");

export const ReferenceNode = Node.create({
  name: "reference",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      target_type: { default: "note" },
      target_id: { default: "" },
      display_text: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-reference]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-reference": true,
        "data-target-type": HTMLAttributes.target_type,
        "data-target-id": HTMLAttributes.target_id,
        "data-display-text": HTMLAttributes.display_text,
        class: `reference-node reference-node--${HTMLAttributes.target_type ?? "note"}`,
      }),
      HTMLAttributes.display_text ?? "",
    ];
  },
});

const TRIGGER_MAP: Record<string, ReferencePickerType> = {
  "[[": "note",
  "#": "tag",
  "@": "context",
};

// Two-character triggers checked separately (must come before single-char triggers)
const DOUBLE_TRIGGER_MAP: Record<string, ReferencePickerType> = {
  "@@": "person",
};

export const ReferencePickerExtension = Extension.create({
  name: "referencePickerExtension",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: REFERENCE_PICKER_PLUGIN_KEY,

        state: {
          init(): ReferencePickerState {
            return { active: false, trigger: "note", query: "", from: 0, to: 0 };
          },
          apply(tr, prev): ReferencePickerState {
            const meta = tr.getMeta(REFERENCE_PICKER_PLUGIN_KEY);
            if (meta) return meta as ReferencePickerState;
            if (tr.docChanged && prev.active) {
              return { ...prev, to: prev.to + tr.mapping.map(prev.to) - prev.to };
            }
            return prev;
          },
        },

        props: {
          handleKeyDown(view, event) {
            const pickerState = REFERENCE_PICKER_PLUGIN_KEY.getState(view.state);
            if (!pickerState?.active) return false;

            if (event.key === "Escape") {
              view.dispatch(
                view.state.tr.setMeta(REFERENCE_PICKER_PLUGIN_KEY, {
                  active: false,
                  trigger: "note",
                  query: "",
                  from: 0,
                  to: 0,
                }),
              );
              return true;
            }

            if (event.key === "Backspace") {
              if (pickerState.query === "") {
                view.dispatch(
                  view.state.tr.setMeta(REFERENCE_PICKER_PLUGIN_KEY, {
                    active: false,
                    trigger: "note",
                    query: "",
                    from: 0,
                    to: 0,
                  }),
                );
              } else {
                const newQuery = pickerState.query.slice(0, -1);
                view.dispatch(
                  view.state.tr.setMeta(REFERENCE_PICKER_PLUGIN_KEY, {
                    ...pickerState,
                    query: newQuery,
                    to: pickerState.to - 1,
                  }),
                );
              }
              return false;
            }

            return false;
          },

          handleTextInput(view, from, _to, text) {
            const { state } = view;
            const pickerState = REFERENCE_PICKER_PLUGIN_KEY.getState(state);

            if (pickerState?.active) {
              // Special case: user typed `@` while context picker is open with empty query
              // → upgrade to person (@@) picker and swallow the extra @
              if (text === "@" && pickerState.trigger === "context" && pickerState.query === "") {
                view.dispatch(
                  state.tr.setMeta(REFERENCE_PICKER_PLUGIN_KEY, {
                    active: true,
                    trigger: "person" as ReferencePickerType,
                    query: "",
                    from: pickerState.from,
                    to: pickerState.to + 1,
                  }),
                );
                return false;
              }

              const newQuery = pickerState.query + text;
              view.dispatch(
                state.tr.setMeta(REFERENCE_PICKER_PLUGIN_KEY, {
                  ...pickerState,
                  query: newQuery,
                  to: from + 1,
                }),
              );
              return false;
            }

            const textBefore = state.doc.textBetween(Math.max(0, from - 2), from, "") + text;

            // Check two-character triggers first (e.g. @@)
            for (const [triggerStr, triggerType] of Object.entries(DOUBLE_TRIGGER_MAP)) {
              if (textBefore.endsWith(triggerStr)) {
                const charBeforeTrigger =
                  from > 1 ? state.doc.textBetween(from - 2, from - 1, "") : "";
                if (charBeforeTrigger === "" || /\s/.test(charBeforeTrigger)) {
                  view.dispatch(
                    state.tr.setMeta(REFERENCE_PICKER_PLUGIN_KEY, {
                      active: true,
                      trigger: triggerType,
                      query: "",
                      from: from - 1,
                      to: from + 1,
                    }),
                  );
                  return false;
                }
              }
            }

            for (const [triggerStr, triggerType] of Object.entries(TRIGGER_MAP)) {
              if (triggerStr === "[[") {
                if (textBefore.endsWith("[[")) {
                  const triggerStart = from - 1;
                  view.dispatch(
                    state.tr.setMeta(REFERENCE_PICKER_PLUGIN_KEY, {
                      active: true,
                      trigger: triggerType,
                      query: "",
                      from: triggerStart,
                      to: from + 1,
                    }),
                  );
                  return false;
                }
              } else if (text === triggerStr) {
                const charBefore = from > 0 ? state.doc.textBetween(from - 1, from, "") : "";
                // Don't trigger @ if the prev char is also @ (@@  is handled above)
                if (triggerStr === "@" && charBefore === "@") continue;
                if (charBefore === "" || /\s/.test(charBefore)) {
                  view.dispatch(
                    state.tr.setMeta(REFERENCE_PICKER_PLUGIN_KEY, {
                      active: true,
                      trigger: triggerType,
                      query: "",
                      from,
                      to: from + 1,
                    }),
                  );
                  return false;
                }
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});
