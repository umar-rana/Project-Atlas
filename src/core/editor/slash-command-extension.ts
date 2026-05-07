"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export type SlashCommandState = {
  active: boolean;
  query: string;
  from: number;
};

export const SLASH_COMMAND_PLUGIN_KEY = new PluginKey<SlashCommandState>("slashCommand");

export const SlashCommandExtension = Extension.create({
  name: "slashCommandExtension",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: SLASH_COMMAND_PLUGIN_KEY,

        state: {
          init(): SlashCommandState {
            return { active: false, query: "", from: 0 };
          },
          apply(tr, prev): SlashCommandState {
            const meta = tr.getMeta(SLASH_COMMAND_PLUGIN_KEY);
            if (meta !== undefined) return meta as SlashCommandState;
            return prev;
          },
        },

        props: {
          handleKeyDown(view, event) {
            const state = SLASH_COMMAND_PLUGIN_KEY.getState(view.state);
            if (state?.active && event.key === "Escape") {
              view.dispatch(
                view.state.tr.setMeta(SLASH_COMMAND_PLUGIN_KEY, {
                  active: false,
                  query: "",
                  from: 0,
                }),
              );
              return true;
            }
            if (state?.active && event.key === "Backspace") {
              if (state.query === "") {
                view.dispatch(
                  view.state.tr.setMeta(SLASH_COMMAND_PLUGIN_KEY, {
                    active: false,
                    query: "",
                    from: 0,
                  }),
                );
              } else {
                view.dispatch(
                  view.state.tr.setMeta(SLASH_COMMAND_PLUGIN_KEY, {
                    ...state,
                    query: state.query.slice(0, -1),
                  }),
                );
              }
            }
            return false;
          },

          handleTextInput(view, from, _to, text) {
            const { state } = view;
            const slashState = SLASH_COMMAND_PLUGIN_KEY.getState(state);

            if (slashState?.active) {
              view.dispatch(
                state.tr.setMeta(SLASH_COMMAND_PLUGIN_KEY, {
                  ...slashState,
                  query: slashState.query + text,
                }),
              );
              return false;
            }

            if (text === "/") {
              const $pos = state.selection.$from;
              const isAtStart =
                $pos.parentOffset === 0 ||
                state.doc.textBetween($pos.start(), from, "").trim() === "";

              if (isAtStart) {
                view.dispatch(
                  state.tr.setMeta(SLASH_COMMAND_PLUGIN_KEY, {
                    active: true,
                    query: "",
                    from,
                  }),
                );
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});
