// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The picture picker behind "Place image" and "Replace image" (J-45). The open
// panel is opened from Rust, like every other file pick in the app: a driver
// can answer it (an <input type=file> made in the page cannot be answered, and
// detached from the document it may lose its change event in WKWebView), and
// the file's type is judged on its bytes there.

export type PickImageInvoke = (command: 'pick_image_dialog') => Promise<string | null>;

async function bridgeInvoke(command: 'pick_image_dialog'): Promise<string | null> {
  const { invokeCommand } = await import('../../lib/commandBridge');
  return invokeCommand<string | null>(command);
}

/**
 * Ask the user for a PNG or JPEG and return it as a data URL; null when they
 * cancel or the file is refused. A refusal has already reached the person
 * through the error stack (invokeCommand reports every failed command), so it
 * is not repeated here.
 */
export async function pickImage(invoke: PickImageInvoke = bridgeInvoke): Promise<string | null> {
  try {
    return await invoke('pick_image_dialog');
  } catch {
    return null;
  }
}
