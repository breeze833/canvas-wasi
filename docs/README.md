# canvas-wasi Documentation

Welcome to the documentation suite for `canvas-wasi`: a zero-dependency graphics and windowing bridge for WebAssembly and WASI runtimes in the browser.

---

## Documentation Index

| Document | Target Audience | Description |
|---|---|---|
| **[C API Reference](c_api_reference.md)** | C & C++ Developers | Complete reference for `<graphics.h>` (software framebuffer) and `<graphics_canvas.h>` (HTML5 Canvas 2D vector primitives), pixel formats, input queries, and frame pacing. |
| **[JavaScript & TypeScript Host API Reference](js_api_reference.md)** | Web Integrators & Frontend Developers | API reference for `GraphicsWindowUI`, `InputCoordinator`, `createGraphicsImports`, `DOM_KEY_MAP`, and virtual header constants. |
| **[Integration & Architecture Guide](integration_guide.md)** | Systems & Web Developers | End-to-end integration walkthrough covering Clang compilation (`wasm32-wasi`), Web Worker setup, Cross-Origin Isolation (COOP/COEP), and Web IDE integration. |
| **[Technical Specification](../SPEC.md)** | Systems Architects & Contributors | Formal specification including 512-byte `SharedArrayBuffer` memory layout, Atomics frame pacing protocol, and clone canvas preservation. |
| **[Developer & Agent Guidelines](../AGENTS.md)** | Contributors & AI Agents | Coding conventions, core design invariants, verification checklists, and maintenance procedures. |

---

## Architectural Overview

`canvas-wasi` bridges compiled C/C++ WebAssembly code and the browser DOM using a decoupled multi-tier architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Main Browser Thread                             │
│                                                                        │
│   ┌───────────────────────────┐      ┌──────────────────────────────┐  │
│   │     GraphicsWindowUI      │      │       InputCoordinator       │  │
│   │                           │      │                              │  │
│   │  - Floating Draggable UI  │◄────►│  - Mouse/Wheel/Keys Listeners│  │
│   │  - Detached External Popup│      │  - DPI & Coordinate Scaling  │  │
│   │  - ImageBitmap Renderer   │      │  - ShouldClose State         │  │
│   │  - Real-time FPS Badge    │      │  - Focus / Blur Handling     │  │
│   └─────────────▲─────────────┘      └──────────────┬───────────────┘  │
└─────────────────┼───────────────────────────────────┼──────────────────┘
                  │ postMessage (ImageBitmap / frame) │ 512-byte SharedArrayBuffer
┌─────────────────┼───────────────────────────────────┼──────────────────┐
│                 │                                   ▼                  │
│   ┌─────────────┴─────────────┐      ┌──────────────────────────────┐  │
│   │   createGraphicsImports   │      │      Shared Memory View      │  │
│   │                           │      │                              │  │
│   │  - OffscreenCanvas 2D Ctx │      │  - Atomics.wait Frame Pacing │  │
│   │  - Clone Canvas Buffer    │      │  - Synchronous Input Polling │  │
│   │  - Frame Timing & FPS     │      │  - Linear Mem pollToWasm     │  │
│   └─────────────▲─────────────┘      └──────────────┬───────────────┘  │
│                 │ WebAssembly Imports (env)         │                  │
│   ┌─────────────┴───────────────────────────────────▼──────────────┐  │
│   │                    WebAssembly Instance (WASI)                 │  │
│   │                                                                │  │
│   │  C User Program (#include <graphics.h> or <graphics_canvas.h>)  │  │
│   └────────────────────────────────────────────────────────────────┘  │
│                         Web Worker Thread                              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Navigation

### For C/C++ Developers
- [Software Framebuffer API (`<graphics.h>`)](c_api_reference.md#software-framebuffer-api-graphicsh)
  - [`graphics_init`](c_api_reference.md#graphics_init)
  - [`graphics_present`](c_api_reference.md#graphics_present)
  - [`graphics_wait_frame`](c_api_reference.md#graphics_wait_frame)
  - [`graphics_get_mouse`](c_api_reference.md#graphics_get_mouse)
  - [`graphics_is_key_down`](c_api_reference.md#graphics_is_key_down)
- [HTML5 Canvas 2D Vector API (`<graphics_canvas.h>`)](c_api_reference.md#html5-canvas-2d-vector-api-graphics_canvash)
  - [`canvas_present`](c_api_reference.md#canvas_present)
  - [Path Drawing (`arc`, `move_to`, `line_to`, `fill`, `stroke`)](c_api_reference.md#path-drawing)
  - [Styles & Colors (`set_fill_style`, `set_stroke_style`, `set_fill_rgb`)](c_api_reference.md#styles-colors--line-attributes)
  - [Transformations (`save`, `restore`, `translate`, `rotate`, `scale`)](c_api_reference.md#transformations--state-management)
  - [Pixel Manipulation & Interop (`get_pixels`, `put_pixels`, `get_pixel`, `set_pixel`)](c_api_reference.md#pixel-level-manipulation--framebuffer-interop)
- [Virtual Keycode Table](c_api_reference.md#virtual-keycode-reference)

### For JavaScript/TypeScript Integrators
- [`GraphicsWindowUI`](js_api_reference.md#graphicswindowui)
  - [Window Lifecycle (`open`, `close`, `focus`, `toggleMinimize`)](js_api_reference.md#window-lifecycle-methods)
  - [Detached Pop-Out Window (`popOut`, `dockBack`)](js_api_reference.md#multi-window-pop-out--docking)
  - [Frame Rendering (`renderFrame`, `renderFrameBuffer`)](js_api_reference.md#frame-rendering-methods)
- [`InputCoordinator`](js_api_reference.md#inputcoordinator)
  - [DOM Listeners & Coordinate Scaling](js_api_reference.md#coordinate-translation--dpi)
  - [512-Byte Shared Memory Map](js_api_reference.md#512-byte-memory-layout)
- [`createGraphicsImports`](js_api_reference.md#creategraphicsimports)
  - [Worker Host Imports Setup](js_api_reference.md#creategraphicsimportsoptions)
  - [Buffer Preservation Across Frames](js_api_reference.md#canvas-buffer-preservation)
- [Virtual Headers (`canvas-wasi/headers`)](js_api_reference.md#virtual-headers-canvas-wasiheaders)

### Reference C Examples
- [`examples/01_framebuffer.c`](../examples/01_framebuffer.c): Procedural plasma animation, 60 FPS pacing, and mouse painting using `<graphics.h>`.
- [`examples/02_canvas_vector.c`](../examples/02_canvas_vector.c): Anti-aliased 2D vector geometry, bouncing physics balls, and matrix rotation using `<graphics_canvas.h>`.
- [`examples/03_canvas_pixels.c`](../examples/03_canvas_pixels.c): Hybrid vector drawing with 2D spatial image filters (Sobel edge detection, blur, inversion) using `canvas_get_pixels()` and `canvas_put_pixels()`.
