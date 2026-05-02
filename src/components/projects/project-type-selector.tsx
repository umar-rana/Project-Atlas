"use client";

export type ProjectType = string;

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  project: "Project",
  goal: "Goal",
};

export const PROJECT_TYPE_ICONS: Record<string, string> = {
  project: "📁",
  goal: "🎯",
};

export function getTypeLabel(type: string): string {
  if (PROJECT_TYPE_LABELS[type]) return PROJECT_TYPE_LABELS[type];
  return type
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function getTypeIcon(type: string): string {
  return PROJECT_TYPE_ICONS[type] ?? "📂";
}

export { ProjectTypePicker as ProjectTypeSelector } from "./project-type-picker";
