import type { Command, PaletteCategory } from "../actions/command.ts";
import type { PaletteEntry } from "./palette.ts";

export type CategoryGroup = {
  id: PaletteCategory;
  label: string;
  icon: string;
  entries: PaletteEntry[];
};

const CATEGORY_ORDER: PaletteCategory[] = ["queues", "filters", "actions", "help"];

const CATEGORY_LABELS: Record<PaletteCategory, string> = {
  queues: "Queues",
  filters: "Filters",
  actions: "Actions",
  help: "Help",
};

const CATEGORY_ICONS: Record<PaletteCategory, string> = {
  queues: "⊞",
  filters: "◇",
  actions: "▸",
  help: "?",
};

export function categorize(entries: PaletteEntry[], commands: Command[]): CategoryGroup[] {
  const cmdMap = new Map<string, Command>();
  for (const c of commands) cmdMap.set(c.name, c);

  const buckets = new Map<PaletteCategory, PaletteEntry[]>();
  for (const cat of CATEGORY_ORDER) buckets.set(cat, []);

  for (const entry of entries) {
    const cmd = cmdMap.get(entry.commandName);
    const cat = cmd?.paletteMetadata?.category ?? "actions";
    buckets.get(cat)!.push(entry);
  }

  const groups: CategoryGroup[] = [];
  for (const cat of CATEGORY_ORDER) {
    const entries = buckets.get(cat)!;
    if (entries.length > 0) {
      groups.push({
        id: cat,
        label: CATEGORY_LABELS[cat],
        icon: CATEGORY_ICONS[cat],
        entries,
      });
    }
  }
  return groups;
}

export type NavItem = {
  kind: "entry";
  entry: PaletteEntry;
  categoryId: PaletteCategory;
};

export function flattenForNav(categories: CategoryGroup[]): NavItem[] {
  const items: NavItem[] = [];
  for (const cat of categories) {
    for (const entry of cat.entries) {
      items.push({ kind: "entry", entry, categoryId: cat.id });
    }
  }
  return items;
}
