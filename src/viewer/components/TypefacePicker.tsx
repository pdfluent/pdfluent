// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The edit panel's typeface picker: the fonts installed on this computer,
// grouped by family. A face whose licence forbids embedding it in a PDF is
// listed but cannot be chosen, and says why.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listSystemFonts, type SystemFontFamily } from '../text/typeface';

interface Props {
  /** `SystemFontFace.id` of the chosen face; null keeps the document's own font. */
  value: string | null;
  onChange: (fontId: string | null) => void;
}

const DOCUMENT_FONT = '__document__';

export function TypefacePicker({ value, onChange }: Props) {
  const [families, setFamilies] = useState<SystemFontFamily[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    listSystemFonts().then(
      list => { if (live) setFamilies(list); },
      () => { if (live) setFailed(true); },
    );
    return () => { live = false; };
  }, []);

  return <TypefaceSelect families={families} disabled={failed} value={value} onChange={onChange} />;
}

/** The markup alone, so it can be rendered with a fixed list. */
export function TypefaceSelect({ families, disabled, value, onChange }: Props & { families: SystemFontFamily[] | null; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    // data-testid: the inline editor keeps editing while focus moves into
    // this panel (TextInlineEditor.handleBlur); outside it, choosing a font
    // would commit and close the edit.
    <label className="select-wrap" data-testid="text-properties-panel">
      <span className="sr-only">{t('edit.typeface.label')}</span>
      <select
        className="select native-select"
        data-testid="edit-typeface"
        value={value ?? DOCUMENT_FONT}
        disabled={families === null || disabled}
        onChange={event => onChange(event.target.value === DOCUMENT_FONT ? null : event.target.value)}
      >
        <option value={DOCUMENT_FONT}>{t('edit.typeface.default')}</option>
        {(families ?? []).map(({ family, faces }) => (
          <optgroup key={family} label={family}>
            {faces.map(face => (
              <option
                key={face.id}
                value={face.id}
                disabled={!face.embeddable}
                title={face.embeddable ? undefined : t('edit.typeface.noEmbed', { family })}
              >
                {face.embeddable ? face.style : `${face.style} (${t('edit.typeface.noEmbed', { family })})`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
