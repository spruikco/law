export type BillingPass = 1 | 2 | 3;

export type BillingPipelineProgress =
  | { type: "status"; status: string }
  | { type: "pass_start"; pass: BillingPass; label: string }
  | { type: "pass_done"; pass: BillingPass }
  | {
      type: "progress";
      pass: BillingPass;
      message: string;
      current?: number;
      total?: number;
    }
  | { type: "letter_chunk"; text: string }
  | { type: "error"; message: string };
