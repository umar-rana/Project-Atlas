import type { Meta, StoryObj } from "@storybook/nextjs";
import { Avatar, AvatarStack } from "./avatar";

const meta: Meta<typeof Avatar> = { title: "Primitives/Avatar", component: Avatar };
export default meta;
type Story = StoryObj<typeof Avatar>;

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-3">
      {(["xs", "sm", "md", "lg", "xl"] as const).map((s) => (
        <Avatar key={s} size={s} initials="AT" />
      ))}
    </div>
  ),
};

export const WithStatus: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar size="lg" initials="JS" status="online" />
      <Avatar size="lg" initials="MR" status="busy" />
      <Avatar size="lg" initials="LN" status="away" />
      <Avatar size="lg" initials="ZK" status="offline" />
    </div>
  ),
};

export const Stack: Story = {
  render: () => (
    <AvatarStack size="md" total={9}>
      <Avatar initials="AT" />
      <Avatar initials="JS" />
      <Avatar initials="MR" />
      <Avatar initials="LN" />
    </AvatarStack>
  ),
};
