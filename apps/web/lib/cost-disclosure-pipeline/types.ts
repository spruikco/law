export type CostDisclosurePass = 1 | 2;

export type CostDisclosurePipelineProgress =
  | { type: "status"; status: string }
  | { type: "pass_start"; pass: CostDisclosurePass; label: string }
  | { type: "pass_done"; pass: CostDisclosurePass }
  | {
      type: "progress";
      pass: CostDisclosurePass;
      message: string;
      current?: number;
      total?: number;
    }
  | { type: "letter_chunk"; text: string }
  | { type: "error"; message: string };
