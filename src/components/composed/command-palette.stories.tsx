import type { Meta, StoryObj } from "@storybook/nextjs";
import * as React from "react";
import { Calendar, FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette, type CommandItem } from "./command-palette";

const meta: Meta = { title: "Composed/CommandPalette" };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = React.useState(false);
    const items: CommandItem[] = [
      {
        id: "new-project",
        label: "Create project",
        group: "Create",
        icon: <Plus size={12} />,
        shortcut: ["cmd", "shift", "P"],
        onRun: () => {},
      },
      {
        id: "new-task",
        label: "Create task",
        group: "Create",
        icon: <Plus size={12} />,
        shortcut: ["cmd", "shift", "T"],
        onRun: () => {},
      },
      {
        id: "go-today",
        label: "Today",
        group: "Navigate",
        icon: <Calendar size={12} />,
        shortcut: ["g", "t"],
        onRun: () => {},
      },
      {
        id: "go-inbox",
        label: "Inbox",
        group: "Navigate",
        icon: <FileText size={12} />,
        shortcut: ["g", "i"],
        onRun: () => {},
      },
      {
        id: "search",
        label: "Search everything",
        group: "Other",
        icon: <Search size={12} />,
        shortcut: ["/"],
        onRun: () => {},
      },
    ];
    return (
      <div className="flex flex-col gap-3">
        <Button onClick={() => setOpen(true)}>Open palette (or press ⌘K)</Button>
        <CommandPalette open={open} onOpenChange={setOpen} items={items} />
      </div>
    );
  },
};
