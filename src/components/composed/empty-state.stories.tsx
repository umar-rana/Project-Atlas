import type { Meta, StoryObj } from "@storybook/nextjs";
import { Inbox, Plus } from "lucide-react";
import { EmptyState } from "./empty-state";
import { Button } from "@/components/ui/button";

const meta: Meta<typeof EmptyState> = {
  title: "Composed/EmptyState",
  component: EmptyState,
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    icon: Inbox,
    title: "Inbox is clear",
    body: "Anything captured by quick add lands here. You're caught up for now.",
  },
};

export const WithAction: Story = {
  args: {
    icon: Inbox,
    title: "No projects yet",
    body: "Create your first project to start capturing tasks.",
    action: <Button leftIcon={<Plus size={12} />}>New project</Button>,
  },
};
