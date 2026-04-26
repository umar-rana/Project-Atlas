import type { Meta, StoryObj } from "@storybook/nextjs";
import { Plus } from "lucide-react";
import { PageHeader } from "./page-header";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";

const meta: Meta<typeof PageHeader> = { title: "Layout/PageHeader", component: PageHeader };
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const Default: Story = {
  args: {
    title: "Q4 Launch plan",
    description:
      "Coordinate the launch motion across product, marketing, and support. Owners locked by Friday.",
    meta: (
      <>
        <StatusPill status="active" />
        <span>·</span>
        <span>12 tasks</span>
        <span>·</span>
        <span>Updated 2 hours ago</span>
      </>
    ),
    actions: (
      <>
        <Button variant="secondary">Share</Button>
        <Button leftIcon={<Plus size={12} />}>New task</Button>
      </>
    ),
  },
};
