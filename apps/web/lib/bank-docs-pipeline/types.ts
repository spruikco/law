import type { UploadedDocument } from "../pipeline/types";

export type { UploadedDocument };

export type BankDocsPass = 1 | 2 | 3 | 4 | 5 | 6;

export type BankDocsPipelineProgress =
  | { type: "status"; status: string }
  | { type: "pass_start"; pass: BankDocsPass; label: string }
  | { type: "pass_done"; pass: BankDocsPass }
  | {
      type: "progress";
      pass: BankDocsPass;
      message: string;
      current?: number;
      total?: number;
    }
  | { type: "letter_chunk"; text: string }
  | { type: "error"; message: string };
