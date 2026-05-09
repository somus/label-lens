export type Label = string | string[];

export type InputPrediction = {
  label: Label;
  confidence?: number;
  source: string;
  reason?: string;
};

export type InputIssue = {
  type: string;
  score?: number;
};

export type InputRecord = {
  id?: string;
  text: string;
  context_before?: string;
  context_after?: string;
  predictions?: InputPrediction[];
  issues?: InputIssue[];
  meta?: Record<string, unknown>;
};

export type ReviewStatus = "pending" | "accepted" | "relabeled" | "rejected" | "skipped";

export type SourceOfTruth = "human" | "human+assistant";

export type StoredRecord = {
  id: string;
  source_path: string;
  row_index: number;
  text: string;
  context_before: string | null;
  context_after: string | null;
  raw: string;
};

export type StoredPrediction = {
  id: number;
  record_id: string;
  label: string;
  confidence: number | null;
  source: string;
  reason: string | null;
  raw: string;
};

export type StoredReview = {
  id: number;
  record_id: string;
  status: ReviewStatus;
  final_label: string | null;
  prev_label: string | null;
  note: string | null;
  reviewed_at: string;
  source_of_truth: SourceOfTruth;
};

export type RecordWithPrimaryPrediction = StoredRecord & {
  primaryPrediction: StoredPrediction | null;
  latestReview: StoredReview | null;
};
