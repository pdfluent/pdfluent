// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// How the form overlay folds the backend's answer to a field write back into
// what it shows. Shared by the AcroForm and the XFA model.
//
// A commit answers with the fields the form's calculations changed. Each
// answer describes the document right after ITS write. Two commits in quick
// succession (qty on blur, price on the next blur) are two answers; if the
// older one lands last, its stale total ("0": price still empty) overwrites
// the newer one ("12"). So writes go through one queue: the backend sees them
// in the order they were made, and their answers are applied in that order.

/** Runs async tasks one after another; a failing task does not stop the next. */
export function createWriteQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T,>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

/**
 * The overlay values after a calculation set `updated`.
 *
 * A field whose live text differs from its last committed value is being typed
 * into right now; the calculation must not take the text away from the person.
 * Its committed baseline still moves, so the next undo entry starts from the
 * calculated value.
 */
export function mergeCalculated<V>(
  values: Record<string, V>,
  committed: Record<string, V>,
  updated: ReadonlyArray<{ name: string; value: V }>,
): { values: Record<string, V>; committed: Record<string, V> } {
  if (updated.length === 0) return { values, committed };
  const nextValues = { ...values };
  const nextCommitted = { ...committed };
  for (const u of updated) {
    const typing = u.name in values && u.name in committed && values[u.name] !== committed[u.name];
    nextCommitted[u.name] = u.value;
    if (!typing) nextValues[u.name] = u.value;
  }
  return { values: nextValues, committed: nextCommitted };
}

/**
 * The overlay values after a full model answer (XFA commit result): the
 * answer's values, except for fields the person has typed into since their
 * last commit, which keep that text.
 */
export function mergeModelValues<V>(
  answer: Record<string, V>,
  values: Record<string, V>,
  committed: Record<string, V>,
): Record<string, V> {
  const out = { ...answer };
  for (const name of Object.keys(values)) {
    if (name in committed && values[name] !== committed[name]) out[name] = values[name] as V;
  }
  return out;
}
