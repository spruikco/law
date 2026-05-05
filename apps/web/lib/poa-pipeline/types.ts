import type { UploadedDocument } from "../pipeline/types";

export type { UploadedDocument };

export type PoaPass = 1 | 2 | 3 | 4 | 5;

export type PoaPipelineProgress =
  | { type: "status"; status: string }
  | { type: "pass_start"; pass: PoaPass; label: string }
  | { type: "pass_done"; pass: PoaPass }
  | {
      type: "progress";
      pass: PoaPass;
      message: string;
      current?: number;
      total?: number;
    }
  | { type: "letter_chunk"; text: string }
  | { type: "error"; message: string };
