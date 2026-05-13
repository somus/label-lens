import type { CliRenderer } from "@opentui/core";
import { Box } from "../render/box.ts";
import { Text, TextAttributes } from "../render/text.ts";

export type ReingestChoice = "refresh" | "fresh" | "cancel";

export type ReingestPromptCounts = {
  predictionsOnly: number;
  orphans: number;
  newRecords: number;
};

export type ReingestPromptHandle = { destroy: () => void };

/**
 * Pre-review prompt rendered when the source JSONL fingerprint disagrees with
 * the row stored in `ingest_fingerprints`. PRD §13.
 *
 *   [r] Refresh predictions, keep reviews, accept orphans + new records
 *   [f] Fresh re-ingest, back up .labellens/ → .labellens.bak/   (legacy)
 *   [c] Cancel
 */
export function mountReingestPrompt(args: {
  renderer: CliRenderer;
  counts: ReingestPromptCounts;
  onChoice: (choice: ReingestChoice) => void;
}): ReingestPromptHandle {
  const { renderer, counts, onChoice } = args;

  const lines: string[] = [
    "Source file has changed since last review.",
    `  ${pad(counts.predictionsOnly)} records — predictions[] changed only (text/context unchanged)`,
    `  ${pad(counts.orphans)} records — text or context changed → ${counts.orphans} prior reviews would orphan`,
    `  ${pad(counts.newRecords)} records — new (no matching prior record)`,
  ];

  const render = () => {
    for (const child of renderer.root.getChildren()) child.destroyRecursively();
    renderer.root.add(
      Box(
        { flexDirection: "column", flexGrow: 1, padding: 1 },
        ...lines.map((line) => Text({ content: ` ${line}` })),
        Box({ height: 1 }),
        Text({
          content: "  [r] Refresh predictions, keep reviews, accept orphans + new records",
          attributes: TextAttributes.BOLD,
        }),
        Text({
          content: "  [f] Fresh re-ingest, back up .labellens/ → .labellens.bak/   (legacy)",
        }),
        Text({ content: "  [c] Cancel" }),
        Box({ flexGrow: 1 }),
        Text({ content: " r — refresh · f — fresh · c — cancel", attributes: TextAttributes.DIM }),
      ),
    );
  };

  const onKey = (event: { name: string }) => {
    switch (event.name) {
      case "r":
      case "return":
      case "enter":
        onChoice("refresh");
        return;
      case "f":
        onChoice("fresh");
        return;
      case "c":
      case "escape":
      case "q":
        onChoice("cancel");
        return;
    }
  };

  const onResize = () => render();
  renderer.keyInput.on("keypress", onKey);
  renderer.on("resize", onResize);
  render();

  return {
    destroy: () => {
      renderer.keyInput.off("keypress", onKey);
      renderer.off("resize", onResize);
    },
  };
}

function pad(n: number): string {
  return n.toString().padStart(4, " ");
}
