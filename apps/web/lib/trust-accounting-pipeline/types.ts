export type TrustAccountPass = 1 | 2 | 3;

export type TrustAccountPipelineProgress =
  | { type: "status"; status: string }
  | { type: "pass_start"; pass: TrustAccountPass; label: string }
  | { type: "pass_done"; pass: TrustAccountPass }
  | {
      type: "progress";
      pass: TrustAccountPass;
      message: string;
      current?: number;
      total?: number;
    }
  | { type: "letter_chunk"; text: string }
  | { type: "error"; message: string };
