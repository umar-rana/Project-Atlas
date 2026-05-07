import type { Meta, StoryObj } from "@storybook/nextjs";
import { StatusPill } from "./status-pill";

const meta: Meta<typeof StatusPill> = { title: "Primitives/StatusPill", component: StatusPill };
export default meta;
type Story = StoryObj<typeof StatusPill>;

export const All: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(
        ["active", "pending", "on-hold", "blocked", "complete", "cancelled", "archived"] as const
      ).map((s) => (
        <StatusPill key={s} status={s} />
      ))}
    </div>
  ),
};
