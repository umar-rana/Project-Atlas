/* Sample data for the productivity app UI kit. Pure JS so it can be loaded as a regular script and accessed from the App.jsx Babel script. */

window.STRATUM_TASKS = [
  { id: "t1",  title: "Review PR #482 — calendar sync edge cases", due: "overdue", priority: "high", tags: [{ fam: "a", color: 2, label: "Code" }], project: "Q4 Launch", projectColor: "var(--viz-1)", time: "Yesterday" },
  { id: "t2",  title: "Reply to Zoe re: pricing alt headlines", due: "overdue", priority: "med", tags: [{ fam: "c", color: 4, label: "#writing" }], project: "Pricing rewrite", projectColor: "var(--viz-3)", time: "Mon 12" },

  { id: "t3",  title: "Draft Q4 OKR memo for leadership", due: "today", priority: "high", tags: [{ fam: "b", color: 1, label: "P0" }, { fam: "c", color: 1, label: "#roadmap" }], project: "Q4 Launch", projectColor: "var(--viz-1)", time: "10:30" },
  { id: "t4",  title: "1:1 with Sam — calendar integration scope", due: "today", priority: null, tags: [], project: "Q4 Launch", projectColor: "var(--viz-1)", time: "13:00" },
  { id: "t5",  title: "Write release notes for v2.4.1", due: "today", priority: "med", tags: [{ fam: "a", color: 1, label: "Doc" }], project: "Q4 Launch", projectColor: "var(--viz-1)", time: "—" },
  { id: "t6",  title: "Send invoices for September retainers", due: "today", priority: null, tags: [{ fam: "c", color: 2, label: "#ops" }], project: "Personal · life admin", projectColor: "var(--viz-2)", time: "—", done: true },
  { id: "t7",  title: "Prep agenda for Friday planning", due: "today", priority: null, tags: [], project: "Q4 Launch", projectColor: "var(--viz-1)", time: "16:00", selected: true },

  { id: "t8",  title: "Read “Rest” chapter notes — apply to Q4 cadence", due: "tonight", priority: null, tags: [{ fam: "c", color: 5, label: "#reading" }], project: null, time: "21:00" },
  { id: "t9",  title: "Clear inbox down to zero", due: "tonight", priority: null, tags: [], project: null, time: "22:30" },
];

window.STRATUM_INBOX = [
  { id: "i1", title: "Buy birthday gift for D — list 3 ideas", priority: null, tags: [{ fam: "c", color: 4, label: "#personal" }], time: "12 min ago" },
  { id: "i2", title: "Follow up with the design candidate", priority: "med", tags: [{ fam: "b", color: 2, label: "Hiring" }], time: "1 h ago" },
  { id: "i3", title: "Capture: refactor list-row component, density variants", priority: null, tags: [{ fam: "a", color: 2, label: "Task" }], time: "Yesterday" },
];

window.STRATUM_EVENTS = [
  // 7am = top 0; each hour = 60px in our CSS; "top" calculated against 7:00 baseline
  { day: "Mon 12", style: "soft",   title: "Standup",          time: "9:00 – 9:15",  top: 120, height: 30, color: "var(--cal-1-fill)", colorSoft: "var(--cal-1-soft)", colorBorder: "var(--cal-1-border)" },
  { day: "Mon 12", style: "fill",   title: "Deep work · Plan", time: "10:00 – 12:00", top: 180, height: 120, color: "var(--cal-3-fill)", colorSoft: "var(--cal-3-soft)", colorBorder: "var(--cal-3-border)" },
  { day: "Tue 13", style: "soft",   title: "1:1 · Sam",        time: "10:00 – 10:30", top: 180, height: 30, color: "var(--cal-5-fill)", colorSoft: "var(--cal-5-soft)", colorBorder: "var(--cal-5-border)" },
  { day: "Tue 13", style: "fill",   title: "Customer · Acme",  time: "13:00 – 14:00", top: 360, height: 60, color: "var(--cal-7-fill)", colorSoft: "var(--cal-7-soft)", colorBorder: "var(--cal-7-border)" },
  { day: "Wed 14", style: "soft",   title: "Roadmap review",   time: "11:00 – 12:00", top: 240, height: 60, color: "var(--cal-2-fill)", colorSoft: "var(--cal-2-soft)", colorBorder: "var(--cal-2-border)" },
  { day: "Wed 14", style: "soft",   title: "Writing block",    time: "14:00 – 16:00", top: 420, height: 120, color: "var(--cal-9-fill)", colorSoft: "var(--cal-9-soft)", colorBorder: "var(--cal-9-border)" },
  { day: "Thu 15", style: "soft",   title: "Standup",          time: "9:00 – 9:15",   top: 120, height: 30, color: "var(--cal-1-fill)", colorSoft: "var(--cal-1-soft)", colorBorder: "var(--cal-1-border)" },
  { day: "Thu 15", style: "fill",   title: "OKR memo",         time: "10:30 – 12:00", top: 210, height: 90, color: "var(--cal-3-fill)", colorSoft: "var(--cal-3-soft)", colorBorder: "var(--cal-3-border)" },
  { day: "Thu 15", style: "soft",   title: "1:1 · Sam",        time: "13:00 – 13:30", top: 360, height: 30, color: "var(--cal-5-fill)", colorSoft: "var(--cal-5-soft)", colorBorder: "var(--cal-5-border)" },
  { day: "Thu 15", style: "border", title: "Planning",         time: "16:00 – 17:00", top: 540, height: 60, color: "var(--cal-6-fill)", colorSoft: "var(--cal-6-soft)", colorBorder: "var(--cal-6-border)" },
  { day: "Fri 16", style: "fill",   title: "Q4 launch review", time: "10:00 – 11:30", top: 180, height: 90, color: "var(--cal-4-fill)", colorSoft: "var(--cal-4-soft)", colorBorder: "var(--cal-4-border)" },
  { day: "Fri 16", style: "soft",   title: "Office hours",     time: "14:00 – 15:00", top: 420, height: 60, color: "var(--cal-11-fill)", colorSoft: "var(--cal-11-soft)", colorBorder: "var(--cal-11-border)" },
];

window.STRATUM_KANBAN = {
  backlog: [
    { id: "b1", title: "Audit empty states across product",  tags: [{ fam: "a", color: 1, label: "Doc" }], assignee: "M", assigneeColor: "var(--viz-1)", due: "Oct 22" },
    { id: "b2", title: "Revisit pricing experiment matrix",  tags: [{ fam: "c", color: 4, label: "#strategy" }], assignee: "A", assigneeColor: "var(--viz-2)" },
  ],
  inprogress: [
    { id: "p1", title: "Calendar week view — overlapping events", note: "Stack & truncate, dim past events.", tags: [{ fam: "b", color: 1, label: "P0" }, { fam: "a", color: 2, label: "Code" }], assignee: "M", assigneeColor: "var(--viz-1)", due: "Today" },
    { id: "p2", title: "Tag families across density modes",        tags: [{ fam: "a", color: 1, label: "Design" }], assignee: "J", assigneeColor: "var(--viz-5)", due: "Wed" },
  ],
  review: [
    { id: "r1", title: "Reading mode — typography polish", tags: [{ fam: "c", color: 5, label: "#reading" }], assignee: "A", assigneeColor: "var(--viz-2)", due: "Today" },
  ],
  done: [
    { id: "d1", title: "Command palette grouping pass", tags: [{ fam: "a", color: 2, label: "Code" }], assignee: "M", assigneeColor: "var(--viz-1)" },
    { id: "d2", title: "Dark surface contrast tuning", tags: [{ fam: "a", color: 1, label: "Design" }], assignee: "J", assigneeColor: "var(--viz-5)" },
  ],
};

window.STRATUM_NOTES = [
  { id: "n1", title: "On the discipline of small surfaces",    preview: "A productivity tool earns its place by removing friction…", date: "Sep 17", tag: "#essay",   tagColor: 4 },
  { id: "n2", title: "Q4 planning — first principles",         preview: "Three categories: things we'd regret not shipping…",      date: "Sep 14", tag: "#planning",tagColor: 1 },
  { id: "n3", title: "Calendar sync — design notes",           preview: "When events overlap by less than 15 minutes, stack…",     date: "Sep 12", tag: "#design",  tagColor: 5 },
  { id: "n4", title: "Reading list — autumn",                  preview: "Books, papers, essays. Limit to 12.",                     date: "Sep 09", tag: "#reading", tagColor: 2 },
  { id: "n5", title: "Weekly review template",                 preview: "1) What surprised me. 2) What I avoided…",                date: "Sep 02", tag: "#system",  tagColor: 3 },
];

window.STRATUM_NOTE = {
  id: "n1",
  title: "On the discipline of small surfaces",
  date: "September 17, 2026",
  read: 4,
  lede: "A productivity tool earns its place by removing friction, not by adding rooms.",
  body: [
    { type: "p", text: "The interface should feel like a well-kept workshop — every tool within reach, nothing on the bench you didn't put there. When density slips, you start scrolling for things you knew the position of." },
    { type: "h2", text: "Density is care" },
    { type: "p", text: "A serious tool respects the user's time and attention. It assumes literacy and preserves it. The reward for paying attention is more attention back." },
    { type: "quote", text: "Tools should disappear. The work should not." },
    { type: "p", text: "Aim for an interface so familiar that it stops being interface. The cursor knows where things live. The keyboard does the heavy lifting. The mouse, when used, lands precisely." },
    { type: "h2", text: "Three principles" },
    { type: "list", items: [
      "Hide nothing important; reveal nothing extra.",
      "Dense by default; spacious on request.",
      "Every action has a key; every key is shown.",
    ] },
  ],
};
