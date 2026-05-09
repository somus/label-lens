import { EventEmitter } from "node:events";
import type { Db } from "../store/db.ts";
import { queueRecords } from "../store/queries.ts";
import { type QueueDefinition, type QueueId, resolveQueue } from "../store/queues/registry.ts";
import type { RecordWithPrimaryPrediction } from "../types.ts";

export type CursorEvents = {
  change: [];
};

export class Cursor extends EventEmitter<CursorEvents> {
  private records: RecordWithPrimaryPrediction[];
  private index: number;

  constructor(
    private readonly db: Db,
    private readonly definition: QueueDefinition,
  ) {
    super();
    this.records = queueRecords(db, definition.query);
    this.index = 0;
  }

  get queueId(): QueueId {
    return this.definition.id;
  }

  get total(): number {
    return this.records.length;
  }

  get position(): number {
    return this.records.length === 0 ? -1 : this.index;
  }

  current(): RecordWithPrimaryPrediction | null {
    return this.records[this.index] ?? null;
  }

  next(): void {
    if (this.records.length === 0) return;
    this.index = Math.min(this.index + 1, this.records.length - 1);
    this.emit("change");
  }

  prev(): void {
    if (this.records.length === 0) return;
    this.index = Math.max(this.index - 1, 0);
    this.emit("change");
  }

  refresh(): void {
    const previousId = this.current()?.id;
    this.records = queueRecords(this.db, this.definition.query);
    if (previousId !== undefined) {
      const newIndex = this.records.findIndex((r) => r.id === previousId);
      if (newIndex >= 0) {
        this.index = newIndex;
      } else {
        this.index = Math.min(this.index, Math.max(0, this.records.length - 1));
      }
    }
    this.emit("change");
  }

  seek(recordId: string): boolean {
    const idx = this.records.findIndex((r) => r.id === recordId);
    if (idx < 0) return false;
    this.index = idx;
    this.emit("change");
    return true;
  }

  seekIndex(n: number): void {
    if (this.records.length === 0) return;
    this.index = Math.max(0, Math.min(n, this.records.length - 1));
    this.emit("change");
  }
}

export function openCursor(db: Db, queueId: QueueId): Cursor {
  return new Cursor(db, resolveQueue(queueId));
}
