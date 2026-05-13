import type { CliRenderer } from "@opentui/core";
import { Box } from "../render/box.ts";
import type { ResolvedDisplay } from "../render/capability.ts";
import { type Segment, StatusBar } from "../render/chrome/index.ts";
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
 *
 * Mounts before AppContext is wired up, so we render chrome inline rather than
 * via the Chrome wrapper (which needs a registry).
 */
export function mountReingestPrompt(args: {
  renderer: CliRenderer;
  counts: ReingestPromptCounts;
  display?: ResolvedDisplay;
  datasetName?: string;
  onChoice: (choice: ReingestChoice) => void;
}): ReingestPromptHandle {
  const { renderer, counts, onChoice } = args;
  const display: ResolvedDisplay = args.display ?? {
    color: "mono",
    banding: false,
    theme: "light",
    candidatePin: 0.4,
    layout: "auto",
  };

  const lines: string[] = ["Source file has changed since last review."];
  if (counts.predictionsOnly > 0) {
    lines.push(
      `  ${pad(counts.predictionsOnly)} records — predictions[] changed only (text/context unchanged)`,
    );
  }
  if (counts.orphans > 0) {
    lines.push(
      `  ${pad(counts.orphans)} records — text or context changed → ${counts.orphans} prior reviews would orphan`,
    );
  }
  if (counts.newRecords > 0) {
    lines.push(`  ${pad(counts.newRecords)} records — new (no matching prior record)`);
  }

  const statusLeft: Segment[] = [
    { text: " LabelLens", tone: "bold" },
    { text: "  ", tone: "dim" },
    { text: args.datasetName ?? "data", tone: "muted" },
    { text: "  ", tone: "dim" },
    { text: "Re-ingest", tone: "warning" },
  ];

  const footerHint: Segment[] = [
    { text: " [r] ", tone: "accent" },
    { text: "refresh  ", tone: "muted" },
    { text: "[f] ", tone: "accent" },
    { text: "fresh  ", tone: "muted" },
    { text: "[c] ", tone: "accent" },
    { text: "cancel", tone: "muted" },
  ];

  const render = () => {
    for (const child of renderer.root.getChildren()) child.destroyRecursively();
    renderer.root.add(
      Box(
        { flexDirection: "column", flexGrow: 1, padding: 1 },
        StatusBar({ display, left: statusLeft }),
        Box({ height: 1 }),
        Box(
          { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
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
        ),
        StatusBar({ display, left: footerHint }),
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
  return n.toString().padStart(6, " ");
}
