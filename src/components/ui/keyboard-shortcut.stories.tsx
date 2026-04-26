import type { Meta, StoryObj } from "@storybook/nextjs";
import { KeyboardShortcut } from "./keyboard-shortcut";

const meta: Meta<typeof KeyboardShortcut> = {
  title: "Primitives/KeyboardShortcut",
  component: KeyboardShortcut,
};
export default meta;
type Story = StoryObj<typeof KeyboardShortcut>;

export const SingleKey: Story = { args: { keys: ["enter"] } };
export const Combo: Story = { args: { keys: ["cmd", "K"] } };
export const Sequence: Story = { args: { sequence: [["g"], ["i"]] } };
export const Subtle: Story = { args: { keys: ["cmd", "shift", "P"], variant: "subtle" } };
