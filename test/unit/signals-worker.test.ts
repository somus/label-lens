import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { WorkerInbound, WorkerOutbound } from "../../src/signals/worker.ts";
import { openDb } from "../../src/store/db.ts";
import { COMPUTED_SIGNAL_SOURCE } from "../../src/store/issues.ts";
import { openTmpStore } from "../util/tmp.ts";

const WORKER_URL = new URL("../../src/signals/worker.ts", import.meta.url).href;

function awaitTerminal(worker: Worker): Promise<WorkerOutbound> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
      const data = e.data;
      if (data.kind === "done" || data.kind === "cancelled" || data.kind === "error") {
        resolve(data);
      }
    };
    worker.onerror = (e) => reject(e);
  });
}

describe("signals worker (Bun Worker)", () => {
  test("computes signals end-to-end and posts done", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const dbPath = store.dbPath;
    store.db.$client.close();

    const worker = new Worker(WORKER_URL);
    const terminal = awaitTerminal(worker);
    const start: WorkerInbound = {
      kind: "start",
      dbPath,
      lowConfidence: { default: 0.5, bySource: [] },
    };
    worker.postMessage(start);

    const result = await terminal;
    worker.terminate();

    expect(result.kind).toBe("done");
    if (result.kind !== "done") return;
    expect(result.written).toBeGreaterThan(0);

    const verify = openDb(dbPath);
    try {
      const n = verify.all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM issues WHERE source = ${COMPUTED_SIGNAL_SOURCE}`,
      )[0]!.n;
      expect(n).toBeGreaterThan(0);
    } finally {
      verify.$client.close();
    }
  });

  test("honors cancel posted before start", async () => {
    using store = await openTmpStore({ ingest: "tiny.jsonl" });
    const dbPath = store.dbPath;
    store.db.$client.close();

    const worker = new Worker(WORKER_URL);
    const terminal = awaitTerminal(worker);
    worker.postMessage({ kind: "cancel" } satisfies WorkerInbound);
    worker.postMessage({ kind: "start", dbPath } satisfies WorkerInbound);

    const result = await terminal;
    worker.terminate();
    expect(result.kind).toBe("cancelled");

    const verify = openDb(dbPath);
    try {
      const computed = verify.all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM issues WHERE source = ${COMPUTED_SIGNAL_SOURCE}`,
      )[0]!.n;
      expect(computed).toBe(0);
    } finally {
      verify.$client.close();
    }
  });
});
