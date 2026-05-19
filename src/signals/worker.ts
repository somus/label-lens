/// <reference lib="webworker" />
import { openDb } from "../store/db.ts";
import { runSignals } from "./run.ts";
import type { LowConfidenceThresholds } from "./threshold.ts";

export type WorkerInbound =
  | { kind: "start"; dbPath: string; lowConfidence?: LowConfidenceThresholds }
  | { kind: "cancel" };

export type WorkerOutbound =
  | { kind: "progress"; done: number; total: number }
  | { kind: "done"; written: number }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

declare const self: Worker & {
  onmessage: ((this: Worker, ev: MessageEvent<WorkerInbound>) => void) | null;
  postMessage(message: WorkerOutbound): void;
};

let cancelRequested = false;
let started = false;

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.kind === "cancel") {
    cancelRequested = true;
    return;
  }
  if (msg.kind === "start") {
    if (started) return;
    started = true;
    runStart(msg);
  }
};

function runStart(msg: { dbPath: string; lowConfidence?: LowConfidenceThresholds }): void {
  let db: ReturnType<typeof openDb> | null = null;
  try {
    db = openDb(msg.dbPath);
    const result = runSignals(db, {
      lowConfidence: msg.lowConfidence,
      isCancelled: () => cancelRequested,
      onProgress: (done, total) => self.postMessage({ kind: "progress", done, total }),
    });
    if (result.cancelled) self.postMessage({ kind: "cancelled" });
    else self.postMessage({ kind: "done", written: result.written });
  } catch (err) {
    self.postMessage({
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    db?.$client.close();
  }
}
