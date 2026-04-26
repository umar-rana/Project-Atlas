import type { Meta, StoryObj } from "@storybook/nextjs";
import { Radio, RadioGroup } from "./radio";
import { Label } from "./label";

const meta: Meta<typeof RadioGroup> = { title: "Primitives/RadioGroup", component: RadioGroup };
export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="day" aria-label="Time range">
      {[
        { v: "day", l: "Day" },
        { v: "week", l: "Week" },
        { v: "month", l: "Month" },
      ].map((o) => (
        <div key={o.v} className="flex items-center gap-2">
          <Radio id={`r-${o.v}`} value={o.v} />
          <Label htmlFor={`r-${o.v}`}>{o.l}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
};
