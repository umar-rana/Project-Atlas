import type { Meta, StoryObj } from "@storybook/nextjs";
import { Tag } from "./tag";

const meta: Meta<typeof Tag> = { title: "Primitives/Tag", component: Tag };
export default meta;
type Story = StoryObj<typeof Tag>;

export const Families: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Tag family="format">Markdown</Tag>
      <Tag family="purpose">Reference</Tag>
      <Tag family="freeform">Idea</Tag>
    </div>
  ),
};

export const Hues: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
        <Tag key={h} family="purpose" hue={h as 1}>
          hue {h}
        </Tag>
      ))}
    </div>
  ),
};

export const Removable: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Tag family="freeform" removable onRemove={() => {}}>
        urgent
      </Tag>
      <Tag family="purpose" removable hue={2} onRemove={() => {}}>
        marketing
      </Tag>
    </div>
  ),
};
