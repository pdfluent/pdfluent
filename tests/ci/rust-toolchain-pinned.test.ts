// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The toolchain pin rule on in-memory inputs. Mutation to check this is not
// vacuous: accept "stable", or ignore a workflow `toolchain:` input, and a case
// here goes red.
import { describe, expect, it } from "vitest";
// @ts-expect-error — a plain .mjs script with no type declarations
import { check } from "../../scripts/ci/rust-toolchain-pinned.mjs";

const toml = (c: string) => `[toolchain]\nchannel = "${c}"\n`;
const file = (text: string) => [{ name: "w.yml", text }];

describe("rust-toolchain-pinned", () => {
  it("passes an exact pin with no override", () => {
    expect(check({ toml: toml("1.99.1"), files: file("- run: cargo clippy") })).toEqual([]);
  });
  it("refuses a missing file", () => {
    expect(check({ toml: null, files: [] })).toHaveLength(1);
  });
  it("refuses a moving channel", () => {
    for (const c of ["stable", "beta", "nightly"]) expect(check({ toml: toml(c), files: [] })).toHaveLength(1);
  });
  it("accepts a dated nightly", () => {
    expect(check({ toml: toml("nightly-2026-10-23"), files: [] })).toEqual([]);
  });
  it("refuses a workflow that selects another toolchain", () => {
    for (const l of ["toolchain: stable", "run: rustup default nightly", "run: cargo +nightly clippy", "run: rustup component add clippy --toolchain stable", "run: rustup run stable cargo test"]) {
      expect(check({ toml: toml("1.99.1"), files: file(l) }).length).toBe(1);
    }
  });
  it("allows a workflow that names the pinned version", () => {
    expect(check({ toml: toml("1.99.1"), files: file("toolchain: 1.99.1") })).toEqual([]);
  });
  it("ignores comments", () => {
    expect(check({ toml: toml("1.99.1"), files: file("# toolchain: stable") })).toEqual([]);
  });
});
