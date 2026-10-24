// canvas-wasi: Keyboard, Mouse, and Touch Input Coordinator with SharedArrayBuffer support

export const DOM_KEY_MAP = {
  KeyA: 65, KeyB: 66, KeyC: 67, KeyD: 68, KeyE: 69, KeyF: 70, KeyG: 71,
  KeyH: 72, KeyI: 73, KeyJ: 74, KeyK: 75, KeyL: 76, KeyM: 77, KeyN: 78,
  KeyO: 79, KeyP: 80, KeyQ: 81, KeyR: 82, KeyS: 83, KeyT: 84, KeyU: 85,
  KeyV: 86, KeyW: 87, KeyX: 88, KeyY: 89, KeyZ: 90,

  Digit0: 48, Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52,
  Digit5: 53, Digit6: 54, Digit7: 55, Digit8: 56, Digit9: 57,

  Space: 32, Escape: 256, Enter: 257, Tab: 258, Backspace: 259,
  Insert: 260, Delete: 261, ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265,
  PageUp: 266, PageDown: 267, Home: 268, End: 269,
  CapsLock: 280, ScrollLock: 281, NumLock: 282, PrintScreen: 283, Pause: 284,

  F1: 290, F2: 291, F3: 292, F4: 293, F5: 294, F6: 295,
  F7: 296, F8: 297, F9: 298, F10: 299, F11: 300, F12: 301,

  ShiftLeft: 340, ControlLeft: 341, AltLeft: 342, MetaLeft: 343,
  ShiftRight: 344, ControlRight: 345, AltRight: 346, MetaRight: 347,
  ContextMenu: 348,

  Semicolon: 59, Equal: 61, Comma: 44, Minus: 45, Period: 46, Slash: 47,
  Backquote: 96, BracketLeft: 91, Backslash: 92, BracketRight: 93, Quote: 39,

  Numpad0: 320, Numpad1: 321, Numpad2: 322, Numpad3: 323, Numpad4: 324,
  Numpad5: 325, Numpad6: 326, Numpad7: 327, Numpad8: 328, Numpad9: 329,
  NumpadDecimal: 330, NumpadDivide: 331, NumpadMultiply: 332,
  NumpadSubtract: 333, NumpadAdd: 334, NumpadEnter: 335, NumpadEqual: 336
};

export class InputCoordinator {
  constructor(options = {}) {
    this.sharedBuffer = options.sharedBuffer || null;
    this.canvas = options.canvas || null;

    this.windowWidth = options.width || 800;
    this.windowHeight = options.height || 450;
    this.renderWidth = options.width || 800;
    this.renderHeight = options.height || 450;
    this.dpiScale = options.dpiScale || 1.0;
    this.shouldClose = false;

    this.mouseX = -1;
    this.mouseY = -1;
    this.mouseWheelX = 0;
    this.mouseWheelY = 0;
    this.mouseButtons = 0;

    this.keysDown = new Uint32Array(16); // 512 bits
    this.keyPressedQueue = [];
    this.charPressedQueue = [];
    this.listeners = new Set();
    this.cleanupFn = null;

    if (this.sharedBuffer) {
      this.sharedView = new DataView(this.sharedBuffer);
      this.sharedU8 = new Uint8Array(this.sharedBuffer);
      this.syncWord = new Int32Array(this.sharedBuffer, 372, 1);
    }

    if (this.canvas && typeof this.canvas.addEventListener === 'function') {
      this.attachListeners(this.canvas);
    }
  }

  addListener(fn) {
    if (typeof fn === 'function') {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    return () => {};
  }

  notifyListeners(event) {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch (_) {}
    }
  }

  detach() {
    if (typeof this.cleanupFn === 'function') {
      this.cleanupFn();
      this.cleanupFn = null;
    }
  }

  attachListeners(canvas, windowTarget = null) {
    this.detach();

    if (!canvas || typeof canvas.addEventListener !== 'function') return;

    const getCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (rect.width || 1);
      const scaleY = canvas.height / (rect.height || 1);
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    const onMouseMove = (e) => {
      const pos = getCoords(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      if (typeof e.buttons === 'number') {
        this.mouseButtons = e.buttons;
      }
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
    };

    const onMouseDown = (e) => {
      if (typeof e.buttons === 'number' && e.buttons > 0) {
        this.mouseButtons = e.buttons;
      } else {
        const bit = e.button === 0 ? 1 : (e.button === 2 ? 2 : (e.button === 1 ? 4 : 0));
        this.mouseButtons |= bit;
      }
      const pos = getCoords(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
    };

    const onMouseUp = (e) => {
      if (typeof e.buttons === 'number') {
        this.mouseButtons = e.buttons;
      } else {
        const bit = e.button === 0 ? 1 : (e.button === 2 ? 2 : (e.button === 1 ? 4 : 0));
        this.mouseButtons &= ~bit;
      }
      const pos = getCoords(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
    };

    const onMouseLeave = () => {
      this.mouseX = -1;
      this.mouseY = -1;
      this.mouseButtons = 0;
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: -1, y: -1, buttons: 0, wheel: this.mouseWheelY });
    };

    const onWheel = (e) => {
      this.mouseWheelX += (e.deltaX > 0 ? 1 : (e.deltaX < 0 ? -1 : 0));
      this.mouseWheelY += (e.deltaY > 0 ? -1 : (e.deltaY < 0 ? 1 : 0));
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
      e.preventDefault();
    };

    const onContextMenu = (e) => e.preventDefault();

    const onKeyDown = (e) => {
      if (e.target && e.target.id === 'btn-dock') return;
      const key = DOM_KEY_MAP[e.code] || e.keyCode;
      if (key >= 0 && key < 512) {
        const word = Math.floor(key / 32);
        const bit = key % 32;
        this.keysDown[word] |= (1 << bit);
        if (this.keyPressedQueue.length < 32) {
          this.keyPressedQueue.push(key);
        }
      }
      if (e.key && e.key.length === 1) {
        const cp = e.key.codePointAt(0);
        if (cp && this.charPressedQueue.length < 32) {
          this.charPressedQueue.push(cp);
        }
      }
      if (e.code === 'Escape') {
        this.shouldClose = true;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
      }
      this.updateSharedState();
      this.notifyListeners({ type: 'keydown', key, code: e.code });
    };

    const onKeyUp = (e) => {
      if (e.target && e.target.id === 'btn-dock') return;
      const key = DOM_KEY_MAP[e.code] || e.keyCode;
      if (key >= 0 && key < 512) {
        const word = Math.floor(key / 32);
        const bit = key % 32;
        this.keysDown[word] &= ~(1 << bit);
      }
      this.updateSharedState();
      this.notifyListeners({ type: 'keyup', key, code: e.code });
    };

    const onBlur = () => {
      this.keysDown.fill(0);
      this.mouseButtons = 0;
      this.updateSharedState();
      this.notifyListeners({ type: 'blur' });
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    const keyTarget = windowTarget || canvas;
    const mouseUpTarget = windowTarget || canvas;

    mouseUpTarget.addEventListener('mouseup', onMouseUp);
    keyTarget.addEventListener('keydown', onKeyDown);
    keyTarget.addEventListener('keyup', onKeyUp);
    keyTarget.addEventListener('blur', onBlur);

    this.cleanupFn = () => {
      if (typeof canvas.removeEventListener === 'function') {
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mouseleave', onMouseLeave);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('contextmenu', onContextMenu);
      }
      if (typeof mouseUpTarget.removeEventListener === 'function') {
        mouseUpTarget.removeEventListener('mouseup', onMouseUp);
      }
      if (typeof keyTarget.removeEventListener === 'function') {
        keyTarget.removeEventListener('keydown', onKeyDown);
        keyTarget.removeEventListener('keyup', onKeyUp);
        keyTarget.removeEventListener('blur', onBlur);
      }
    };
  }

  reset() {
    this.shouldClose = false;
    this.mouseX = -1;
    this.mouseY = -1;
    this.mouseButtons = 0;
    this.mouseWheelX = 0;
    this.mouseWheelY = 0;
    this.keysDown.fill(0);
    this.keyPressedQueue.length = 0;
    this.charPressedQueue.length = 0;

    if (this.sharedBuffer) {
      this.sharedU8.fill(0);
      this.updateSharedState();
    }
  }

  updateSharedState() {
    if (!this.sharedView) return;
    const v = this.sharedView;
    v.setInt32(0, this.windowWidth, true);
    v.setInt32(4, this.windowHeight, true);
    v.setInt32(8, this.renderWidth, true);
    v.setInt32(12, this.renderHeight, true);
    v.setFloat32(16, this.dpiScale, true);
    v.setInt32(20, this.shouldClose ? 1 : 0, true);

    v.setFloat32(24, this.mouseX, true);
    v.setFloat32(28, this.mouseY, true);
    v.setFloat32(32, this.mouseWheelX, true);
    v.setFloat32(36, this.mouseWheelY, true);
    v.setUint32(40, this.mouseButtons, true);

    for (let i = 0; i < 16; i++) {
      v.setUint32(44 + i * 4, this.keysDown[i], true);
    }

    const kCount = Math.min(this.keyPressedQueue.length, 32);
    v.setInt32(108, kCount, true);
    for (let i = 0; i < kCount; i++) {
      v.setInt32(112 + i * 4, this.keyPressedQueue[i], true);
    }

    const cCount = Math.min(this.charPressedQueue.length, 32);
    v.setInt32(240, cCount, true);
    for (let i = 0; i < cCount; i++) {
      v.setInt32(244 + i * 4, this.charPressedQueue[i], true);
    }
  }

  // Poll state synchronously into Wasm linear memory (used by rcore_wasi or direct wasm callers)
  pollToWasm(destPtr, mem) {
    if (this.sharedBuffer) {
      const destU8 = new Uint8Array(mem.buffer, destPtr, 372);
      destU8.set(this.sharedU8.subarray(0, 372));
      this.sharedView.setFloat32(32, 0, true);
      this.sharedView.setFloat32(36, 0, true);
      this.sharedView.setInt32(108, 0, true);
      this.sharedView.setInt32(240, 0, true);
      return;
    }

    const view = new DataView(mem.buffer, destPtr, 372);
    view.setInt32(0, this.windowWidth, true);
    view.setInt32(4, this.windowHeight, true);
    view.setInt32(8, this.renderWidth, true);
    view.setInt32(12, this.renderHeight, true);
    view.setFloat32(16, this.dpiScale, true);
    view.setInt32(20, this.shouldClose ? 1 : 0, true);

    view.setFloat32(24, this.mouseX, true);
    view.setFloat32(28, this.mouseY, true);
    view.setFloat32(32, this.mouseWheelX, true);
    view.setFloat32(36, this.mouseWheelY, true);
    view.setUint32(40, this.mouseButtons, true);

    for (let i = 0; i < 16; i++) {
      view.setUint32(44 + i * 4, this.keysDown[i], true);
    }

    const kCount = Math.min(this.keyPressedQueue.length, 32);
    view.setInt32(108, kCount, true);
    for (let i = 0; i < kCount; i++) {
      view.setInt32(112 + i * 4, this.keyPressedQueue[i], true);
    }
    this.keyPressedQueue.length = 0;

    const cCount = Math.min(this.charPressedQueue.length, 32);
    view.setInt32(240, cCount, true);
    for (let i = 0; i < cCount; i++) {
      view.setInt32(244 + i * 4, this.charPressedQueue[i], true);
    }
    this.charPressedQueue.length = 0;
  }
}
