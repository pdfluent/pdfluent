// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
// Photographing the app window on macOS and Windows, at a size that is
// asked for and then checked. A screenshot at the wrong size is refused,
// never rescaled: a rescaled screenshot is a lie about the app (see
// store/mas/screenshots/SCREENSHOTS.md for the same rule on the MAS set).
//
// macOS   size in points; the capture is backing-store pixels, so a 1440x900
//         window on a 2x display is a 2880x1800 PNG. Needs Screen Recording
//         and Accessibility for the terminal that runs the suite.
// Windows size in physical pixels (see window-shot.ps1). Needs an interactive
//         desktop session, ideally a 3840x2160 display at 200 %.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export interface Size { w: number; h: number }

/** PDFLUENT_SHOT_SIZE=WxH, or the platform default. */
export function windowSize(): Size {
  const v = process.env.PDFLUENT_SHOT_SIZE;
  if (v) {
    const m = v.match(/^(\d+)x(\d+)$/);
    if (!m) throw new Error(`PDFLUENT_SHOT_SIZE=${v}: expected WxH, e.g. 1440x900`);
    return { w: Number(m[1]), h: Number(m[2]) };
  }
  return process.platform === 'darwin' ? { w: 1440, h: 900 } : { w: 3200, h: 1800 };
}

/** Pixel size of a PNG, from its IHDR chunk. */
export function pngSize(file: string): Size {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

/** Put the app's window at the capture size. */
export function fitWindow(pid: number, size: Size): void {
  if (process.platform === 'darwin') {
    // y=38 clears the menu bar; a window cannot sit under it.
    run('osascript', ['-e', [
      'tell application "System Events"',
      `set p to first process whose unix id is ${pid}`,
      'set frontmost of p to true',
      `set position of window 1 of p to {0, 38}`,
      `set size of window 1 of p to {${size.w}, ${size.h}}`,
      'end tell',
    ].join('\n')]);
  } else {
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(HERE, 'window-shot.ps1'),
      '-Pid', String(pid), '-Width', String(size.w), '-Height', String(size.h)]);
  }
}

/** Photograph the window to `out` and return the PNG's pixel size. */
export function shootWindow(pid: number, out: string): Size {
  if (process.platform === 'darwin') {
    const wid = run('python3', [path.join(HERE, 'window-id-by-pid.py'), String(pid)]);
    // -l: the window itself, so nothing floating above it lands in the picture;
    // -o: no drop shadow; -x: no shutter sound.
    run('screencapture', ['-x', '-o', '-l', wid, out]);
  } else {
    const s = windowSize();
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(HERE, 'window-shot.ps1'),
      '-Pid', String(pid), '-Width', String(s.w), '-Height', String(s.h), '-Out', out]);
  }
  return pngSize(out);
}
