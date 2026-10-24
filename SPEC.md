# SPEC.md: Technical Specification for `canvas-wasi`

`canvas-wasi` is a zero-dependency, modular C graphics and windowing subsystem for WebAssembly and WASI runtimes in the browser. It provides:
1. Direct software framebuffer pixel manipulation (`<graphics.h>`).
2. Hardware-accelerated HTML5 Canvas 2D vector primitives (`<graphics_canvas.h>`).
3. Low-latency synchronous mouse/keyboard input via a 512-byte `SharedArrayBuffer` memory protocol.
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
│   │  - Frame Pacing & Timing  │      │  - Zero-Copy Mouse/Key Polling│ │
│   │  - Pixel Buffer Packing   │      │  - ESC / Window Close Flag   │  │
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

## 3. SharedArrayBuffer Input Memory Map (512 Bytes)

When `crossOriginIsolated` is active, a dedicated 512-byte `SharedArrayBuffer` coordinates input state between the main thread and WebAssembly worker with zero latency.

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
| `32` | `float32` | `mouseWheelX` | Horizontal wheel delta |
| `36` | `float32` | `mouseWheelY` | Vertical wheel delta |
| `40` | `uint32` | `mouseButtons` | Button bitmask: Bit 0 = Left, Bit 1 = Right, Bit 2 = Middle |
| `44 .. 107` | `uint32[16]` | `keysDown` | 512-bit bitmask of active keyboard keys (`DOM_KEY_MAP`) |
| `108` | `int32` | `keyPressedCount` | Number of queued key events (max 32) |
| `112 .. 239` | `int32[32]` | `keyPressedQueue` | Key codes pressed since last frame |
| `240` | `int32` | `charPressedCount` | Number of queued Unicode codepoints (max 32) |
| `244 .. 371` | `int32[32]` | `charPressedQueue` | Unicode codepoints typed since last frame |
| `372 .. 375` | `int32` | `frameSyncWord` | Synchronization word for `Atomics.wait()` pacing |
| `376 .. 511` | `uint8[136]` | `reserved` | Reserved for future expansions (gamepad, audio sync) |

---

## 4. WebAssembly Host Import Provider

`createGraphicsImports(options)` returns host import definitions that satisfy all functions declared in `<graphics.h>` and `<graphics_canvas.h>`.

### 4.1 Options Schema
```typescript
interface CreateGraphicsImportsOptions {
  getMemory: () => WebAssembly.Memory | null;
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

### 4.2 Frame Presentation & Zero-Copy ImageBitmap
1. When `graphics_present(ptr)` or `canvas_present()` is invoked:
   - In a Web Worker, `offscreen2d.transferToImageBitmap()` produces an `ImageBitmap`.
   - The bitmap is posted to the main thread via transferable `postMessage({ type: 'frame', bitmap }, [bitmap])`.
   - The main thread `GraphicsWindowUI` transfers it to the screen with `ctx.transferFromImageBitmap(bitmap)` with zero CPU-to-GPU copies.
2. If `ImageBitmapRenderingContext` is unavailable, fallback raw array buffers are transferred and rendered via `putImageData` or `drawImage`.

### 4.3 Frame Pacing & Timing
`graphics_wait_frame(target_fps)` computes the remaining duration for the frame:
$$\Delta t_{\text{wait}} = \max\left(1, \left\lfloor \frac{1000}{\text{target\_fps}} - (t_{\text{now}} - t_{\text{last}}) \right\rfloor\right)$$
- If a `SharedArrayBuffer` is available, it pauses the worker using `Atomics.wait(syncWord, 0, 0, waitMs)` without spinning the CPU.
- If running on the main thread or without `Atomics`, it measures delta time with `performance.now()`.

---

## 5. User Interface & Window Management

`GraphicsWindowUI` provides floating, draggable in-page and detached window presentation:

1. **Draggable Container**: Draggable via the window header, bounded within viewport coordinates.
2. **Minimization**: Collapses canvas body, retaining title, resolution, and FPS badges.
3. **Pop-Out to Independent Window**:
   - Detaches to a clean browser window via `window.open`.
   - Uses `id="graphics-popup-canvas"` with a dedicated `bitmaprenderer` context.
   - Forwards mouse, keyboard, and focus events back to the `InputCoordinator`.
   - Provides a "↙ Dock into page" button and restores in-page display upon popup unload.
4. **Activity Monitoring**:
   - Invokes `onFrameActivity(true)` whenever new frames arrive while the window is hidden or minimized, enabling host notifications (such as pulsing status badges).

---

## 6. TypeScript Support

The package provides strict TypeScript declaration files at `types/index.d.ts` covering:
- `GraphicsWindowUI`
- `InputCoordinator`
- `DOM_KEY_MAP`
- `createGraphicsImports`
- Header string constants `GRAPHICS_H` and `GRAPHICS_CANVAS_H`
