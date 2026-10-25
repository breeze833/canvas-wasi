# SPEC.md: Technical Specification for `canvas-wasi`

`canvas-wasi` is a zero-dependency, modular C graphics and windowing subsystem for WebAssembly and WASI runtimes in the browser. It provides:
1. Direct software framebuffer pixel manipulation (`<graphics.h>`).
2. Hardware-accelerated HTML5 Canvas 2D vector primitives (`<graphics_canvas.h>`).
3. Low-latency synchronous mouse/keyboard input via a 512-byte `SharedArrayBuffer` memory protocol or fallback event listener routing.
4. An interactive draggable, resizable, minimizable, and pop-out floating window UI.

---

## 1. Architecture Overview

`canvas-wasi` operates on a decoupled multi-tier architecture separating the user interface, the input coordinator, the execution runtime (Web Worker or main thread), and the compiled C/C++ WebAssembly instance.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Main Browser Thread                             │
│                                                                        │
│   ┌───────────────────────────┐      ┌──────────────────────────────┐  │
│   │     GraphicsWindowUI      │      │       InputCoordinator       │  │
│   │                           │      │                              │  │
│   │  - In-Page Floating Window│      │  - DOM Mouse/Wheel Listeners │  │
│   │  - External Popup Window  │◄────►│  - DOM Keyboard Keymap       │  │
│   │  - ImageBitmap Renderer   │      │  - Touch Coordinates         │  │
│   │  - FPS & Resolution Badge │      │  - ShouldClose State         │  │
│   └─────────────▲─────────────┘      └──────────────┬───────────────┘  │
└─────────────────┼───────────────────────────────────┼──────────────────┘
                  │ postMessage (ImageBitmap / msg)   │ 512-byte SharedArrayBuffer
┌─────────────────┼───────────────────────────────────┼──────────────────┐
│                 │                                   ▼                  │
│   ┌─────────────┴─────────────┐      ┌──────────────────────────────┐  │
│   │      createGraphicsImports│      │      Shared Memory View      │  │
│   │                           │      │                              │  │
│   │  - OffscreenCanvas 2D Ctx │      │  - Synchronous Atomics Wait  │  │
│   │  - Canvas Clone Buffer    │      │  - Zero-Copy Mouse/Key Polling│ │
│   │  - Frame Pacing & Timing  │      │  - ESC / Window Close Flag   │  │
│   │  - Pixel Buffer Packing   │      │  - Linear Mem pollToWasm     │  │
│   └─────────────▲─────────────┘      └──────────────┬───────────────┘  │
│                 │ WebAssembly Imports (env)         │                  │
│   ┌─────────────┴───────────────────────────────────▼──────────────┐  │
│   │                    WebAssembly Instance (WASI)                 │  │
│   │                                                                │  │
│   │  Compiled C/C++ User Program using <graphics.h> or             │  │
│   │  <graphics_canvas.h> with Clang/LLVM, Emscripten, or TinyCC   │  │
│   └────────────────────────────────────────────────────────────────┘  │
│                         Web Worker Thread                              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. C API Bindings

### 2.1 Software Framebuffer API (`<graphics.h>`)

Mounted at `/usr/include/graphics.h` or passed as a system include directory. Zero external linker flags required.

```c
#ifndef _GRAPHICS_H
#define _GRAPHICS_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Initialize graphics canvas window with given dimensions and title */
void graphics_init(int width, int height, const char *title);

/* Present a 32-bit RGBA pixel framebuffer (width * height * 4 bytes) */
void graphics_present(const uint32_t *pixels);

/* Present a raw RGBA byte buffer with custom dimensions */
void graphics_present_rgba(const uint8_t *rgba, int width, int height);

/* Returns true if the user closed the window or pressed Escape */
bool graphics_should_close(void);

/* Request closing the graphics window */
void graphics_close(void);

/* Synchronize frame pacing with target FPS (sleeps remainder of frame) */
void graphics_wait_frame(int target_fps);

/* Read current mouse coordinates, button bitmask, and wheel delta */
void graphics_get_mouse(int *x, int *y, int *buttons, int *wheel);

/* Inspect active keyboard key state (ASCII or standard keycode) */
bool graphics_is_key_down(int key);

#ifdef __cplusplus
}
#endif

#endif /* _GRAPHICS_H */
```

#### Framebuffer Pixel Layout
`graphics_present(const uint32_t *pixels)` expects pixels in little-endian 32-bit `0xAABBGGRR` format (Byte 0: Red, Byte 1: Green, Byte 2: Blue, Byte 3: Alpha).

```c
static inline uint32_t make_rgba(uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
    return ((uint32_t)a << 24) | ((uint32_t)b << 16) | ((uint32_t)g << 8) | (uint32_t)r;
}
```

---

### 2.2 HTML5 Canvas 2D Vector API (`<graphics_canvas.h>`)

Includes `<graphics.h>` and provides high-level 2D vector drawing primitives backed by an `OffscreenCanvas` 2D context (`CanvasRenderingContext2D`).

```c
#ifndef _GRAPHICS_CANVAS_H
#define _GRAPHICS_CANVAS_H

#include <graphics.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* --- Frame Swapping --- */
void canvas_present(void);

/* --- Rectangles & Clearing --- */
void canvas_clear_rect(float x, float y, float w, float h);
void canvas_fill_rect(float x, float y, float w, float h);
void canvas_stroke_rect(float x, float y, float w, float h);

/* --- Path Drawing --- */
void canvas_begin_path(void);
void canvas_close_path(void);
void canvas_move_to(float x, float y);
void canvas_line_to(float x, float y);
void canvas_arc(float x, float y, float radius, float start_angle, float end_angle, bool counterclockwise);
void canvas_fill(void);
void canvas_stroke(void);

/* --- Styles & Colors --- */
void canvas_set_fill_style(const char *style);
void canvas_set_stroke_style(const char *style);
void canvas_set_fill_rgb(uint8_t r, uint8_t g, uint8_t b);
void canvas_set_line_width(float width);
void canvas_set_line_cap(const char *cap);

/* --- Text Rendering --- */
void canvas_fill_text(const char *text, float x, float y);
void canvas_stroke_text(const char *text, float x, float y);
void canvas_set_font(const char *font);

/* --- Transformations & State --- */
void canvas_save(void);
void canvas_restore(void);
void canvas_translate(float x, float y);
void canvas_rotate(float radians);
void canvas_scale(float sx, float sy);

/* --- Pixel-Level Manipulation & Framebuffer Interop --- */
void canvas_get_image_data(int sx, int sy, int sw, int sh, uint32_t *pixels_out);
void canvas_put_image_data(int dx, int dy, int dw, int dh, const uint32_t *pixels_in);
void canvas_get_pixels(uint32_t *pixels_out);
void canvas_put_pixels(const uint32_t *pixels_in);
uint32_t canvas_get_pixel(int x, int y);
void canvas_set_pixel(int x, int y, uint32_t color);

#ifdef __cplusplus
}
#endif

#endif /* _GRAPHICS_CANVAS_H */
```

---

## 3. Input Memory Map & Synchronization

### 3.1 SharedArrayBuffer Memory Map (512 Bytes)

When running in cross-origin isolated contexts (`window.crossOriginIsolated === true`), a dedicated 512-byte `SharedArrayBuffer` coordinates input state between the main thread UI and Web Worker runtime with zero latency.

| Byte Offset | Type | Field Name | Description |
|---|---|---|---|
| `0` | `int32` | `windowWidth` | Logical window display width in pixels |
| `4` | `int32` | `windowHeight` | Logical window display height in pixels |
| `8` | `int32` | `renderWidth` | Render buffer width in pixels |
| `12` | `int32` | `renderHeight` | Render buffer height in pixels |
| `16` | `float32` | `dpiScale` | Device pixel ratio / display scaling factor |
| `20` | `int32` | `shouldClose` | `1` if close requested or ESC pressed, `0` otherwise |
| `24` | `float32` | `mouseX` | Mouse X coordinate mapped to canvas coordinate space |
| `28` | `float32` | `mouseY` | Mouse Y coordinate mapped to canvas coordinate space |
| `32` | `float32` | `mouseWheelX` | Horizontal wheel delta accumulated |
| `36` | `float32` | `mouseWheelY` | Vertical wheel delta accumulated |
| `40` | `uint32` | `mouseButtons` | Button bitmask: Bit 0 = Left, Bit 1 = Right, Bit 2 = Middle |
| `44 .. 107` | `uint32[16]` | `keysDown` | 512-bit bitmask of active keyboard keys (`DOM_KEY_MAP`) |
| `108` | `int32` | `keyPressedCount` | Number of queued key events (max 32) |
| `112 .. 239` | `int32[32]` | `keyPressedQueue` | Key codes pressed since last frame |
| `240` | `int32` | `charPressedCount` | Number of queued Unicode codepoints (max 32) |
| `244 .. 371` | `int32[32]` | `charPressedQueue` | Unicode codepoints typed since last frame |
| `372 .. 375` | `int32` | `frameSyncWord` | Synchronization word for `Atomics.wait()` pacing |
| `376 .. 511` | `uint8[136]` | `reserved` | Reserved for future extensions (gamepad, audio synchronization) |

### 3.2 Linear Memory Polling (`pollToWasm`)
For direct WASI / C runtimes that poll input directly into WebAssembly linear memory:
```javascript
inputCoordinator.pollToWasm(destPtr, wasmMemory);
```
- Copies 372 bytes of active input state directly into `destPtr` in linear memory.
- Automatically resets transient deltas (`mouseWheelX`, `mouseWheelY`, `keyPressedQueue`, `charPressedQueue`).

### 3.3 Keyboard Key Mapping (`DOM_KEY_MAP`)
Keyboard keys are mapped into a 512-bit bitmask (`keysDown[16]`) using standard virtual keycodes:
- `KeyA` – `KeyZ`: 65–90
- `Digit0` – `Digit9`: 48–57
- `Space`: 32, `Escape`: 256, `Enter`: 257, `Tab`: 258, `Backspace`: 259
- `ArrowRight`: 262, `ArrowLeft`: 263, `ArrowDown`: 264, `ArrowUp`: 265
- `F1` – `F12`: 290–301
- Modifiers: `ShiftLeft` (340), `ControlLeft` (341), `AltLeft` (342), `MetaLeft` (343), etc.
- Numpad: `Numpad0` – `Numpad9`: 320–329

---

## 4. WebAssembly Host Import Provider

`createGraphicsImports(options)` instantiates host bindings satisfying all functions declared in `<graphics.h>` and `<graphics_canvas.h>`.

### 4.1 Options Schema
```typescript
interface CreateGraphicsImportsOptions {
  getMemory?: () => WebAssembly.Memory | null;
  memory?: WebAssembly.Memory | null;
  sharedBuffer?: SharedArrayBuffer | null;
  inputCoordinator?: InputCoordinator | null;
  postMessage?: (msg: any, transfer?: Transferable[]) => void;
  onInit?: (data: { width: number; height: number; title: string }) => void;
  onFrame?: (bitmap: ImageBitmap) => void;
  onFrameBuffer?: (buffer: ArrayBuffer, width: number, height: number) => void;
  onFps?: (fps: number) => void;
  onClose?: () => void;
  width?: number;
  height?: number;
  offscreenCanvas?: OffscreenCanvas | null;
}
```

### 4.2 Return Value Schema
```typescript
interface GraphicsImportsResult {
  graphics: Record<string, Function>;
  canvas: Record<string, Function>;
  env: Record<string, Function>; // Combined imports ready for Wasm instantiation
  handleInputEvent: (event: any) => void; // Fallback manual event ingestion
}
```

Pass `env` directly when instantiating the WebAssembly module:
```javascript
const imports = createGraphicsImports({ getMemory: () => wasmMemory, postMessage });
const instance = await WebAssembly.instantiate(module, { env: imports.env });
```

### 4.3 Frame Presentation & Canvas State Preservation
1. **Software Framebuffer (`graphics_present`)**:
   - Updates `offscreen2d` using `putImageData` from WebAssembly linear memory.
   - If supported, extracts an `ImageBitmap` via `offscreen2d.transferToImageBitmap()` and delivers via `onFrame(bitmap)`.
   - Fallback: creates an ArrayBuffer copy from linear memory (`mem.buffer.slice(...)`) and delivers via `onFrameBuffer(copyBuffer, width, height)`.
2. **2D Canvas (`canvas_present`)**:
   - Native `OffscreenCanvas.transferToImageBitmap()` detaches and empties the drawing surface. To preserve drawing state across frames for incremental 2D graphics, `canvas_present` maintains a reusable intermediate `cloneCanvas`.
   - It blits `offscreen2d` onto `cloneCanvas`, extracts the `ImageBitmap` from the clone, and transfers it.
   - Fallback: invokes `createImageBitmap(offscreen2d)` when transfer is unavailable.

### 4.4 Frame Pacing & Timing
`graphics_wait_frame(target_fps)` throttles rendering to maintain target frame rates:
$$\Delta t_{\text{wait}} = \max\left(1, \left\lfloor \frac{1000}{\text{target\_fps}} - (t_{\text{now}} - t_{\text{last}}) \right\rfloor\right)$$
- When `sharedBuffer` and `Atomics` are available:
  `Atomics.wait(syncWord, 0, 0, Math.min(waitMs, 50))` suspends the worker thread efficiently without busy waiting.
- FPS Calculation: Measured over 1000ms intervals and reported via `onFps(fps)`.

### 4.5 Fallback Input Routing
When `SharedArrayBuffer` is unavailable, `createGraphicsImports` maintains local input variables (`currentMouseX`, `currentMouseY`, `currentMouseButtons`, `currentKeysDown`). The host can route UI events directly via:
```javascript
imports.handleInputEvent({ type: 'mouse', x: 120, y: 80, buttons: 1 });
imports.handleInputEvent({ type: 'keydown', key: 32 });
```

---

## 5. User Interface & Window Management

`GraphicsWindowUI` manages an interactive floating, draggable in-page window with pop-out window capabilities.

### 5.1 DOM Hierarchy
When instantiated, `GraphicsWindowUI` creates `#graphics-window`:
```html
<div id="graphics-window" class="graphics-window">
  <div class="graphics-header" id="graphics-header">
    <div class="graphics-title">
      <span class="graphics-icon">🎮</span>
      <span id="graphics-title-text">Title</span>
      <span class="graphics-badge" id="graphics-res-badge">640x480</span>
      <span class="graphics-badge fps-badge" id="graphics-fps-badge">60 FPS</span>
    </div>
    <div class="graphics-actions">
      <button id="btn-graphics-popout" class="graphics-btn">↗</button>
      <button id="btn-graphics-min" class="graphics-btn">_</button>
      <button id="btn-graphics-close" class="graphics-btn">&times;</button>
    </div>
  </div>
  <div class="graphics-body" id="graphics-body">
    <canvas id="graphics-canvas" width="640" height="480" tabindex="0"></canvas>
  </div>
</div>
```

### 5.2 API Reference
- `open(width, height, title)`: Opens and initializes window with dimensions and title.
- `close()`: Closes window, notifies callbacks, and resets input state.
- `show()`, `hide()`, `toggle()`: Controls window visibility.
- `toggleMinimize()`: Toggles compact titlebar-only mode (`.minimized`).
- `togglePopOut()` / `popOut()`: Opens external popup window (`window.open`) with dedicated canvas `#graphics-popup-canvas` and "↙ Dock into page" control.
- `dockBack()`: Closes popup window and restores in-page floating display.
- `isOpen(): boolean`: Returns whether in-page or pop-out window is active.
- `isCanvasVisible(): boolean`: Returns true if canvas is currently visible (open and not minimized).
- `renderFrame(bitmap: ImageBitmap)`: Renders frame via `bitmaprenderer` (or 2D fallback `drawImage`) and tracks background activity.
- `renderFrameBuffer(buffer, width, height)`: Fallback pixel buffer renderer via `ImageData` / `putImageData`.
- `updateFPS(fps: number)` / `updateFps(fps: number)`: Updates FPS badge text.
- `setInputCoordinator(inputCoordinator)`: Re-binds input listeners between in-page and popup canvases.
- `setActivity(active: boolean)` / `clearActivity()`: Invokes `onFrameActivity(active)` for host background notifications.

---

## 6. Package Structure & Module Exports

The package defines standard subpath exports in `package.json`:

| Subpath | Target | Purpose |
|---|---|---|
| `canvas-wasi` (`.`) | `./src/index.js` | Main package entry: `GraphicsWindowUI`, `InputCoordinator`, `DOM_KEY_MAP`, `createGraphicsImports`, `GRAPHICS_H`, `GRAPHICS_CANVAS_H` |
| `canvas-wasi/worker` (`./worker`) | `./src/worker.js` | Worker entry: lightweight `createGraphicsImports` |
| `canvas-wasi/headers` (`./headers`) | `./src/headers.js` | C header string constants (`GRAPHICS_H`, `GRAPHICS_CANVAS_H`) for browser virtual filesystems |
| `canvas-wasi/style.css` (`./style.css`) | `./src/ui/style.css` | Stylesheet for the floating window component |

---

## 7. TypeScript Support

Strict TypeScript declaration files are provided at `types/index.d.ts` covering:
- `GraphicsWindowUI` & `GraphicsWindowUIOptions`
- `InputCoordinator` & `InputCoordinatorOptions`
- `DOM_KEY_MAP`
- `createGraphicsImports`, `CreateGraphicsImportsOptions`, & `GraphicsImportsResult`
- Header string constants `GRAPHICS_H` and `GRAPHICS_CANVAS_H`

