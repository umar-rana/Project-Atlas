import type { Meta, StoryObj } from "@storybook/nextjs";
import { Skeleton } from "./skeleton";

const meta: Meta<typeof Skeleton> = { title: "Primitives/Skeleton", component: Skeleton };
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Patterns: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="line" width="100%" />
        <Skeleton variant="line" width="80%" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" width={32} height={32} />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton variant="text" width="50%" />
          <Skeleton variant="text" width="30%" />
        </div>
      </div>
      <Skeleton variant="block" />
    </div>
  ),
};
