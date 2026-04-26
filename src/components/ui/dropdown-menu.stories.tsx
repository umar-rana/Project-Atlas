import type { Meta, StoryObj } from "@storybook/nextjs";
import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Button } from "./button";
import { KeyboardShortcut } from "./keyboard-shortcut";
import { Pin, Star, Trash2 } from "lucide-react";

const meta: Meta = { title: "Primitives/DropdownMenu" };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [showHidden, setShowHidden] = React.useState(true);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary">Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Item</DropdownMenuLabel>
          <DropdownMenuItem shortcut={<KeyboardShortcut keys={["cmd", "P"]} variant="subtle" />}>
            <Pin size={12} /> Pin to top
          </DropdownMenuItem>
          <DropdownMenuItem shortcut={<KeyboardShortcut keys={["S"]} variant="subtle" />}>
            <Star size={12} /> Star
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>View</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked={showHidden} onCheckedChange={(v) => setShowHidden(Boolean(v))}>
            Show hidden items
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive shortcut={<KeyboardShortcut keys={["backspace"]} variant="subtle" />}>
            <Trash2 size={12} /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};
