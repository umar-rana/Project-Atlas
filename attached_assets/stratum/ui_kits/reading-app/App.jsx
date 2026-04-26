/* global React, ReactDOM, READING_DATA */
const { useState, useMemo } = React;

function NotebookSidebar({ data, current, onSelect }) {
  return (
    <aside className="r-side">
      <div className="r-side__brand">
        <span className="r-side__brand-mark"></span>
        <span>Stratum</span>
      </div>
      <div className="r-side__scroll">
        <div className="r-side__group">
          <div className="r-side__group-label">Library</div>
          {data.collections.map((c) => (
            <div
              key={c.id}
              className={"r-side__item" + (c.id === current ? " is-active" : "")}
              onClick={() => onSelect(c.id)}
            >
              <span className="r-side__item-dot" style={{ background: c.color }} />
              <span>{c.label}</span>
              <span className="r-side__item-count">{c.count}</span>
            </div>
          ))}
        </div>
        <div className="r-side__group">
          <div className="r-side__group-label">Notebooks</div>
          {data.notebooks.map((n) => (
            <div
              key={n.id}
              className={"r-side__item" + (n.id === current ? " is-active" : "")}
              onClick={() => onSelect(n.id)}
            >
              <span className="r-side__item-dot" style={{ background: n.color }} />
              <span>{n.label}</span>
              <span className="r-side__item-count">{n.count}</span>
            </div>
          ))}
        </div>
        <div className="r-side__group">
          <div className="r-side__group-label">Tags</div>
          {data.tags.map((t) => (
            <div key={t.id} className="r-side__item">
              <span style={{ color: "var(--text-tertiary)", width: 8 }}>#</span>
              <span>{t.label}</span>
              <span className="r-side__item-count">{t.count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="r-side__footer">
        <span className="r-side__sync-dot" />
        <span>Synced · 2m ago</span>
      </div>
    </aside>
  );
}

function EntryList({ entries, currentId, onSelect, sourceLabel }) {
  // group by day
  const groups = useMemo(() => {
    const m = new Map();
    entries.forEach((e) => {
      if (!m.has(e.dayKey)) m.set(e.dayKey, { label: e.dayLabel, rel: e.dayRel, items: [] });
      m.get(e.dayKey).items.push(e);
    });
    return Array.from(m.values());
  }, [entries]);

  return (
    <section className="r-list">
      <header className="r-list__head">
        <span className="r-list__title">{sourceLabel}</span>
        <span className="r-list__count">{entries.length}</span>
        <span className="r-list__search">
          <span style={{ opacity: 0.7 }}>⌕</span>
          <span>Search</span>
        </span>
      </header>
      <div className="r-list__scroll">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="r-list__day">
              <span>{g.label}</span>
              <span className="r-list__day-rel">· {g.rel}</span>
            </div>
            {g.items.map((e) => (
              <div
                key={e.id}
                className={"r-list__entry" + (e.id === currentId ? " is-active" : "")}
                onClick={() => onSelect(e.id)}
              >
                <div className="r-list__entry-time">
                  <span>{e.time}</span>
                  {e.pinned && <span className="r-list__pin">★</span>}
                </div>
                <div className="r-list__entry-title">{e.title}</div>
                <div className="r-list__entry-excerpt">{e.excerpt}</div>
                <div className="r-list__entry-meta">
                  <span>{e.words} words</span>
                  <i />
                  <span>{e.location}</span>
                  {e.tags && e.tags[0] && (<><i /><span>#{e.tags[0]}</span></>)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Reader({ entry, sourceLabel }) {
  if (!entry) return <section className="r-reader" />;
  return (
    <section className="r-reader">
      <header className="r-reader__chrome">
        <div className="r-reader__crumbs">
          <strong>{sourceLabel}</strong>
          <span>›</span>
          <span>{entry.dayLabel}</span>
        </div>
        <div className="r-reader__chrome-spacer" />
        <span className="r-reader__chip">
          <span>Edit</span>
          <span className="r-reader__chip-kbd">E</span>
        </span>
        <span className="r-reader__chip">
          <span>Focus</span>
          <span className="r-reader__chip-kbd">⌘.</span>
        </span>
        <span className="r-reader__chip">
          <span>···</span>
        </span>
      </header>

      <div className="r-reader__scroll">
        <article className="r-entry">
          <div className="r-entry__day">{entry.dayLabel} · {entry.time}</div>
          <h1 className="r-entry__title">{entry.title}</h1>
          <div className="r-entry__byline">
            <span>{entry.location}</span>
            <i />
            <span>{entry.words} words · {entry.read} min read</span>
            <i />
            <span>{entry.notebook}</span>
          </div>

          {entry.body.map((b, i) => {
            if (b.type === "p") return <p key={i} dangerouslySetInnerHTML={{ __html: b.text }} />;
            if (b.type === "h2") return <h2 key={i}>{b.text}</h2>;
            if (b.type === "h3") return <h3 key={i}>{b.text}</h3>;
            if (b.type === "quote") return (
              <blockquote key={i}>
                <span>{b.text}</span>
                {b.cite && <cite>— {b.cite}</cite>}
              </blockquote>
            );
            if (b.type === "ul") return (
              <ul key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
            );
            if (b.type === "hr") return <hr key={i} />;
            return null;
          })}

          {entry.weather && (
            <div className="r-entry__weather">
              <span>◐</span>
              <span className="r-entry__weather-num">{entry.weather.temp}</span>
              <span>{entry.weather.cond}</span>
              <span className="r-entry__weather-sep" />
              <span>{entry.weather.location}</span>
              <span className="r-entry__weather-sep" />
              <span className="r-entry__weather-num">{entry.time}</span>
            </div>
          )}

          {entry.tags && (
            <div className="r-entry__meta">
              {entry.tags.map((t) => (
                <span key={t} className="r-entry__meta-tag">{t}</span>
              ))}
            </div>
          )}
        </article>
      </div>

      <div className="r-progress">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className={"r-progress__tick" + (i === 2 ? " is-current" : "")} />
        ))}
      </div>

      <div className="r-hintbar">
        <span><span className="r-hintbar__kbd">⌘N</span> New entry</span>
        <span className="r-hintbar__sep" />
        <span><span className="r-hintbar__kbd">J K</span> Navigate</span>
        <span className="r-hintbar__sep" />
        <span><span className="r-hintbar__kbd">/</span> Search</span>
        <span className="r-hintbar__sep" />
        <span><span className="r-hintbar__kbd">⌘.</span> Focus mode</span>
      </div>
    </section>
  );
}

function App() {
  const [currentEntry, setCurrentEntry] = useState(READING_DATA.entries[0].id);
  const [source, setSource] = useState("journal");
  const sourceLabel = useMemo(() => {
    const all = [...READING_DATA.collections, ...READING_DATA.notebooks];
    return (all.find((s) => s.id === source) || { label: "All entries" }).label;
  }, [source]);

  const entry = READING_DATA.entries.find((e) => e.id === currentEntry);

  return (
    <div className="r-app">
      <NotebookSidebar data={READING_DATA} current={source} onSelect={setSource} />
      <EntryList
        entries={READING_DATA.entries}
        currentId={currentEntry}
        onSelect={setCurrentEntry}
        sourceLabel={sourceLabel}
      />
      <Reader entry={entry} sourceLabel={sourceLabel} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
