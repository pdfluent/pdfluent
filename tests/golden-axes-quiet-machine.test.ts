// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const AXES = readFileSync(join(ROOT, "src-tauri/tests/golden_axes.rs"), "utf8");

// The build host shares four cores with a second CI runner. On 2026-09-08 the
// same ~700 ms of someone else's work landed on xfa-bd91fbf7_pdf_0010 in one run
// ([965.8, 944.6, 965.0, 1030.7, 1010.3]) and on xfa-e2bb8995_eimm5669e.2 in the
// next ([1031.4, 1058.8, 1042.9, 654.3, 364.0], the shape of a neighbour
// finishing mid-measurement). Each document is fast in the run where the other
// is slow, and the first of those readings had already been blessed as a floor.
//
// `a_busy_machine_is_not_measured_on` in golden_axes.rs covers the rule itself.
// This covers the wiring, which is the half that goes missing: a rule nothing
// calls is a rule that does not exist.
describe("the speed axes are measured on a quiet machine", () => {
  it("waits for the machine before it times anything", () => {
    const test = AXES.slice(AXES.indexOf("fn golden_axes_writes_a_run_file"));
    const waited = test.indexOf("wait_until_quiet()");
    const measured = test.indexOf("measure_save(");
    expect(waited, "nothing waits for the machine to settle any more").toBeGreaterThan(-1);
    expect(measured).toBeGreaterThan(-1);
    expect(
      waited,
      "the wait happens after the first measurement, which measures the load it was meant to avoid",
    ).toBeLessThan(measured);
  });

  it("refuses instead of publishing a number the load produced", () => {
    expect(AXES).toContain("SKIPPED (not a pass): the machine did not settle");
  });

  // A run without the load it was taken under cannot be told from a
  // contaminated one afterwards, which is how the 965 ms floor was blessed.
  it("records the load beside every run, quiet or not", () => {
    expect(AXES).toContain('\\"load_1min\\": {}');
  });
});
