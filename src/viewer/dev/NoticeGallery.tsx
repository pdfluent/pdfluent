// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { ReactNode } from 'react';
import { FormBar } from '../components/FormBar';
import { ScriptConsentBar } from '../components/ScriptConsentBar';
import { UpdateBanner } from '../components/UpdateBanner';
import { OpenErrorPanel } from '../components/OpenErrorPanel';
import { AppErrorToast, ShellToast, TextEditRejectionNotice, XfaBanner } from '../components/Notices';
import { RecoveryDialog } from '../components/RecoveryDialog';
import { PasswordPromptDialog } from '../components/PasswordPromptDialog';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';
import { SignedSaveDialog } from '../components/SignedSaveDialog';
import { TextEditFloatingPill } from '../components/TextEditFloatingPill';
import { makeAppError } from '../state/errorCenter';
import type { TextMutationRejection } from '../text/textMutationMessaging';

/**
 * Dev-only page (`/?notice-gallery`, add `&theme=dark` for dark): every document
 * notice and toast mounted in the real components, on the document canvas, so
 * the Playwright contrast gate (tests/e2e/notice-contrast.spec.ts) can scan each
 * one in both themes. A notice reachable only through a rare document state
 * would otherwise never be measured. main.tsx imports this behind
 * `import.meta.env.DEV`, so it is not in a production build.
 */

const noop = (): void => undefined;

function Slot({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section data-testid={`gallery-${id}`} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {children}
    </section>
  );
}

const REJECTION = {
  tooltip: 'This text uses a font that cannot be edited in place.',
  explanation: 'Replace the font first, or edit the text as an annotation.',
  code: 'FONT_NOT_EMBEDDED',
} as unknown as TextMutationRejection;

export type GalleryDialog = 'recovery' | 'password' | 'password-retry' | 'unsaved' | 'signed';

function GalleryDialogs({ which }: { which: GalleryDialog | null }) {
  switch (which) {
    case 'recovery':
      return <RecoveryDialog isOpen recoveryPath="/tmp/recovery.pdf" originalFileName="report.pdf" timestamp="20-10-2026 16:50" onRecover={noop} onDiscard={noop} onClose={noop} />;
    case 'password':
    case 'password-retry':
      return <PasswordPromptDialog request={{ fileName: 'report.pdf', retry: which === 'password-retry' }} onSubmit={noop} onCancel={noop} />;
    case 'unsaved':
      return <UnsavedChangesDialog isOpen canSave onSave={noop} onDiscard={noop} onCancel={noop} documentName="report.pdf" />;
    case 'signed':
      return <SignedSaveDialog isOpen onSaveCopy={noop} onCancel={noop} />;
    default:
      return null;
  }
}

export function NoticeGallery({ dark, dialog = null }: { dark: boolean; dialog?: GalleryDialog | null }) {
  return (
    <>
    <div className={dark ? 'pfv3 theme-dark' : 'pfv3'} data-testid="notice-gallery" style={{ minHeight: '100vh' }}>
      <div className="canvas" style={{ padding: 16, minHeight: '100vh' }}>
        <Slot id="script-consent">
          <ScriptConsentBar status={{ total: 3, javascript: 2, acroform: 0, formcalc: 1 }} busy={false} alwaysAvailable onRunOnce={noop} onRunAlways={noop} onDontRun={noop} />
        </Slot>
        <Slot id="script-consent-busy">
          <ScriptConsentBar status={{ total: 3, javascript: 2, acroform: 0, formcalc: 1 }} busy alwaysAvailable={false} onRunOnce={noop} onRunAlways={noop} onDontRun={noop} />
        </Slot>
        <Slot id="form-bar">
          <FormBar fieldCount={12} highlight onToggleHighlight={noop} onJumpToFirst={noop} autoOpenLinks onToggleAutoOpenLinks={noop} />
        </Slot>
        <Slot id="xfa">
          <XfaBanner fillExperimental={false} flattenError={null} busy={false} onConvert={noop} onDismiss={noop} />
        </Slot>
        <Slot id="xfa-error">
          <XfaBanner fillExperimental flattenError="The form could not be converted." busy onConvert={noop} onDismiss={noop} />
        </Slot>
        <Slot id="update">
          <UpdateBanner isVisible version="1.2.0" installing={false} installed={false} restartHint={null} onInstall={noop} onRestart={noop} onDismiss={noop} />
        </Slot>
        <Slot id="update-installed">
          <UpdateBanner isVisible version={null} installing={false} installed restartHint="unsaved" onInstall={noop} onRestart={noop} onDismiss={noop} />
        </Slot>
        <Slot id="text-edit-rejection">
          <TextEditRejectionNotice rejection={REJECTION} className="pf-notice-static" onDismiss={noop} />
        </Slot>
        <Slot id="app-error">
          <AppErrorToast error={makeAppError('error', 'Export failed', 'The file could not be written.', 'export')} onDismiss={noop} />
        </Slot>
        <Slot id="app-warning">
          <AppErrorToast error={makeAppError('warning', 'Saved with fewer changes', 'One edit could not be kept.', 'export')} onDismiss={noop} />
        </Slot>
        <Slot id="open-error">
          <OpenErrorPanel code="open.encrypted_needs_password" onOpenAnother={noop} onRetry={noop} />
        </Slot>
        <Slot id="toast">
          <ShellToast message="Saved" className="pf-notice-static" />
        </Slot>
        <Slot id="edit-pill">
          {/* A page is white paper in both themes; the pill sits on it. */}
          <div style={{ position: 'relative', width: 520, height: 90, background: '#ffffff' }}>
            <TextEditFloatingPill
              isBold
              isItalic={false}
              isUnderline={false}
              isStrikethrough={false}
              fontSize={12}
              onBold={noop}
              onItalic={noop}
              onUnderline={noop}
              onStrikethrough={noop}
              onCommit={noop}
              onCancel={noop}
              editingParagraphBounds={{ x: 40, y: 700, width: 400, height: 40 }}
              pageHeightPt={842}
              zoom={1}
            />
          </div>
        </Slot>
      </div>
    </div>
    <GalleryDialogs which={dialog} />
    </>
  );
}
