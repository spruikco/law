import type { UploadedDocument } from "../pipeline/types";

export type { UploadedDocument };

export interface LeasePipelineContext {
  reviewId: string;
  uploads: UploadedDocument[];
  clientName: string;
  onProgress?: (event: LeasePipelineProgress) => void | Promise<void>;
}

export type LeasePass = 1 | 2 | 3 | 4 | 5 | 6;

export type LeasePipelineProgress =
  | { type: "status"; status: string }
  | { type: "pass_start"; pass: LeasePass; label: string }
  | { type: "pass_done"; pass: LeasePass }
  | {
      type: "progress";
      pass: LeasePass;
      message: string;
      current?: number;
      total?: number;
    }
  | { type: "letter_chunk"; text: string }
  | { type: "error"; message: string };
