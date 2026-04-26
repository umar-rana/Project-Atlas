import type { Meta, StoryObj } from "@storybook/nextjs";
import { Spinner } from "./spinner";

const meta: Meta<typeof Spinner> = { title: "Primitives/Spinner", component: Spinner };
export default meta;
type Story = StoryObj<typeof Spinner>;

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </div>
  ),
};
