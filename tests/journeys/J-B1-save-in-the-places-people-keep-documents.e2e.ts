// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-B1: Open, edit, Save, Save As to a new file and Save As over an existing
// one work in every place people keep documents (Documents, Downloads, Desktop,
// a sync folder, a folder with spaces and Unicode in its name), and each result
// opens again with its values.
//
// macOS runs the app inside the store sandbox (J-A3 explains why) and uses
// folders of the work directory named like the real ones: a test that wrote
// into the runner owner's real Documents would raise the system's folder
// prompt on their machine. Windows has no sandbox to run in and does use the
// real folders of the runner's profile, each with a folder of its own that the
// journey removes again, plus the OneDrive folder when the profile has one.

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import * as pdfcheck from './lib/pdfcheck';
import { expectMarked, markDocument, reopenAndVerify } from './lib/savecases';
import { save, saveAs, waitDirty } from './lib/ui';

const ODD_FOLDER = 'Ünïcødé mappen 文件夹 – 2026 (kopie)';

interface Place { label: string; dir: string; cleanup?: string }

/** The places to try. On Windows these are the profile's real folders. */
function places(workFile: (name: string) => string): Place[] {
  const names: Array<[string, string]> = [
    ['Documents', 'Documents'],
    ['Downloads', 'Downloads'],
    ['Desktop', 'Desktop'],
    ['a folder with spaces and Unicode', ODD_FOLDER],
  ];
  if (process.platform !== 'win32') {
    return names.map(([label, folder]) => {
      const dir = workFile(folder);
      mkdirSync(dir, { recursive: true });
      return { label, dir };
    });
  }
  const profile = os.homedir();
  const found: Place[] = [];
  const roots: Array<[string, string]> = [
    ['Documents', path.join(profile, 'Documents')],
    ['Downloads', path.join(profile, 'Downloads')],
    ['Desktop', path.join(profile, 'Desktop')],
  ];
  if (process.env.OneDrive) roots.push(['OneDrive', process.env.OneDrive]);
  for (const [label, root] of roots) {
    if (!existsSync(root)) continue;
    // One folder of our own inside it, removed at the end. The name carries
    // the journey so a leftover says where it came from.
    const own = mkdtempSync(path.join(root, 'pdfluent-journey-J-B1-'));
    found.push({ label, dir: own, cleanup: own });
  }
  const unicode = mkdtempSync(path.join(os.tmpdir(), 'pdfluent-J-B1-'));
  const odd = path.join(unicode, ODD_FOLDER);
  mkdirSync(odd, { recursive: true });
  found.push({ label: 'a folder with spaces and Unicode', dir: odd, cleanup: unicode });
  // A network path (J-24): the machine's own administrative share of the drive
  // the temporary folder is on, reached the way a share is, as \\host\X$\...
  // The save then goes through SMB, where a rename and a lock behave as on a
  // file server. Said and skipped when the share is not reachable here.
  const drive = /^([A-Za-z]):\\(.*)$/.exec(unicode);
  if (drive?.[1] !== undefined && drive[2] !== undefined) {
    const unc = path.join(`\\\\localhost\\${drive[1]}$`, drive[2], ODD_FOLDER);
    if (existsSync(unc)) found.push({ label: 'a network (UNC) path', dir: unc });
    else process.stderr.write(`SKIPPED (not a pass): J-B1 network path, ${unc} is not reachable from this account\n`);
  }
  return found;
}

journey('J-B1', async (j) => {
  const sandbox = process.platform === 'darwin';
  const all = places((name) => j.file(name));
  try {
    for (const place of all) {
      const doc = path.join(place.dir, 'Aanvraag formulier é.pdf');
      const copy = path.join(place.dir, 'Kopie 中文 📄.pdf');
      const taken = path.join(place.dir, 'Bestaat al.pdf');
      pdfcheck.make('make-form', doc);
      copyFileSync(j.fixture('src-tauri/tests/fixtures/two_pages.pdf', `${path.basename(place.dir)}-seed.pdf`), taken);
      const tag = place.label.replace(/[^A-Za-z]/g, '').slice(0, 12);

      await j.start({ open: doc, sandbox });
      await j.step(`${place.label}: Save overwrites the opened file`, async () => {
        await markDocument(j, `${tag}1`);
        await save(j);
        expectMarked(j, doc, `${tag}1`);
      });
      await j.step(`${place.label}: Save As to a new file`, async () => {
        await markDocument(j, `${tag}2`);
        await saveAs(j, copy);
        await waitDirty(j, false, 30_000);
        expectMarked(j, copy, `${tag}2`);
      });
      await j.step(`${place.label}: Save As over an existing file`, async () => {
        await markDocument(j, `${tag}3`);
        await saveAs(j, taken);
        await waitDirty(j, false, 30_000);
        expectMarked(j, taken, `${tag}3`);
      });
      await j.step(`${place.label}: nothing but the three files is left in the folder`, async () => {
        expect(readdirSync(place.dir).sort()).toEqual([path.basename(copy), path.basename(doc), path.basename(taken)].sort());
      });
      await j.step(`${place.label}: all three open again with their values`, async () => {
        await reopenAndVerify(j, doc, `${tag}1`, 1, { sandbox });
        await reopenAndVerify(j, copy, `${tag}2`, 1, { sandbox });
        await reopenAndVerify(j, taken, `${tag}3`, 1, { sandbox });
      });
      await j.stop();
    }
  } finally {
    // Only the folders this journey made itself, by the paths it made them under.
    for (const place of all) if (place.cleanup) rmSync(place.cleanup, { recursive: true, force: true });
  }
}, 1_500_000);
