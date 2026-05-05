import type { UploadedDocument } from "../pipeline/types";

export type { UploadedDocument };

export type WillsPass = 1 | 2 | 3 | 4 | 5;

export type WillsPipelineProgress =
  | { type: "status"; status: string }
  | { type: "pass_start"; pass: WillsPass; label: string }
  | { type: "pass_done"; pass: WillsPass }
  | {
      type: "progress";
      pass: WillsPass;
      message: string;
      current?: number;
      total?: number;
    }
  | { type: "letter_chunk"; text: string }
  | { type: "error"; message: string };
