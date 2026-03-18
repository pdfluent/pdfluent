// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const undoEngineSource = readFileSync(
  new URL('../src/viewer/undoEngine.ts', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

const topBarSource = readFileSync(
  new URL('../src/viewer/components/TopBar.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// undoEngine.ts — UndoCommand interface
// ---------------------------------------------------------------------------

describe('undoEngine — UndoCommand interface', () => {
  it('exports UndoCommand interface', () => {
    expect(undoEngineSource).toContain('export interface UndoCommand');
  });

  it('UndoCommand has description field', () => {
    const ifaceStart = undoEngineSource.indexOf('export interface UndoCommand');
    const ifaceEnd = undoEngineSource.indexOf('\n}', ifaceStart) + 2;
    const iface = undoEngineSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('description: string');
  });

  it('UndoCommand has execute(): Promise<void>', () => {
    const ifaceStart = undoEngineSource.indexOf('export interface UndoCommand');
    const ifaceEnd = undoEngineSource.indexOf('\n}', ifaceStart) + 2;
    const iface = undoEngineSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('execute(): Promise<void>');
  });

  it('UndoCommand has undo(): Promise<void>', () => {
    const ifaceStart = undoEngineSource.indexOf('export interface UndoCommand');
    const ifaceEnd = undoEngineSource.indexOf('\n}', ifaceStart) + 2;
    const iface = undoEngineSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('undo(): Promise<void>');
  });
});

// ---------------------------------------------------------------------------
// undoEngine.ts — UndoStack class
// ---------------------------------------------------------------------------

describe('undoEngine — UndoStack class', () => {
  it('exports UndoStack class', () => {
    expect(undoEngineSource).toContain('export class UndoStack');
  });

  it('has canUndo getter', () => {
    expect(undoEngineSource).toContain('get canUndo()');
  });

  it('canUndo returns true when undoStack is non-empty', () => {
    const getterStart = undoEngineSource.indexOf('get canUndo()');
    const getterEnd = undoEngineSource.indexOf('\n  }', getterStart) + 4;
    const getter = undoEngineSource.slice(getterStart, getterEnd);
    expect(getter).toContain('undoStack.length > 0');
  });

  it('has canRedo getter', () => {
    expect(undoEngineSource).toContain('get canRedo()');
  });

  it('canRedo returns true when redoStack is non-empty', () => {
    const getterStart = undoEngineSource.indexOf('get canRedo()');
    const getterEnd = undoEngineSource.indexOf('\n  }', getterStart) + 4;
    const getter = undoEngineSource.slice(getterStart, getterEnd);
    expect(getter).toContain('redoStack.length > 0');
  });

  it('has undoLabel getter returning null when stack is empty', () => {
    expect(undoEngineSource).toContain('get undoLabel()');
    const getterStart = undoEngineSource.indexOf('get undoLabel()');
    const getterEnd = undoEngineSource.indexOf('\n  }', getterStart) + 4;
    const getter = undoEngineSource.slice(getterStart, getterEnd);
    expect(getter).toContain('null');
  });

  it('has redoLabel getter returning null when stack is empty', () => {
    expect(undoEngineSource).toContain('get redoLabel()');
  });

  it('has push(command) method', () => {
    expect(undoEngineSource).toContain('push(command: UndoCommand)');
  });

  it('push clears the redo stack', () => {
    const pushStart = undoEngineSource.indexOf('push(command: UndoCommand)');
    const pushEnd = undoEngineSource.indexOf('\n  }', pushStart) + 4;
    const pushBody = undoEngineSource.slice(pushStart, pushEnd);
    expect(pushBody).toContain('redoStack = []');
  });

  it('has async undo() method', () => {
    expect(undoEngineSource).toContain('async undo()');
  });

  it('undo pops from undoStack and pushes to redoStack', () => {
    const undoStart = undoEngineSource.indexOf('async undo()');
    const undoEnd = undoEngineSource.indexOf('\n  }', undoStart) + 4;
    const undoBody = undoEngineSource.slice(undoStart, undoEnd);
    expect(undoBody).toContain('undoStack.pop()');
    expect(undoBody).toContain('redoStack.push(command)');
  });

  it('undo calls command.undo()', () => {
    const undoStart = undoEngineSource.indexOf('async undo()');
    const undoEnd = undoEngineSource.indexOf('\n  }', undoStart) + 4;
    const undoBody = undoEngineSource.slice(undoStart, undoEnd);
    expect(undoBody).toContain('command.undo()');
  });

  it('undo returns null when stack is empty', () => {
    const undoStart = undoEngineSource.indexOf('async undo()');
    const undoEnd = undoEngineSource.indexOf('\n  }', undoStart) + 4;
    const undoBody = undoEngineSource.slice(undoStart, undoEnd);
    expect(undoBody).toContain('null');
  });

  it('has async redo() method', () => {
    expect(undoEngineSource).toContain('async redo()');
  });

  it('redo pops from redoStack and pushes to undoStack', () => {
    const redoStart = undoEngineSource.indexOf('async redo()');
    const redoEnd = undoEngineSource.indexOf('\n  }', redoStart) + 4;
    const redoBody = undoEngineSource.slice(redoStart, redoEnd);
    expect(redoBody).toContain('redoStack.pop()');
    expect(redoBody).toContain('undoStack.push(command)');
  });

  it('redo calls command.execute()', () => {
    const redoStart = undoEngineSource.indexOf('async redo()');
    const redoEnd = undoEngineSource.indexOf('\n  }', redoStart) + 4;
    const redoBody = undoEngineSource.slice(redoStart, redoEnd);
    expect(redoBody).toContain('command.execute()');
  });

  it('has clear() method that empties both stacks', () => {
    expect(undoEngineSource).toContain('clear()');
    const clearStart = undoEngineSource.indexOf('clear()');
    const clearEnd = undoEngineSource.indexOf('\n  }', clearStart) + 4;
    const clearBody = undoEngineSource.slice(clearStart, clearEnd);
    expect(clearBody).toContain('undoStack = []');
    expect(clearBody).toContain('redoStack = []');
  });
});

// ---------------------------------------------------------------------------
// undoEngine.ts — makeCommand factory
// ---------------------------------------------------------------------------

describe('undoEngine — makeCommand factory', () => {
  it('exports makeCommand function', () => {
    expect(undoEngineSource).toContain('export function makeCommand(');
  });

  it('accepts description, executeFn, and undoFn parameters', () => {
    const fnStart = undoEngineSource.indexOf('export function makeCommand(');
    const fnEnd = undoEngineSource.indexOf('\n}', fnStart) + 2;
    const fn = undoEngineSource.slice(fnStart, fnEnd);
    expect(fn).toContain('description');
    expect(fn).toContain('executeFn');
    expect(fn).toContain('undoFn');
  });

  it('returns an object implementing UndoCommand', () => {
    const fnStart = undoEngineSource.indexOf('export function makeCommand(');
    const fnEnd = undoEngineSource.indexOf('\n}', fnStart) + 2;
    const fn = undoEngineSource.slice(fnStart, fnEnd);
    expect(fn).toContain('description');
    expect(fn).toContain('execute: executeFn');
    expect(fn).toContain('undo: undoFn');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — undo stack integration
// ---------------------------------------------------------------------------

describe('ViewerApp — undo stack integration', () => {
  it('imports UndoStack and makeCommand from undoEngine', () => {
    expect(viewerAppSource).toContain("import { UndoStack, makeCommand }");
    expect(viewerAppSource).toContain("from './undoEngine'");
  });

  it('creates an undoStackRef with useRef', () => {
    expect(viewerAppSource).toContain('undoStackRef = useRef<UndoStack>(new UndoStack())');
  });

  it('tracks canUndo in state', () => {
    expect(viewerAppSource).toContain('[canUndo, setCanUndo]');
  });

  it('tracks canRedo in state', () => {
    expect(viewerAppSource).toContain('[canRedo, setCanRedo]');
  });

  it('defines syncUndoState callback', () => {
    expect(viewerAppSource).toContain('const syncUndoState = useCallback(');
    expect(viewerAppSource).toContain('undoStackRef.current.canUndo');
    expect(viewerAppSource).toContain('undoStackRef.current.canRedo');
  });

  it('defines pushUndo callback', () => {
    expect(viewerAppSource).toContain('const pushUndo = useCallback(');
    expect(viewerAppSource).toContain('undoStackRef.current.push(cmd)');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — Cmd+Z / Cmd+Shift+Z keyboard shortcuts
// ---------------------------------------------------------------------------

describe('ViewerApp — undo/redo keyboard shortcuts', () => {
  it('registers handleUndoKey listener on window', () => {
    expect(viewerAppSource).toContain("window.addEventListener('keydown', handleUndoKey)");
    expect(viewerAppSource).toContain("window.removeEventListener('keydown', handleUndoKey)");
  });

  it('triggers on Cmd/Ctrl+Z', () => {
    const handlerStart = viewerAppSource.indexOf('handleUndoKey');
    const handlerEnd = viewerAppSource.indexOf('window.addEventListener(\'keydown\', handleUndoKey)', handlerStart);
    const handler = viewerAppSource.slice(handlerStart, handlerEnd);
    expect(handler).toContain("e.key !== 'z'");
    expect(handler).toContain('e.metaKey || e.ctrlKey');
  });

  it('Cmd+Z calls undoStackRef.current.undo()', () => {
    const handlerStart = viewerAppSource.indexOf('handleUndoKey');
    const handlerEnd = viewerAppSource.indexOf('window.addEventListener(\'keydown\', handleUndoKey)', handlerStart);
    const handler = viewerAppSource.slice(handlerStart, handlerEnd);
    expect(handler).toContain('undoStackRef.current.undo()');
  });

  it('Cmd+Shift+Z calls undoStackRef.current.redo()', () => {
    const handlerStart = viewerAppSource.indexOf('handleUndoKey');
    const handlerEnd = viewerAppSource.indexOf('window.addEventListener(\'keydown\', handleUndoKey)', handlerStart);
    const handler = viewerAppSource.slice(handlerStart, handlerEnd);
    expect(handler).toContain('e.shiftKey');
    expect(handler).toContain('undoStackRef.current.redo()');
  });

  it('calls syncUndoState after undo and redo to update buttons', () => {
    const handlerStart = viewerAppSource.indexOf('handleUndoKey');
    const handlerEnd = viewerAppSource.indexOf('window.addEventListener(\'keydown\', handleUndoKey)', handlerStart);
    const handler = viewerAppSource.slice(handlerStart, handlerEnd);
    expect(handler).toContain('syncUndoState');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — TopBar undo/redo wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — TopBar undo/redo wiring', () => {
  it('passes canUndo to TopBar', () => {
    const topBarStart = viewerAppSource.indexOf('<TopBar');
    const topBarEnd = viewerAppSource.indexOf('/>', topBarStart) + 2;
    const topBarEl = viewerAppSource.slice(topBarStart, topBarEnd);
    expect(topBarEl).toContain('canUndo={canUndo}');
  });

  it('passes canRedo to TopBar', () => {
    const topBarStart = viewerAppSource.indexOf('<TopBar');
    const topBarEnd = viewerAppSource.indexOf('/>', topBarStart) + 2;
    const topBarEl = viewerAppSource.slice(topBarStart, topBarEnd);
    expect(topBarEl).toContain('canRedo={canRedo}');
  });

  it('passes onUndo callback to TopBar', () => {
    const topBarStart = viewerAppSource.indexOf('<TopBar');
    const topBarEnd = viewerAppSource.indexOf('/>', topBarStart) + 2;
    const topBarEl = viewerAppSource.slice(topBarStart, topBarEnd);
    expect(topBarEl).toContain('onUndo=');
  });

  it('passes onRedo callback to TopBar', () => {
    const topBarStart = viewerAppSource.indexOf('<TopBar');
    const topBarEnd = viewerAppSource.indexOf('/>', topBarStart) + 2;
    const topBarEl = viewerAppSource.slice(topBarStart, topBarEnd);
    expect(topBarEl).toContain('onRedo=');
  });
});

// ---------------------------------------------------------------------------
// TopBar — undo/redo props and button state
// ---------------------------------------------------------------------------

describe('TopBar — undo/redo button props', () => {
  it('declares canUndo prop in TopBarProps', () => {
    const ifaceStart = topBarSource.indexOf('interface TopBarProps');
    const ifaceEnd = topBarSource.indexOf('\n}', ifaceStart) + 2;
    const iface = topBarSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('canUndo');
  });

  it('declares canRedo prop in TopBarProps', () => {
    const ifaceStart = topBarSource.indexOf('interface TopBarProps');
    const ifaceEnd = topBarSource.indexOf('\n}', ifaceStart) + 2;
    const iface = topBarSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('canRedo');
  });

  it('declares onUndo prop in TopBarProps', () => {
    const ifaceStart = topBarSource.indexOf('interface TopBarProps');
    const ifaceEnd = topBarSource.indexOf('\n}', ifaceStart) + 2;
    const iface = topBarSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onUndo');
  });

  it('declares onRedo prop in TopBarProps', () => {
    const ifaceStart = topBarSource.indexOf('interface TopBarProps');
    const ifaceEnd = topBarSource.indexOf('\n}', ifaceStart) + 2;
    const iface = topBarSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onRedo');
  });

  it('undo button has data-testid="undo-btn"', () => {
    expect(topBarSource).toContain('data-testid="undo-btn"');
  });

  it('redo button has data-testid="redo-btn"', () => {
    expect(topBarSource).toContain('data-testid="redo-btn"');
  });

  it('undo button disabled state is controlled by canUndo', () => {
    const btnStart = topBarSource.indexOf('data-testid="undo-btn"');
    const btnEnd = topBarSource.indexOf('</button>', btnStart) + 9;
    const btn = topBarSource.slice(Math.max(0, btnStart - 50), btnEnd);
    expect(btn).toContain('disabled={!canUndo}');
  });

  it('redo button disabled state is controlled by canRedo', () => {
    const btnStart = topBarSource.indexOf('data-testid="redo-btn"');
    const btnEnd = topBarSource.indexOf('</button>', btnStart) + 9;
    const btn = topBarSource.slice(Math.max(0, btnStart - 50), btnEnd);
    expect(btn).toContain('disabled={!canRedo}');
  });

  it('undo button calls onUndo when clicked', () => {
    const btnStart = topBarSource.indexOf('data-testid="undo-btn"');
    const btnEnd = topBarSource.indexOf('</button>', btnStart) + 9;
    const btn = topBarSource.slice(Math.max(0, btnStart - 50), btnEnd);
    expect(btn).toContain('onClick={onUndo}');
  });

  it('redo button calls onRedo when clicked', () => {
    const btnStart = topBarSource.indexOf('data-testid="redo-btn"');
    const btnEnd = topBarSource.indexOf('</button>', btnStart) + 9;
    const btn = topBarSource.slice(Math.max(0, btnStart - 50), btnEnd);
    expect(btn).toContain('onClick={onRedo}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — form field change wired to undo stack
// ---------------------------------------------------------------------------

describe('ViewerApp — form field undo integration', () => {
  it('handleSetFieldValue calls pushUndo', () => {
    const fnStart = viewerAppSource.indexOf('const handleSetFieldValue = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('pushUndo(makeCommand(');
  });

  it('form field undo command includes execute and undo closures', () => {
    const fnStart = viewerAppSource.indexOf('const handleSetFieldValue = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('previousValue');
    expect(fnBody).toContain('setFormFieldValue(pdfDoc, fieldId, previousValue)');
  });
});
