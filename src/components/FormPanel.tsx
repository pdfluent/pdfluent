// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import { useEffect, useState } from "react";
import type { FieldValue } from "@libpdf/core";
import type { FormFieldDefinition } from "../lib/pdf-manipulator";

interface FormPanelProps {
  fields: FormFieldDefinition[];
  disabled: boolean;
  onUpdateField: (name: string, value: FieldValue) => Promise<void>;
  onAddField: () => Promise<void>;
  onRemoveField: (name: string) => Promise<void>;
}

export function FormPanel({
  fields,
  disabled,
  onUpdateField,
  onAddField,
  onRemoveField,
}: FormPanelProps) {
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};

    for (const field of fields) {
      if (typeof field.value === "string") {
        nextDrafts[field.name] = field.value;
      } else if (Array.isArray(field.value)) {
        nextDrafts[field.name] = field.value.join(", ");
      } else {
        nextDrafts[field.name] = "";
      }
    }

    setTextDrafts(nextDrafts);
  }, [fields]);

  async function submitTextField(name: string): Promise<void> {
    await onUpdateField(name, textDrafts[name] ?? "");
  }

  return (
    <aside className="form-panel">
      <div className="form-panel-header">
        <span>Forms</span>
        <div className="form-panel-header-actions">
          <span className="form-panel-count">{fields.length}</span>
          <button
            type="button"
            className="form-panel-action-button"
            disabled={disabled}
            onClick={() => {
              void onAddField();
            }}
          >
            Add
          </button>
        </div>
      </div>
      <div className="form-panel-content">
        {fields.length === 0 && (
          <div className="form-panel-empty">
            <p>No AcroForm fields detected.</p>
          </div>
        )}

        {fields.map((field) => (
          <div className="form-field-card" key={field.name}>
            <div className="form-field-meta">
              <span className="form-field-name" title={field.name}>
                {field.name}
              </span>
              <div className="form-field-meta-actions">
                <span className="form-field-type">{field.type}</span>
                <button
                  type="button"
                  className="form-panel-remove-field-button"
                  disabled={disabled}
                  onClick={() => {
                    void onRemoveField(field.name);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>

            {field.type === "text" && (
              <input
                className="form-field-input"
                value={textDrafts[field.name] ?? ""}
                onChange={(event) =>
                  setTextDrafts((prev) => ({
                    ...prev,
                    [field.name]: event.target.value,
                  }))
                }
                onBlur={() => {
                  void submitTextField(field.name);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitTextField(field.name);
                  }
                }}
                disabled={disabled}
              />
            )}

            {field.type === "checkbox" && (
              <label className="form-field-checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(field.value)}
                  onChange={(event) => {
                    void onUpdateField(field.name, event.target.checked);
                  }}
                  disabled={disabled}
                />
                <span>Checked</span>
              </label>
            )}

            {field.type === "radio" && (
              <select
                className="form-field-input"
                value={typeof field.value === "string" ? field.value : ""}
                onChange={(event) => {
                  const nextValue = event.target.value || null;
                  void onUpdateField(field.name, nextValue);
                }}
                disabled={disabled}
              >
                <option value="">(none)</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}

            {field.type === "dropdown" && (
              <select
                className="form-field-input"
                value={typeof field.value === "string" ? field.value : ""}
                onChange={(event) => {
                  void onUpdateField(field.name, event.target.value);
                }}
                disabled={disabled}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}

            {field.type === "listbox" && (
              <select
                className="form-field-input form-field-listbox"
                value={Array.isArray(field.value) ? field.value : []}
                multiple
                onChange={(event) => {
                  const selected = Array.from(event.target.selectedOptions).map(
                    (option) => option.value,
                  );
                  void onUpdateField(field.name, selected);
                }}
                disabled={disabled}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
