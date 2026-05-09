import type { Database } from "bun:sqlite";

export function applySchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id              TEXT PRIMARY KEY,
      source_path     TEXT NOT NULL,
      row_index       INTEGER NOT NULL,
      text            TEXT NOT NULL,
      context_before  TEXT,
      context_after   TEXT,
      raw             TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id   TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      label       TEXT NOT NULL,
      confidence  REAL,
      source      TEXT NOT NULL,
      reason      TEXT,
      raw         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id       TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      status          TEXT NOT NULL CHECK (status IN ('accepted','relabeled','rejected','skipped')),
      final_label     TEXT,
      prev_label      TEXT,
      note            TEXT,
      reviewed_at     TEXT NOT NULL,
      source_of_truth TEXT NOT NULL CHECK (source_of_truth IN ('human','human+assistant'))
    );

    CREATE INDEX IF NOT EXISTS idx_predictions_record  ON predictions(record_id);
    CREATE INDEX IF NOT EXISTS idx_predictions_source  ON predictions(source);
    CREATE INDEX IF NOT EXISTS idx_predictions_conf    ON predictions(confidence);
    CREATE INDEX IF NOT EXISTS idx_reviews_record      ON reviews(record_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_status      ON reviews(status);
    CREATE INDEX IF NOT EXISTS idx_reviews_final       ON reviews(final_label);
    CREATE INDEX IF NOT EXISTS idx_reviews_prev        ON reviews(prev_label);
  `);
}
