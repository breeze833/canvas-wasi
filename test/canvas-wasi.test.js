// test/canvas-wasi.test.js
// Standalone unit tests for canvas-wasi

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GRAPHICS_H,
  GRAPHICS_CANVAS_H
} from '../src/headers.js';

import {
  InputCoordinator,
  DOM_KEY_MAP
} from '../src/input/input-coordinator.js';

import {
  createGraphicsImports
} from '../src/host/graphics-imports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('--- Running canvas-wasi Test Suite ---');

// Test 1: Verify Header Constants and Include Files
const incGraphicsH = fs.readFileSync(path.join(__dirname, '../include/graphics.h'), 'utf8');
const incCanvasH = fs.readFileSync(path.join(__dirname, '../include/graphics_canvas.h'), 'utf8');

assert.strictEqual(GRAPHICS_H.trim(), incGraphicsH.trim(), 'graphics.h string constant must match include/graphics.h');
assert.strictEqual(GRAPHICS_CANVAS_H.trim(), incCanvasH.trim(), 'graphics_canvas.h string constant must match include/graphics_canvas.h');

// Verify key C function signatures
const expectedGraphicsFuncs = [
  'graphics_init',
  'graphics_present',
  'graphics_present_rgba',
  'graphics_should_close',
  'graphics_close',
  'graphics_wait_frame',
  'graphics_get_mouse',
  'graphics_is_key_down'
];

for (const fn of expectedGraphicsFuncs) {
  assert.strictEqual(GRAPHICS_H.includes(fn), true, `graphics.h must declare ${fn}`);
}

const expectedCanvasFuncs = [
  'canvas_present',
  'canvas_clear_rect',
  'canvas_fill_rect',
  'canvas_stroke_rect',
  'canvas_begin_path',
  'canvas_close_path',
  'canvas_move_to',
  'canvas_line_to',
  'canvas_arc',
  'canvas_fill',
  'canvas_stroke',
  'canvas_set_fill_style',
  'canvas_set_stroke_style',
  'canvas_set_font',
  'canvas_save',
  'canvas_restore'
];

for (const fn of expectedCanvasFuncs) {
  assert.strictEqual(GRAPHICS_CANVAS_H.includes(fn), true, `graphics_canvas.h must declare ${fn}`);
}
console.log('✓ C headers and string constants verified');

// Test 2: InputCoordinator and SharedArrayBuffer Synchronization
const sharedBuf = new SharedArrayBuffer(512);
const coord = new InputCoordinator({
  sharedBuffer: sharedBuf,
  width: 640,
  height: 480
});

// Setup mock canvas
const listeners = new Map();
const mockCanvas = {
  width: 640,
  height: 480,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }),
  addEventListener: (name, fn) => listeners.set(name, fn),
  removeEventListener: (name) => listeners.delete(name)
};

coord.attachListeners(mockCanvas);

// Simulate mouse move
const moveFn = listeners.get('mousemove');
assert.strictEqual(typeof moveFn, 'function', 'mousemove listener must be registered');
moveFn({ clientX: 120, clientY: 80, buttons: 1 });

const sView = new DataView(sharedBuf);
assert.strictEqual(Math.round(sView.getFloat32(24, true)), 120, 'Shared buffer mouseX must be 120');
assert.strictEqual(Math.round(sView.getFloat32(28, true)), 80, 'Shared buffer mouseY must be 80');
assert.strictEqual(sView.getUint32(40, true), 1, 'Shared buffer mouseButtons must be 1 (left button)');

// Simulate keydown (Space = 32)
const keydownFn = listeners.get('keydown');
assert.strictEqual(typeof keydownFn, 'function', 'keydown listener must be registered');
keydownFn({ code: 'Space', keyCode: 32, preventDefault() {} });

// Key 32 -> word 1, bit 0
const keyWord1 = sView.getUint32(44 + 4, true);
assert.strictEqual((keyWord1 & 1), 1, 'Key 32 (Space) must be set in keymask word 1');

// Simulate pollToWasm
const wasmMem = { buffer: new ArrayBuffer(1024) };
coord.pollToWasm(0, wasmMem);
const wasmView = new DataView(wasmMem.buffer);
assert.strictEqual(wasmView.getInt32(0, true), 640, 'pollToWasm must serialize windowWidth');
assert.strictEqual(wasmView.getInt32(4, true), 480, 'pollToWasm must serialize windowHeight');
assert.strictEqual(Math.round(wasmView.getFloat32(24, true)), 120, 'pollToWasm must serialize mouseX');
assert.strictEqual(Math.round(wasmView.getFloat32(28, true)), 80, 'pollToWasm must serialize mouseY');

console.log('✓ InputCoordinator and SharedArrayBuffer synchronization verified');

// Test 3: createGraphicsImports Host Provider
let frameDelivered = false;
let initDelivered = false;
let closeDelivered = false;

const wasmMemoryInstance = new WebAssembly.Memory({ initial: 1, maximum: 2 });
const imports = createGraphicsImports({
  getMemory: () => wasmMemoryInstance,
  sharedBuffer: sharedBuf,
  onInit: (info) => {
    initDelivered = true;
    assert.strictEqual(info.width, 320);
    assert.strictEqual(info.height, 240);
  },
  onFrame: () => {
    frameDelivered = true;
  },
  onFrameBuffer: (buf, w, h) => {
    frameDelivered = true;
    assert.strictEqual(w, 320);
    assert.strictEqual(h, 240);
  },
  onClose: () => {
    closeDelivered = true;
  }
});

assert.strictEqual(typeof imports.graphics.graphics_init, 'function');
assert.strictEqual(typeof imports.graphics.graphics_present, 'function');
assert.strictEqual(typeof imports.graphics.graphics_get_mouse, 'function');
assert.strictEqual(typeof imports.graphics.graphics_is_key_down, 'function');
assert.strictEqual(typeof imports.canvas.canvas_fill_rect, 'function');
assert.strictEqual(typeof imports.canvas.canvas_present, 'function');

// Call graphics_init
imports.graphics.graphics_init(320, 240, 0);
assert.strictEqual(initDelivered, true, 'graphics_init must trigger onInit callback');

// Call graphics_present
imports.graphics.graphics_present(1024);
assert.strictEqual(frameDelivered, true, 'graphics_present must deliver frame');

// Call graphics_is_key_down
assert.strictEqual(imports.graphics.graphics_is_key_down(32), 1, 'Key 32 (Space) must be down');
assert.strictEqual(imports.graphics.graphics_is_key_down(65), 0, 'Key 65 (A) must be up');

// Call graphics_get_mouse into wasm memory
const xPtr = 200;
const yPtr = 204;
const btnPtr = 208;
const wheelPtr = 212;
imports.graphics.graphics_get_mouse(xPtr, yPtr, btnPtr, wheelPtr);

const memView = new DataView(wasmMemoryInstance.buffer);
assert.strictEqual(memView.getInt32(xPtr, true), 120, 'graphics_get_mouse wrote x correctly');
assert.strictEqual(memView.getInt32(yPtr, true), 80, 'graphics_get_mouse wrote y correctly');
assert.strictEqual(memView.getUint32(btnPtr, true), 1, 'graphics_get_mouse wrote buttons correctly');

// Call graphics_close
imports.graphics.graphics_close();
assert.strictEqual(closeDelivered, true, 'graphics_close must trigger onClose callback');

console.log('✓ createGraphicsImports WebAssembly host bindings verified');

// Test 4: GraphicsWindowUI Mock DOM Lifecycle
function createMockEl(tag, id = '') {
  return {
    tagName: tag.toUpperCase(),
    id,
    className: '',
    style: {},
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    },
    children: [],
    innerHTML: '',
    textContent: '',
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel) {
      if (sel.startsWith('#')) return createMockEl('div', sel.slice(1));
      return createMockEl('div');
    },
    getContext(type) {
      return { type, transferFromImageBitmap() {}, drawImage() {}, putImageData() {} };
    },
    focus() {}
  };
}

globalThis.document = {
  body: createMockEl('body'),
  getElementById(id) { return createMockEl('div', id); },
  createElement(tag) { return createMockEl(tag); }
};

const { GraphicsWindowUI } = await import('../src/ui/graphics-window.js');
const win = new GraphicsWindowUI({ width: 640, height: 480, title: 'Test Window' });
assert.strictEqual(win.isOpen(), false, 'Window should initially be closed');
win.open(640, 480, 'Test Window');
assert.strictEqual(win.isOpen(), true, 'Window should be open after win.open()');
win.toggleMinimize();
assert.strictEqual(win.isMinimized, true, 'Window should be minimized');
win.toggleMinimize();
assert.strictEqual(win.isMinimized, false, 'Window should be restored');
win.close();
assert.strictEqual(win.isOpen(), false, 'Window should be closed after win.close()');

console.log('✓ GraphicsWindowUI DOM lifecycle verified');
console.log('--- All canvas-wasi tests passed successfully! ---');
