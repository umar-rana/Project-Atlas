import type { Meta, StoryObj } from "@storybook/nextjs";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";
import { Label } from "./label";
import { Input } from "./input";

const meta: Meta = { title: "Primitives/Popover" };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">Open</Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-64 flex-col gap-2">
        <Label htmlFor="quick-label">Label</Label>
        <Input id="quick-label" placeholder="Inbox" />
      </PopoverContent>
    </Popover>
  ),
};
