import type { Meta, StoryObj } from "@storybook/nextjs";
import * as React from "react";
import { Folder, Hash, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ReferenceAutocomplete, type ReferenceItem } from "./reference-autocomplete";

const PEOPLE: ReferenceItem[] = [
  { id: "p-alex", label: "alex", group: "People", icon: <User size={11} />, hint: "Eng" },
  { id: "p-mira", label: "mira", group: "People", icon: <User size={11} />, hint: "Design" },
  { id: "p-jules", label: "jules", group: "People", icon: <User size={11} />, hint: "Ops" },
];
const TAGS: ReferenceItem[] = [
  { id: "t-research", label: "research", group: "Tags", icon: <Hash size={11} /> },
  { id: "t-q4-launch", label: "q4-launch", group: "Tags", icon: <Hash size={11} /> },
];
const ENTITIES: ReferenceItem[] = [
  {
    id: "e-q4",
    label: "Q4 Launch",
    group: "Entities",
    icon: <Folder size={11} />,
    hint: "Project",
  },
  {
    id: "e-spec",
    label: "Launch Spec",
    group: "Entities",
    icon: <Folder size={11} />,
    hint: "Doc",
  },
];

const ALL = [...PEOPLE, ...TAGS, ...ENTITIES];

const meta: Meta = { title: "Composed/ReferenceAutocomplete" };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = React.useState(true);
    const [query, setQuery] = React.useState("");
    const searchFn = React.useCallback(
      (q: string) => ALL.filter((item) => item.label.toLowerCase().includes(q.toLowerCase())),
      [],
    );
    return (
      <div className="w-80">
        <ReferenceAutocomplete
          triggerChar="@"
          query={query}
          searchFn={searchFn}
          open={open}
          onOpenChange={setOpen}
          onSelect={(item) => {
            setQuery(item.label);
            setOpen(false);
          }}
        >
          <div>
            <Input
              placeholder="Type @, #, or [["
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
            />
          </div>
        </ReferenceAutocomplete>
      </div>
    );
  },
};
