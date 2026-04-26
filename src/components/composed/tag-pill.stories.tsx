import type { Meta, StoryObj } from "@storybook/nextjs";
import { TagPill } from "./tag-pill";

const meta: Meta<typeof TagPill> = { title: "Composed/TagPill", component: TagPill };
export default meta;
type Story = StoryObj<typeof TagPill>;

export const Inline: Story = {
  render: () => (
    <p className="font-ui text-sm text-text-primary">
      Filed under <TagPill tag="research" /> and <TagPill tag="q4-launch" />.
    </p>
  ),
};
