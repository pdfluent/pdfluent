// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState } from "react";

interface LicenseBannerProps {
  tier: string;
  onActivate: () => void;
}

export function LicenseBanner({ tier, onActivate }: LicenseBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (tier !== "trial" && tier !== "personal") return null;
  if (dismissed) return null;

  return (
    <div className="license-banner">
      <span className="license-banner-text">
        Free for personal, non-commercial use.{" "}
        <button className="license-banner-link" onClick={onActivate}>
          Get a license for commercial use
        </button>
      </span>
      <button
        className="license-banner-dismiss"
        onClick={() => setDismissed(true)}
        title="Dismiss"
      >
        x
      </button>
    </div>
  );
}

export default LicenseBanner;
