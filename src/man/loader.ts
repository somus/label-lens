import assistant from "../../man/labellens-assistant.md" with { type: "text" };
import config from "../../man/labellens-config.md" with { type: "text" };
import keymap from "../../man/labellens-keymap.md" with { type: "text" };
import tutorial from "../../man/labellens-tutorial.md" with { type: "text" };

const PAGES: Record<string, string> = {
  tutorial,
  config,
  keymap,
  assistant,
};

export function loadManPage(topic: string): string | null {
  return PAGES[topic] ?? null;
}

export function manPageTopics(): string[] {
  return Object.keys(PAGES);
}
