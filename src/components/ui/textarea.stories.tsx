import type { Meta, StoryObj } from "@storybook/nextjs";
import * as React from "react";
import { Textarea } from "./textarea";

const meta: Meta<typeof Textarea> = {
  title: "Primitives/Textarea",
  component: Textarea,
  args: { placeholder: "Write a note…" },
};
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {};

export const AutoGrow: Story = {
  render: () => {
    const [v, setV] = React.useState("Type to expand…\nAdd more lines and watch the height follow.");
    return <Textarea autoGrow value={v} onChange={(e) => setV(e.target.value)} />;
  },
};

export const States: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <Textarea placeholder="Default" />
      <Textarea placeholder="Disabled" disabled />
      <Textarea placeholder="Error" error defaultValue="too short" />
    </div>
  ),
};
