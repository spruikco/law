export type ConveyancePass = 1 | 2 | 3;

export type ConveyancePipelineProgress =
  | { type: "status"; status: string }
  | { type: "pass_start"; pass: ConveyancePass; label: string }
  | { type: "pass_done"; pass: ConveyancePass }
  | {
      type: "progress";
      pass: ConveyancePass;
      message: string;
      current?: number;
      total?: number;
    }
  | { type: "letter_chunk"; text: string }
  | { type: "error"; message: string };
