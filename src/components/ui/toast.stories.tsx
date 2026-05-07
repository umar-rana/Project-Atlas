import type { Meta, StoryObj } from "@storybook/nextjs";
import { Toaster, toast } from "./toast";
import { Button } from "./button";

const meta: Meta = { title: "Primitives/Toast" };
export default meta;
type Story = StoryObj;

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Toaster />
      <Button onClick={() => toast.success("Saved drafts.")}>Success</Button>
      <Button variant="secondary" onClick={() => toast("Reminder set for 3:00 pm.")}>
        Info
      </Button>
      <Button variant="secondary" onClick={() => toast.warning("Network is slow.")}>
        Warning
      </Button>
      <Button
        variant="destructive"
        onClick={() => toast.error("Couldn't reach calendar.", { duration: Infinity })}
      >
        Error
      </Button>
    </div>
  ),
};
