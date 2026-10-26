// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Settings: the crash reports and feedback reports this computer sent, each
// with a button that deletes them from the server. The tokens live in local
// storage (src/lib/telemetry/localCrashReports.ts, src/lib/feedback/
// localReports.ts); nothing is requested until the user presses a button.

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CRASH_REPORT_RETENTION_DAYS,
  readLocalCrashReports,
} from '../../lib/telemetry/localCrashReports';
import { removeAllCrashReports } from '../../lib/telemetry/report';
import { FEEDBACK_RETENTION_DAYS, removeAllFeedback } from '../../lib/feedback/feedback';
import { readLocalReports } from '../../lib/feedback/localReports';

type Outcome = { removed: number; failed: number } | null;

interface BlockProps {
  testId: string;
  read: () => number;
  removeAll: () => Promise<{ removed: number; failed: number }>;
  days: number;
  keys: { sent: string; button: string; done: string; failed: string };
}

function SentReportsBlock({ testId, read, removeAll, days, keys }: BlockProps) {
  const { t } = useTranslation();
  const [count, setCount] = useState(read);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const remove = useCallback(async () => {
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(await removeAll());
    } finally {
      setCount(read());
      setBusy(false);
    }
  }, [removeAll, read]);

  return (
    <div data-testid={`${testId}-sent`}>
      <p className="settings-help-text" data-testid={`${testId}-sent-count`}>
        {t(keys.sent, { count, days })}
      </p>
      <button
        type="button"
        data-testid={`${testId}-delete-btn`}
        disabled={busy || count === 0}
        onClick={() => void remove()}
      >
        {busy ? t('telemetry.settingsDeleting') : t(keys.button)}
      </button>
      {outcome && outcome.removed > 0 && (
        <p className="settings-help-text" role="status" data-testid={`${testId}-delete-done`}>
          {t(keys.done, { count: outcome.removed })}
        </p>
      )}
      {outcome && outcome.failed > 0 && (
        <p className="settings-help-text" role="alert" data-testid={`${testId}-delete-failed`}>
          {t(keys.failed, { count: outcome.failed })}
        </p>
      )}
    </div>
  );
}

const readCrash = (): number => readLocalCrashReports().length;
const readFeedback = (): number => readLocalReports().length;
const removeCrash = () => removeAllCrashReports({ userRequested: true });
const removeFeedbackReports = () => removeAllFeedback({ userRequested: true });

export function SentCrashReports() {
  return (
    <>
      <SentReportsBlock
        testId="settings-crash"
        read={readCrash}
        removeAll={removeCrash}
        days={CRASH_REPORT_RETENTION_DAYS}
        keys={{
          sent: 'telemetry.settingsSentReports',
          button: 'telemetry.settingsDeleteReports',
          done: 'telemetry.settingsDeleted',
          failed: 'telemetry.settingsDeleteFailed',
        }}
      />
      <SentReportsBlock
        testId="settings-feedback"
        read={readFeedback}
        removeAll={removeFeedbackReports}
        days={FEEDBACK_RETENTION_DAYS}
        keys={{
          sent: 'telemetry.settingsSentFeedback',
          button: 'telemetry.settingsDeleteFeedback',
          done: 'telemetry.settingsFeedbackDeleted',
          failed: 'telemetry.settingsFeedbackDeleteFailed',
        }}
      />
    </>
  );
}
