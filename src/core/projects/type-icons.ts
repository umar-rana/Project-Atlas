const TYPE_ICONS: Record<string, string> = {
  project: "📁",
  goal: "🎯",
  travel: "✈️",
  learning: "📚",
  health: "💪",
  reading: "📖",
  work: "💼",
  personal: "🏠",
  finance: "💰",
  fitness: "🏃",
  shopping: "🛒",
  food: "🍽️",
  music: "🎵",
  art: "🎨",
  writing: "✍️",
  research: "🔬",
  home: "🏡",
  family: "👨‍👩‍👧",
  social: "🤝",
  hobby: "🎮",
};

const TYPE_COLORS: Record<string, string> = {
  project: "#3b82f6",
  goal: "#f59e0b",
  travel: "#06b6d4",
  learning: "#8b5cf6",
  health: "#10b981",
  reading: "#ec4899",
  work: "#64748b",
  personal: "#f97316",
  finance: "#22c55e",
  fitness: "#ef4444",
  shopping: "#a78bfa",
  food: "#fb923c",
  music: "#818cf8",
  art: "#f472b6",
  writing: "#34d399",
  research: "#38bdf8",
  home: "#fbbf24",
  family: "#4ade80",
  social: "#60a5fa",
  hobby: "#c084fc",
};

const FALLBACK_COLORS = [
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#14b8a6",
];

function hashType(type: string): number {
  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = (hash << 5) - hash + type.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function getTypeIcon(type: string): string {
  return TYPE_ICONS[type] ?? "📂";
}

export function getTypeColor(type: string): string {
  return TYPE_COLORS[type] ?? FALLBACK_COLORS[hashType(type) % FALLBACK_COLORS.length] ?? "#3b82f6";
}
