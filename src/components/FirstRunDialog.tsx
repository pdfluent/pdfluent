// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useCallback } from "react";

const FIRST_RUN_KEY = "pdfluent_first_run_complete";
const USAGE_MODE_KEY = "pdfluent_usage_mode";

export type UsageMode = "personal" | "commercial";

export function hasCompletedFirstRun(): boolean {
  return localStorage.getItem(FIRST_RUN_KEY) === "true";
}

export function getUsageMode(): UsageMode {
  return (localStorage.getItem(USAGE_MODE_KEY) as UsageMode) || "personal";
}

interface FirstRunDialogProps {
  onComplete: (mode: UsageMode) => void;
}

export function FirstRunDialog({ onComplete }: FirstRunDialogProps) {
  const [step, setStep] = useState<"choose" | "license">("choose");

  const selectPersonal = useCallback(() => {
    localStorage.setItem(FIRST_RUN_KEY, "true");
    localStorage.setItem(USAGE_MODE_KEY, "personal");
    onComplete("personal");
  }, [onComplete]);

  const selectCommercial = useCallback(() => {
    setStep("license");
  }, []);

  const confirmCommercial = useCallback(() => {
    localStorage.setItem(FIRST_RUN_KEY, "true");
    localStorage.setItem(USAGE_MODE_KEY, "commercial");
    onComplete("commercial");
  }, [onComplete]);

  return (
    <div className="first-run-overlay">
      <div className="first-run-dialog">
        <h1>Welcome to PDFluent</h1>

        {step === "choose" && (
          <>
            <p>How will you be using PDFluent?</p>
            <div className="first-run-options">
              <button className="first-run-option" onClick={selectPersonal}>
                <h3>Personal Use</h3>
                <p>Free for non-commercial use</p>
                <span className="option-detail">
                  Full features with watermark on output
                </span>
              </button>

              <button className="first-run-option" onClick={selectCommercial}>
                <h3>Commercial Use</h3>
                <p>Per-seat license for business</p>
                <span className="option-detail">
                  No watermark, priority support
                </span>
              </button>
            </div>
            <p className="first-run-note">
              You can change this later in Settings.
            </p>
          </>
        )}

        {step === "license" && (
          <>
            <p>
              Commercial use requires a valid license file. You can purchase one
              at pdfluent.com/pricing.
            </p>
            <p>
              You can activate your license now in Settings, or start in
              personal mode and activate later.
            </p>
            <div className="first-run-actions">
              <button className="btn-secondary" onClick={selectPersonal}>
                Start in Personal Mode
              </button>
              <button className="btn-primary" onClick={confirmCommercial}>
                I Have a License
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default FirstRunDialog;
