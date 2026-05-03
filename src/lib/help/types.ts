import type { LucideIcon } from "lucide-react";

export interface HelpArticle {
  id: string;
  title: string;
  content: string;
}

export interface HelpSection {
  id: string;
  label: string;
  icon: LucideIcon;
  articles: HelpArticle[];
}
