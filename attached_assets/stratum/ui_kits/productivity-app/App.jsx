/* App.jsx — Stratum productivity app shell
   Switches between primary screens via a left sidebar.
   All visuals reference tokens in colors_and_type.css. */

const { useState, useEffect, useMemo } = React;

function Icon({ name, size = 16, stroke = 1.5, ...rest }) {
  const paths = {
    inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3 7v6a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-6Z"/></>,
    today: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M12 14v4M10 16h4"/></>,
    upcoming: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
    list: <><path d="M3 12h18M3 6h18M3 18h12"/></>,
    project: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></>,
    note: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></>,
    read: <><path d="M2 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H2Z"/><path d="M22 4h-7a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h8Z"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.86.86 1.5 1.51 1.51H21a2 2 0 1 1 0 4h-.09c-.65 0-1.15.64-1.51 1.49Z"/></>,
    chevron: <><path d="m6 9 6 6 6-6"/></>,
    tag: <><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><circle cx="7" cy="7" r="1.5"/></>,
    flag: <><path d="M5 3v18l7-4 7 4V3z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    cmd: <><path d="M18 3a3 3 0 0 0-3 3v3M6 21a3 3 0 0 1-3-3v-3M9 9V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></>,
    moon: <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></>,
    check: <><path d="M20 6 9 17l-5-5"/></>,
    arrowDown: <><path d="M12 5v14M19 12l-7 7-7-7"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    filter: <><path d="M3 4h18l-7 9v5l-4 2v-7Z"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {paths[name]}
    </svg>
  );
}

function Kbd({ children }) {
  return <span className="kbd">{children}</span>;
}

function Sidebar({ active, onChange, theme, setTheme }) {
  const sections = [
    { id: "inbox",    label: "Inbox",    icon: "inbox",    count: 3,  shortcut: "1" },
    { id: "today",    label: "Today",    icon: "today",    count: 7,  shortcut: "2" },
    { id: "upcoming", label: "Upcoming", icon: "upcoming", count: 18, shortcut: "3" },
    { id: "calendar", label: "Calendar", icon: "clock",    shortcut: "4" },
    { id: "notes",    label: "Notes",    icon: "note",     shortcut: "5" },
    { id: "reading",  label: "Reading",  icon: "read",     shortcut: "6" },
  ];
  const projects = [
    { id: "p1", label: "Q4 Launch", color: "var(--viz-1)", count: 14 },
    { id: "p2", label: "Pricing rewrite", color: "var(--viz-3)", count: 6 },
    { id: "p3", label: "Customer interviews", color: "var(--viz-5)", count: 9 },
    { id: "p4", label: "Personal · life admin", color: "var(--viz-2)", count: 4 },
  ];
  return (
    <aside className="sidebar">
      <div className="sb-head">
        <div className="logo">
          <svg viewBox="0 0 64 64" width="20" height="20" fill="none">
            <rect x="8" y="40" width="48" height="10" rx="3" fill="var(--text-tertiary)" opacity="0.55"/>
            <rect x="8" y="26" width="48" height="10" rx="3" fill="var(--text-secondary)" opacity="0.85"/>
            <rect x="8" y="12" width="48" height="10" rx="3" fill="var(--accent-primary)"/>
          </svg>
          <span>Stratum</span>
        </div>
        <button className="icon-btn" title="Settings" aria-label="Settings"><Icon name="settings" size={14}/></button>
      </div>

      <button className="sb-search">
        <Icon name="search" size={14}/>
        <span>Search anything…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav className="sb-list">
        {sections.map(s => (
          <button key={s.id} className={"sb-item" + (active === s.id ? " sel" : "")} onClick={() => onChange(s.id)}>
            <Icon name={s.icon} size={15}/>
            <span className="lbl">{s.label}</span>
            {s.count != null && <span className="ct">{s.count}</span>}
            <Kbd>{s.shortcut}</Kbd>
          </button>
        ))}
      </nav>

      <div className="sb-section">
        <div className="sb-h">
          <span>Projects</span>
          <button className="icon-btn" aria-label="New project"><Icon name="plus" size={12}/></button>
        </div>
        {projects.map(p => (
          <button key={p.id} className={"sb-item" + (active === p.id ? " sel" : "")} onClick={() => onChange(p.id)}>
            <span className="proj-dot" style={{ background: p.color }}/>
            <span className="lbl">{p.label}</span>
            <span className="ct">{p.count}</span>
          </button>
        ))}
      </div>

      <div className="sb-foot">
        <div className="sb-user">
          <span className="av" style={{ background: "var(--viz-5)" }}>SR</span>
          <span className="info">
            <span className="name">Sara Reza</span>
            <span className="status"><i className="dot online"/>Focus · 22 min</span>
          </span>
        </div>
        <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Theme">
          <Icon name={theme === "dark" ? "sun" : "moon"} size={14}/>
        </button>
      </div>
    </aside>
  );
}

function Topbar({ title, subtitle, count, children }) {
  return (
    <header className="topbar">
      <div className="tb-left">
        <h1 className="tb-title">{title}</h1>
        {count != null && <span className="tb-count">{count}</span>}
        {subtitle && <span className="tb-subtitle">{subtitle}</span>}
      </div>
      <div className="tb-right">{children}</div>
    </header>
  );
}

function Pill({ tone = "neutral", children, dot }) {
  return (
    <span className={"pill p-" + tone}>
      {dot && <i className="d"/>}
      {children}
    </span>
  );
}

function Tag({ family = "c", color = 1, children }) {
  return <span className={`tag tag-${family} tag-${family}-${color}`}>{children}</span>;
}

/* ---- Screens ---------------------------------------------- */

function TodayScreen() {
  const [items, setItems] = useState(window.STRATUM_TASKS);
  const toggle = (id) => setItems(items.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const groups = useMemo(() => {
    const overdue = items.filter(t => t.due === "overdue");
    const today = items.filter(t => t.due === "today");
    const tonight = items.filter(t => t.due === "tonight");
    return [
      { name: "Overdue", tone: "danger", items: overdue },
      { name: "Today",   tone: "info",   items: today },
      { name: "Tonight", tone: "neutral", items: tonight },
    ];
  }, [items]);

  return (
    <div className="screen">
      <Topbar title="Today" count={items.filter(i => !i.done).length} subtitle="Thursday, October 15">
        <button className="btn ghost" title="Filter"><Icon name="filter" size={13}/> Filter</button>
        <button className="btn secondary"><Icon name="plus" size={13}/> Subtask</button>
        <button className="btn primary"><Icon name="plus" size={13}/> New task <Kbd>N</Kbd></button>
      </Topbar>

      <div className="content-pad">
        {groups.map(g => (
          <section key={g.name} className="group">
            <div className="group-h">
              <span className={"group-bar t-" + g.tone}/>
              <h3>{g.name}</h3>
              <span className="group-count">{g.items.length}</span>
            </div>
            <div className="task-list">
              {g.items.map(t => <TaskRow key={t.id} t={t} onToggle={toggle}/>)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function TaskRow({ t, onToggle }) {
  return (
    <div className={"task-row" + (t.done ? " done" : "") + (t.selected ? " sel" : "")}>
      <button className={"check" + (t.done ? " on" : "")} onClick={() => onToggle(t.id)} aria-label="Complete">
        {t.done && <Icon name="check" size={10} stroke={2.5}/>}
      </button>
      {t.priority && <Icon name="flag" size={12} className={"prio prio-" + t.priority}/>}
      <span className="t-title">{t.title}</span>
      <span className="t-meta">
        {t.tags && t.tags.map((tag, i) => <Tag key={i} family={tag.fam} color={tag.color}>{tag.label}</Tag>)}
        {t.project && <span className="t-proj"><i style={{ background: t.projectColor }}/>{t.project}</span>}
        {t.time && <span className="t-time">{t.time}</span>}
      </span>
    </div>
  );
}

function InboxScreen() {
  return (
    <div className="screen">
      <Topbar title="Inbox" count={3} subtitle="Triage, then close">
        <button className="btn secondary">Mark all read</button>
        <button className="btn primary"><Icon name="plus" size={13}/> Capture <Kbd>⌘⏎</Kbd></button>
      </Topbar>
      <div className="content-pad">
        <div className="inbox-empty-hint">Newest first · sorted by capture time</div>
        <div className="task-list">
          {window.STRATUM_INBOX.map(t => <TaskRow key={t.id} t={t} onToggle={() => {}}/>)}
        </div>
      </div>
    </div>
  );
}

function CalendarScreen() {
  const hours = Array.from({ length: 10 }, (_, i) => 7 + i); // 7am – 4pm
  const days = ["Mon 12", "Tue 13", "Wed 14", "Thu 15", "Fri 16"];
  const events = window.STRATUM_EVENTS;

  return (
    <div className="screen">
      <Topbar title="Calendar" subtitle="Week of October 12">
        <div className="seg">
          <button>Day</button><button className="on">Week</button><button>Month</button>
        </div>
        <button className="btn primary"><Icon name="plus" size={13}/> Block time <Kbd>B</Kbd></button>
      </Topbar>
      <div className="cal">
        <div className="cal-head">
          <div className="cal-cell hour"/>
          {days.map(d => <div key={d} className={"cal-cell day" + (d === "Thu 15" ? " today" : "")}>{d}</div>)}
        </div>
        <div className="cal-body">
          <div className="cal-col hours">
            {hours.map(h => <div key={h} className="cal-hour">{h % 12 || 12}{h < 12 ? " am" : " pm"}</div>)}
          </div>
          {days.map(d => (
            <div key={d} className={"cal-col day" + (d === "Thu 15" ? " today" : "")}>
              {hours.map(h => <div key={h} className="cal-slot"/>)}
              {events.filter(e => e.day === d).map((e, i) => (
                <div key={i} className={"cal-event " + e.style} style={{ top: e.top, height: e.height, "--c": e.color, "--cs": e.colorSoft, "--cb": e.colorBorder }}>
                  <div className="ev-title">{e.title}</div>
                  <div className="ev-time">{e.time}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectScreen() {
  const cols = [
    { name: "Backlog",    items: window.STRATUM_KANBAN.backlog,    tone: "neutral" },
    { name: "In progress", items: window.STRATUM_KANBAN.inprogress, tone: "info" },
    { name: "Review",      items: window.STRATUM_KANBAN.review,      tone: "warning" },
    { name: "Done",        items: window.STRATUM_KANBAN.done,        tone: "success" },
  ];
  return (
    <div className="screen">
      <Topbar title={<><i className="proj-dot lg" style={{ background: "var(--viz-1)" }}/> Q4 Launch</>} subtitle="14 tasks · 4 collaborators">
        <div className="avatar-stack">
          <span className="av" style={{ background: "var(--viz-1)" }}>M</span>
          <span className="av" style={{ background: "var(--viz-2)" }}>A</span>
          <span className="av" style={{ background: "var(--viz-5)" }}>J</span>
          <span className="av plus">+1</span>
        </div>
        <div className="seg">
          <button>List</button><button className="on">Board</button><button>Timeline</button>
        </div>
        <button className="btn primary"><Icon name="plus" size={13}/> Add task</button>
      </Topbar>
      <div className="kanban">
        {cols.map(col => (
          <div key={col.name} className="kanban-col">
            <div className="kanban-h">
              <Pill tone={col.tone} dot>{col.name}</Pill>
              <span className="ct">{col.items.length}</span>
              <button className="icon-btn" aria-label="Add"><Icon name="plus" size={12}/></button>
            </div>
            <div className="kanban-body">
              {col.items.map(c => (
                <div key={c.id} className="kcard">
                  <div className="kcard-tags">
                    {c.tags && c.tags.map((tg, i) => <Tag key={i} family={tg.fam} color={tg.color}>{tg.label}</Tag>)}
                  </div>
                  <div className="kcard-title">{c.title}</div>
                  {c.note && <div className="kcard-note">{c.note}</div>}
                  <div className="kcard-foot">
                    <span className="t-meta-l">
                      {c.due && <><Icon name="clock" size={11}/> {c.due}</>}
                    </span>
                    <span className="av" style={{ background: c.assigneeColor }}>{c.assignee}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesScreen() {
  const note = window.STRATUM_NOTE;
  return (
    <div className="screen split">
      <div className="notes-list">
        <div className="notes-head">
          <input className="notes-search" placeholder="Search notes…"/>
          <button className="icon-btn" aria-label="New"><Icon name="plus" size={14}/></button>
        </div>
        {window.STRATUM_NOTES.map(n => (
          <button key={n.id} className={"note-row" + (n.id === note.id ? " sel" : "")}>
            <div className="nr-title">{n.title}</div>
            <div className="nr-preview">{n.preview}</div>
            <div className="nr-meta">{n.date} · {n.tag && <Tag family="c" color={n.tagColor}>{n.tag}</Tag>}</div>
          </button>
        ))}
      </div>
      <div className="notes-reader">
        <div className="reader-toolbar">
          <span className="reader-meta">{note.date} · {note.read} min · serif · 65ch</span>
          <div className="seg sm">
            <button>Edit</button><button className="on">Read</button>
          </div>
        </div>
        <article className="reader">
          <h1>{note.title}</h1>
          <p className="lede">{note.lede}</p>
          {note.body.map((b, i) => {
            if (b.type === "p") return <p key={i}>{b.text}</p>;
            if (b.type === "h2") return <h2 key={i}>{b.text}</h2>;
            if (b.type === "quote") return <blockquote key={i}>{b.text}</blockquote>;
            if (b.type === "list") return <ul key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>;
            return null;
          })}
        </article>
      </div>
    </div>
  );
}

/* ---- App ------------------------------------------------- */

function App() {
  const [active, setActive] = useState("today");
  const [theme, setTheme] = useState("dark");
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setPalette(p => !p);
      } else if (e.key === "Escape") setPalette(false);
      else if (!e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement.tagName !== "INPUT") {
        const map = { "1": "inbox", "2": "today", "3": "upcoming", "4": "calendar", "5": "notes", "6": "reading" };
        if (map[e.key]) setActive(map[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  let screen;
  if (active === "today") screen = <TodayScreen/>;
  else if (active === "inbox") screen = <InboxScreen/>;
  else if (active === "calendar") screen = <CalendarScreen/>;
  else if (active === "notes") screen = <NotesScreen/>;
  else if (active.startsWith("p")) screen = <ProjectScreen/>;
  else screen = <TodayScreen/>;

  return (
    <div className="app">
      <Sidebar active={active} onChange={setActive} theme={theme} setTheme={setTheme}/>
      <main className="main">{screen}</main>
      {palette && <CommandPalette onClose={() => setPalette(false)} setActive={setActive}/>}
      <div className="hint-bar">
        <span><Kbd>⌘K</Kbd> Command</span>
        <span><Kbd>1–6</Kbd> Sections</span>
        <span><Kbd>N</Kbd> New task</span>
        <span><Kbd>X</Kbd> Complete</span>
      </div>
    </div>
  );
}

function CommandPalette({ onClose, setActive }) {
  const [q, setQ] = useState("");
  const items = [
    { sec: "Go to", icon: "today", label: "Today",     action: () => setActive("today") },
    { sec: "Go to", icon: "inbox", label: "Inbox",     action: () => setActive("inbox") },
    { sec: "Go to", icon: "clock", label: "Calendar",  action: () => setActive("calendar") },
    { sec: "Go to", icon: "note",  label: "Notes",     action: () => setActive("notes") },
    { sec: "Actions", icon: "plus",  label: "Capture new task" },
    { sec: "Actions", icon: "tag",   label: "Add tag to selection" },
    { sec: "Actions", icon: "clock", label: "Schedule for tomorrow" },
  ].filter(i => !q || i.label.toLowerCase().includes(q.toLowerCase()));
  const groups = items.reduce((acc, it) => ((acc[it.sec] ??= []).push(it), acc), {});
  return (
    <div className="palette-scrim" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()}>
        <div className="p-search">
          <Icon name="search" size={14}/>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Type a command or search…"/>
          <span className="esc">esc</span>
        </div>
        {Object.entries(groups).map(([sec, list]) => (
          <div key={sec} className="p-group">
            <div className="p-h">{sec}</div>
            {list.map((it, i) => (
              <button key={i} className={"p-item" + (sec === "Go to" && i === 0 && !q ? " sel" : "")} onClick={() => { it.action?.(); onClose(); }}>
                <Icon name={it.icon} size={14}/>
                <span>{it.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
