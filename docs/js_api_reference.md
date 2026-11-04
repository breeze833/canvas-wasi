# JavaScript & TypeScript Host API Reference

This document provides a comprehensive reference for the JavaScript and TypeScript host APIs provided by `canvas-wasi`.

---

## Table of Contents

- [Package Exports & Subpaths](#package-exports--subpaths)
- [`GraphicsWindowUI`](#graphicswindowui)
  - [Constructor & Options](#constructor--options)
  - [Window Lifecycle Methods](#window-lifecycle-methods)
  - [Multi-Window Pop-Out & Docking](#multi-window-pop-out--docking)
  - [Frame Rendering Methods](#frame-rendering-methods)
  - [State & Activity Tracking](#state--activity-tracking)
  - [DOM Structure & Styling](#dom-structure--styling)
- [`InputCoordinator`](#inputcoordinator)
  - [Constructor & Options](#inputcoordinator-options)
  - [Event Binding & Lifecycle](#event-binding--lifecycle)
  - [Coordinate Translation & DPI](#coordinate-translation--dpi)
  - [SharedArrayBuffer Memory Synchronization](#sharedarraybuffer-memory-synchronization)
  - [Linear Memory Polling (`pollToWasm`)](#linear-memory-polling-polltowasm)
  - [Fallback Event Dispatching](#fallback-event-dispatching)
  - [`DOM_KEY_MAP` Constant](#dom_key_map-constant)
- [`createGraphicsImports`](#creategraphicsimports)
  - [Options (`CreateGraphicsImportsOptions`)](#creategraphicsimportsoptions)
  - [Return Value (`GraphicsImportsResult`)](#graphicsimportsresult)
  - [Dual Presentation Pipeline](#dual-presentation-pipeline)
  - [Canvas Buffer Preservation](#canvas-buffer-preservation)
  - [Frame Pacing via Atomics](#frame-pacing-via-atomics)
  - [Manual Fallback Input Routing](#manual-fallback-input-routing)
- [Virtual Headers (`canvas-wasi/headers`)](#virtual-headers-canvas-wasiheaders)

---

## Package Exports & Subpaths

`canvas-wasi` provides standard ES module subpath exports defined in `package.json`:

| Import Path | Exported Symbols | Purpose |
|---|---|---|
| `canvas-wasi` | `CanvasWindow`, `GraphicsWindowUI`, `InputCoordinator`, `DOM_KEY_MAP`, `createGraphicsImports`, `GRAPHICS_H`, `GRAPHICS_CANVAS_H` | Main package bundle containing frontend UI & input (powered by `canvas-window`), host imports, and headers |
| `canvas-wasi/worker` | `createGraphicsImports` | Lightweight export tailored for Web Workers (zero DOM dependencies) |
| `canvas-wasi/headers` | `GRAPHICS_H`, `GRAPHICS_CANVAS_H` | Virtual C header strings for browser virtual filesystems (e.g. `wasm-c-ide`) |
| `canvas-wasi/style.css` | N/A (CSS stylesheet) | Default dark-themed styles for the floating canvas window |

---

## `GraphicsWindowUI`

Class path: `import { GraphicsWindowUI } from 'canvas-wasi'`

`GraphicsWindowUI` manages the interactive floating canvas window in the browser's main thread. It handles draggable headers, resolution and FPS badges, pop-out external browser windows (`window.open`), dock-back restoration, and hardware-accelerated frame presentation.

### Constructor & Options

```typescript
const win = new GraphicsWindowUI(options?: GraphicsWindowUIOptions);
```

#### `GraphicsWindowUIOptions`

```typescript
interface GraphicsWindowUIOptions {
  width?: number;              // Initial width (default: 640)
  height?: number;             // Initial height (default: 480)
  title?: string;              // Initial window title (default: 'Graphics Canvas')
  onCloseRequested?: () => void; // Callback invoked when window close is requested
  onFocusChange?: (focused: boolean) => void; // Callback invoked on canvas focus/blur
  onFrameActivity?: (active: boolean) => void; // Callback for background frame activity
  sharedBuffer?: SharedArrayBuffer | null; // 512-byte buffer for input synchronization
  inputCoordinator?: InputCoordinator | null; // Associated InputCoordinator instance
}
```

---

### Window Lifecycle Methods

#### `win.open(width?, height?, title?)`
```typescript
open(width?: number, height?: number, title?: string): void
```
Opens and displays the floating window.
- Updates canvas resolution (`width`, `height`) and title text if provided.
- Updates the resolution badge (e.g. `640x480`).
- Re-binds the input coordinator to the active canvas and requests focus.

#### `win.close()`
```typescript
close(): void
```
Closes the floating window or popup window.
- Notifies `onCloseRequested` callback.
- Marks `shouldClose` flag in the input coordinator and shared memory.
- Hides `#graphics-window` and resets background activity indicators.

#### `win.focus()`
```typescript
focus(): void
```
Focuses the active canvas element (either the in-page canvas or the external popup canvas) to ensure keyboard events are directed to the application.

#### `win.show()`, `win.hide()`, `win.toggle()`
```typescript
show(): void
hide(): void
toggle(): void
```
Controls the display visibility of the in-page window container.

#### `win.toggleMinimize()`
```typescript
toggleMinimize(): void
```
Toggles compact titlebar-only mode (`.minimized`). When restoring from minimized state, the canvas automatically regains focus.

#### `win.isOpen(): boolean`
Returns `true` if the window is currently open (either in-page or in a popup window).

#### `win.isCanvasVisible(): boolean`
Returns `true` if the canvas is currently visible on screen (open and not minimized).

---

### Multi-Window Pop-Out & Docking

`GraphicsWindowUI` supports detaching the canvas into a standalone external browser window (`window.open`).

#### `win.togglePopOut()`
Toggles between docked in-page mode and detached external popup window mode.

#### `win.popOut()`
Detaches the graphics canvas into an external popup window:
- Opens a dedicated pop-out window with standard features (`menubar=no`, `toolbar=no`).
- Injects a canvas `#graphics-popup-canvas` and docking control button into the popup DOM.
- Dynamically moves `InputCoordinator` event listeners to the popup canvas and popup window target.
- Hides the in-page window placeholder.

#### `win.dockBack()`
Restores the canvas back into the in-page floating window:
- Closes the external popup window.
- Re-binds `InputCoordinator` listeners to the in-page `#graphics-canvas`.
- Restores in-page window visibility and focuses the canvas.

---

### Frame Rendering Methods

#### `win.renderFrame(bitmap)` / `win.renderBitmap(bitmap)`
```typescript
renderFrame(bitmap: ImageBitmap): void
renderBitmap(bitmap: ImageBitmap): void
```
Presents a hardware-accelerated `ImageBitmap` received from the worker:
- Utilizes the high-performance `bitmaprenderer` canvas context (`transferFromImageBitmap(bitmap)`).
- Falls back to 2D context `drawImage(bitmap, 0, 0)` if `bitmaprenderer` is unsupported.
- Closes the bitmap after presentation.
- Tracks frame activity and notifies `onFrameActivity(true)`.

#### `win.renderFrameBuffer(buffer, width, height)`
```typescript
renderFrameBuffer(buffer: ArrayBuffer | ArrayBufferView, width: number, height: number): void
```
Fallback renderer for non-transferable pixel buffers:
- Converts raw RGBA byte buffer into an `ImageData` object.
- Blits to canvas using `ctx.putImageData`.

---

### State & Activity Tracking

#### `win.updateFPS(fps)` / `win.updateFps(fps)`
```typescript
updateFPS(fps: number): void
updateFps(fps: number): void
```
Updates the FPS badge displayed on the window header (e.g. `60 FPS`).

#### `win.setInputCoordinator(inputCoordinator)`
```typescript
setInputCoordinator(inputCoordinator: InputCoordinator): void
```
Associates an `InputCoordinator` with the window, automatically attaching listeners to the currently active canvas.

#### `win.setActivity(active)` / `win.clearActivity()`
```typescript
setActivity(active: boolean): void
clearActivity(): void
```
Updates background frame activity indicators (e.g. pulsating indicators on toolbar buttons when the window is minimized or hidden).

---

### DOM Structure & Styling

When instantiated, `GraphicsWindowUI` injects the following DOM structure into `document.body`:

```html
<div id="graphics-window" class="graphics-window">
  <div class="graphics-header" id="graphics-header">
    <div class="graphics-title">
      <span class="graphics-icon">🎮</span>
      <span id="graphics-title-text">Canvas</span>
      <span class="graphics-badge" id="graphics-res-badge">640x480</span>
      <span class="graphics-badge fps-badge" id="graphics-fps-badge">-- FPS</span>
    </div>
    <div class="graphics-actions">
      <button id="btn-graphics-popout" class="graphics-btn" title="Pop out into separate window">↗</button>
      <button id="btn-graphics-min" class="graphics-btn" title="Minimize">_</button>
      <button id="btn-graphics-close" class="graphics-btn" title="Close">&times;</button>
    </div>
  </div>
  <div class="graphics-body" id="graphics-body">
    <canvas id="graphics-canvas" width="640" height="480" tabindex="0"></canvas>
  </div>
</div>
```

To style the window, import `canvas-wasi/style.css` or provide custom CSS targeting `#graphics-window`.

---

## `InputCoordinator`

Class path: `import { InputCoordinator } from 'canvas-wasi'`

`InputCoordinator` captures mouse, wheel, keyboard, and focus events from active canvases, maps DOM coordinates to render buffer coordinates, and synchronizes state to shared memory or event listeners.

### Constructor & Options

```typescript
const inputCoord = new InputCoordinator(options?: InputCoordinatorOptions);
```

#### `InputCoordinatorOptions`

```typescript
interface InputCoordinatorOptions {
  sharedBuffer?: SharedArrayBuffer | null; // 512-byte shared buffer
  canvas?: HTMLCanvasElement | null;       // Canvas element to attach immediately
  width?: number;                          // Initial render width (default: 640)
  height?: number;                         // Initial render height (default: 480)
  dpiScale?: number;                        // Display scale factor (default: window.devicePixelRatio)
}
```

---

### Event Binding & Lifecycle

#### `inputCoord.attachListeners(canvas, windowTarget?)`
```typescript
attachListeners(canvas: HTMLCanvasElement, windowTarget?: Window | null): void
```
Binds event listeners to the target canvas and window:
- **Mouse**: `mousemove`, `mousedown`, `mouseup`, `wheel`, `contextmenu`.
- **Keyboard**: `keydown`, `keyup` (captured on canvas and `windowTarget`).
- **Focus**: `focus`, `blur` (resets pressed keys when canvas loses focus).

#### `inputCoord.detach()`
```typescript
detach(): void
```
Removes all registered DOM event listeners.

#### `inputCoord.reset()`
```typescript
reset(): void
```
Clears all active keys down, mouse buttons, and scroll deltas, updating shared memory.

---

### Coordinate Translation & DPI

`InputCoordinator` automatically converts DOM viewport coordinates (`clientX`, `clientY`) into canvas pixel space ($0 \le x < \text{renderWidth}$ and $0 \le y < \text{renderHeight}$), taking into account CSS layout scaling and retina/HiDPR ratios:

$$\text{scaleX} = \frac{\text{renderWidth}}{\text{rect.width}}, \quad \text{scaleY} = \frac{\text{renderHeight}}{\text{rect.height}}$$
$$\text{mouseX} = (\text{clientX} - \text{rect.left}) \times \text{scaleX}$$
$$\text{mouseY} = (\text{clientY} - \text{rect.top}) \times \text{scaleY}$$

---

### SharedArrayBuffer Memory Synchronization

When initialized with a 512-byte `SharedArrayBuffer`, `inputCoord.updateSharedState()` serializes all input parameters with zero latency using a `DataView` with little-endian encoding.

#### 512-Byte Memory Layout

| Offset (Bytes) | Type | Field Name | Description |
|---|---|---|---|
| `0 .. 3` | `int32` | `windowWidth` | Display window logical width in pixels |
| `4 .. 7` | `int32` | `windowHeight` | Display window logical height in pixels |
| `8 .. 11` | `int32` | `renderWidth` | Canvas render buffer width in pixels |
| `12 .. 15` | `int32` | `renderHeight` | Canvas render buffer height in pixels |
| `16 .. 19` | `float32` | `dpiScale` | Device pixel ratio / display scaling |
| `20 .. 23` | `int32` | `shouldClose` | `1` if close requested or ESC pressed; else `0` |
| `24 .. 27` | `float32` | `mouseX` | Render buffer mouse X coordinate |
| `28 .. 31` | `float32` | `mouseY` | Render buffer mouse Y coordinate |
| `32 .. 35` | `float32` | `mouseWheelX` | Horizontal scroll delta |
| `36 .. 39` | `float32` | `mouseWheelY` | Vertical scroll delta |
| `40 .. 43` | `uint32` | `mouseButtons` | Button mask: Bit 0=Left, Bit 1=Right, Bit 2=Middle |
| `44 .. 107` | `uint32[16]` | `keysDown` | 512-bit bitmask of active virtual keycodes |
| `108 .. 111` | `int32` | `keyPressedCount` | Number of queued key press events (max 32) |
| `112 .. 239` | `int32[32]`| `keyPressedQueue` | Queue of virtual keycodes pressed since last poll |
| `240 .. 243` | `int32` | `charPressedCount`| Number of queued Unicode characters (max 32) |
| `244 .. 371` | `int32[32]`| `charPressedQueue`| Queue of Unicode codepoints typed since last poll |
| `372 .. 375` | `int32` | `frameSyncWord` | Synchronization word for `Atomics.wait()` frame pacing |
| `376 .. 511` | `uint8[136]`| `reserved` | Reserved for future extensions |

---

### Linear Memory Polling (`pollToWasm`)

```typescript
inputCoord.pollToWasm(destPtr: number, mem: WebAssembly.Memory): void
```
For standalone or non-threaded runtimes where the WebAssembly instance directly reads input from its own linear memory:
- Copies 372 bytes of active input state directly to `destPtr` in `mem.buffer`.
- Automatically resets transient deltas (`mouseWheelX`, `mouseWheelY`, `keyPressedQueue`, `charPressedQueue`).

---

### Fallback Event Dispatching

```typescript
const unsubscribe = inputCoord.addListener((event) => {
  // Handle event when SharedArrayBuffer is unavailable
  worker.postMessage({ type: 'input_event', event });
});
```
Registers an event listener callback for environments without cross-origin isolation.

---

### `DOM_KEY_MAP` Constant

`DOM_KEY_MAP` maps standard `KeyboardEvent.code` values (e.g. `'KeyW'`, `'ArrowUp'`, `'Space'`) to virtual keycodes matching the standard `DOM_KEY_MAP` table.

```javascript
import { DOM_KEY_MAP } from 'canvas-wasi';

console.log(DOM_KEY_MAP['KeyA']);   // 65
console.log(DOM_KEY_MAP['Escape']); // 256
console.log(DOM_KEY_MAP['Space']);  // 32
```

---

## `createGraphicsImports`

Function path: `import { createGraphicsImports } from 'canvas-wasi/worker'` (or `canvas-wasi`)

`createGraphicsImports` provides the WebAssembly host imports satisfying all C functions declared in `<graphics.h>` and `<graphics_canvas.h>`. It manages the rasterizer context, frame pacing, string decoding from linear memory, and frame delivery.

### `CreateGraphicsImportsOptions`

```typescript
interface CreateGraphicsImportsOptions {
  getMemory?: () => WebAssembly.Memory | null; // Accessor for Wasm linear memory
  memory?: WebAssembly.Memory | null;           // Direct Wasm memory instance
  sharedBuffer?: SharedArrayBuffer | null;      // 512-byte input & sync buffer
  inputCoordinator?: InputCoordinator | null;   // Direct InputCoordinator (if main thread)
  postMessage?: (msg: any, transfer?: Transferable[]) => void; // Worker postMessage
  onInit?: (data: { width: number; height: number; title: string }) => void;
  onFrame?: (bitmap: ImageBitmap) => void;
  onFrameBuffer?: (buffer: ArrayBuffer, width: number, height: number) => void;
  onFps?: (fps: number) => void;
  onClose?: () => void;
  width?: number;                               // Default width (default: 640)
  height?: number;                              // Default height (default: 480)
  offscreenCanvas?: OffscreenCanvas | null;     // Custom OffscreenCanvas instance
}
```

---

### `GraphicsImportsResult`

```typescript
interface GraphicsImportsResult {
  graphics: Record<string, Function>;       // software framebuffer functions
  canvas: Record<string, Function>;         // 2D vector canvas functions
  env: Record<string, Function>;            // Combined imports ready for WebAssembly.instantiate
  handleInputEvent: (event: any) => void;  // Ingest input event in fallback mode
}
```

Pass `imports.env` directly into `WebAssembly.instantiate`:

```javascript
let wasmMemory;
const imports = createGraphicsImports({
  getMemory: () => wasmMemory,
  sharedBuffer: sharedInputBuffer,
  postMessage: self.postMessage.bind(self)
});

const instance = await WebAssembly.instantiate(module, {
  env: imports.env
});
wasmMemory = instance.exports.memory;
```

---

### Dual Presentation Pipeline

1. **Hardware-Accelerated `ImageBitmap` (Default)**:
   - Synchronously converts offscreen canvas to `ImageBitmap` via `transferToImageBitmap()`.
   - Transferred zero-copy via `postMessage({ type: 'frame', bitmap }, [bitmap])` to the main thread.
2. **Transferable `ArrayBuffer` (Fallback)**:
   - If `ImageBitmap` is unavailable, slices the linear memory framebuffer into an `ArrayBuffer` and transfers it via `postMessage({ type: 'frame_buffer', buffer, width, height }, [buffer])`.

---

### Canvas Buffer Preservation

Standard `OffscreenCanvas.transferToImageBitmap()` detaches and empties the drawing surface. For 2D vector applications using `<graphics_canvas.h>`, erasing the surface would prevent incremental drawing.

`createGraphicsImports` solves this by maintaining an internal **`cloneCanvas`**:
- When `canvas_present()` is invoked, it blits `offscreen2d` onto `cloneCanvas`.
- It transfers the bitmap from `cloneCanvas`, completely preserving the content of `offscreen2d` for subsequent frames.

---

### Frame Pacing via Atomics

When `graphics_wait_frame(target_fps)` is called in C:
- If `sharedBuffer` is available, `createGraphicsImports` reads the synchronization word (`frameSyncWord` at byte offset 372).
- It invokes `Atomics.wait(syncWord, 0, 0, waitMs)` to suspend the worker thread efficiently without spinning.
- The average FPS is calculated over 1-second intervals and reported via `onFps(fps)` or `postMessage({ type: 'fps', fps })`.

---

### Manual Fallback Input Routing

When `SharedArrayBuffer` is disabled:

```javascript
// On worker receiving message from main thread
self.onmessage = (e) => {
  if (e.data.type === 'input_event') {
    imports.handleInputEvent(e.data.event);
  }
};
```

Supports:
- `{ type: 'mouse', x, y, buttons, wheel }`
- `{ type: 'keydown', key }`
- `{ type: 'keyup', key }`

---

## Virtual Headers (`canvas-wasi/headers`)

For browser-based compiler playgrounds (such as [wasm-c-ide](https://github.com/breeze833/wasm-c-ide)), `canvas-wasi/headers` exports the exact string contents of the C headers to mount into virtual filesystems:

```javascript
import { GRAPHICS_H, GRAPHICS_CANVAS_H } from 'canvas-wasi/headers';

// Mount into browser Virtual File System (VFS):
vfs.writeFile('/usr/include/graphics.h', GRAPHICS_H);
vfs.writeFile('/usr/include/graphics_canvas.h', GRAPHICS_CANVAS_H);
```

These constants are guaranteed to remain byte-for-byte identical with `include/graphics.h` and `include/graphics_canvas.h`.
