import type { Meta, StoryObj } from "@storybook/nextjs";
import { Star, Pin, Trash2 } from "lucide-react";
import { IconButton } from "./icon-button";

const meta: Meta<typeof IconButton> = {
  title: "Primitives/IconButton",
  component: IconButton,
  args: { "aria-label": "Star", children: <Star size={14} /> },
};
export default meta;
type Story = StoryObj<typeof IconButton>;

export const Variants: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <IconButton aria-label="Star"><Star size={14} /></IconButton>
      <IconButton aria-label="Pin" variant="solid"><Pin size={14} /></IconButton>
      <IconButton aria-label="Submit" variant="primary"><Star size={14} /></IconButton>
      <IconButton aria-label="Delete" variant="destructive"><Trash2 size={14} /></IconButton>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <IconButton aria-label="Star sm" size="sm"><Star size={12} /></IconButton>
      <IconButton aria-label="Star md" size="md"><Star size={14} /></IconButton>
      <IconButton aria-label="Star lg" size="lg"><Star size={16} /></IconButton>
    </div>
  ),
};

export const Active: Story = {
  args: { isActive: true, "aria-label": "Pinned", children: <Pin size={14} /> },
};
