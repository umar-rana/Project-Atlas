import type { Meta, StoryObj } from "@storybook/nextjs";
import { Search, X } from "lucide-react";
import { Input } from "./input";

const meta: Meta<typeof Input> = {
  title: "Primitives/Input",
  component: Input,
  args: { placeholder: "Project name" },
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <Input size="sm" placeholder="Small" />
      <Input size="md" placeholder="Medium (default)" />
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <Input leftIcon={<Search size={12} />} placeholder="Search" />
      <Input leftIcon={<Search size={12} />} rightIcon={<X size={12} />} placeholder="Clearable" />
      <Input prefix="https://" placeholder="atlas.app" />
      <Input suffix=".md" placeholder="filename" />
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <Input placeholder="Default" />
      <Input placeholder="Disabled" disabled />
      <Input placeholder="Error" error defaultValue="invalid" />
    </div>
  ),
};
