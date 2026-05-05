export interface UploadedDocument {
  filename: string;
  bytes: Buffer;
}

export interface PipelineContext {
  reviewId: string;
  uploads: UploadedDocument[];
  onProgress?: (event: PipelineProgress) => void | Promise<void>;
}

export type PipelineProgress =
  | { type: "status"; status: string }
  | { type: "pass_start"; pass: 1 | 2 | 3 | 4 | 5; label: string }
  | { type: "pass_done"; pass: 1 | 2 | 3 | 4 | 5 }
  /** Fine-grained progress within a pass — drives the UI sub-status line. */
  | { type: "progress"; pass: 1 | 2 | 3 | 4 | 5; message: string; current?: number; total?: number }
  | { type: "letter_chunk"; text: string }
  | { type: "error"; message: string };
