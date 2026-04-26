import type { Meta, StoryObj } from "@storybook/nextjs";
import { Progress, ProgressRing } from "./progress";

const meta: Meta = { title: "Primitives/Progress" };
export default meta;
type Story = StoryObj;

export const Bars: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <Progress value={25} />
      <Progress value={62} size="md" />
      <Progress value={88} variant="success" />
      <Progress value={null} />
    </div>
  ),
};

export const Rings: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <ProgressRing value={20} />
      <ProgressRing value={55} size={48} strokeWidth={4} />
      <ProgressRing value={92} size={64} strokeWidth={5} variant="success" />
    </div>
  ),
};
