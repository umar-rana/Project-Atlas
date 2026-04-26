import type { Meta, StoryObj } from "@storybook/nextjs";
import { MentionPill } from "./mention-pill";

const meta: Meta<typeof MentionPill> = {
  title: "Composed/MentionPill",
  component: MentionPill,
};
export default meta;
type Story = StoryObj<typeof MentionPill>;

export const Inline: Story = {
  render: () => (
    <p className="font-ui text-sm text-text-primary">
      <MentionPill handle="alex" /> shipped the redesign with help from{" "}
      <MentionPill handle="me" isSelf /> and queued review for <MentionPill handle="ops" />.
    </p>
  ),
};
