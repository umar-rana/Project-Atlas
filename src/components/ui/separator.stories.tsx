import type { Meta, StoryObj } from "@storybook/nextjs";
import { Separator } from "./separator";

const meta: Meta<typeof Separator> = { title: "Primitives/Separator", component: Separator };
export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-72">
      <Separator />
    </div>
  ),
};

export const Strong: Story = { render: () => <div className="w-72"><Separator strong /></div> };

export const Labeled: Story = {
  render: () => <div className="w-72"><Separator label="Section" /></div>,
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-8 items-center gap-3 text-xs text-text-secondary">
      <span>Left</span>
      <Separator orientation="vertical" />
      <span>Right</span>
    </div>
  ),
};
