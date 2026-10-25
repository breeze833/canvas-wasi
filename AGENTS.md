# AGENTS.md: Developer and AI Agent Guidelines for `canvas-wasi`

This document provides architectural context, design invariants, coding conventions, and maintenance procedures for AI agents and human contributors working on `canvas-wasi`.

---

## 1. Project Mission & Architecture

`canvas-wasi` is a zero-dependency graphics and windowing bridge designed for WebAssembly & WASI applications running inside the browser. It enables compiled C/C++ code (produced via Clang/LLVM, Emscripten, or TinyCC in playgrounds such as [wasm-c-ide](https://github.com/breeze833/wasm-c-ide)) to render directly to HTML5 Canvas elements with low latency and synchronous input coordination.

### Decoupled Multi-Tier System

- **Main Browser Thread**:
  - `GraphicsWindowUI` (`src/ui/graphics-window.js`): DOM lifecycle, dragging, minimization, pop-out window (`window.open`), dock-back restoration, and frame presentation.
  - `InputCoordinator` (`src/input/input-coordinator.js`): Captures mouse, keyboard, wheel, and focus events from active canvases, translates DOM coordinates to render buffer coordinates, and synchronizes state to shared memory or event listeners.
- **Web Worker Thread**:
  - `createGraphicsImports` (`src/host/graphics-imports.js`): Provides the WebAssembly host imports satisfying `<graphics.h>` and `<graphics_canvas.h>`.
  - `OffscreenCanvas` & 2D Context: Performs vector rasterization and framebuffer transfers on the worker thread.
  - Frame Pacing: Synchronizes frame timing via `Atomics.wait()` on a 512-byte `SharedArrayBuffer`.
- **Wasm User Instance**:
  - Pure C/C++ user programs including `<graphics.h>` (direct 32-bit RGBA pixel buffers) or `<graphics_canvas.h>` (HTML5 2D vector primitives).

---

## 2. Core Design Invariants

When modifying or extending the codebase, strictly adhere to these fundamental invariants:

1. **Zero External Runtime Dependencies**:
   - Do not introduce runtime npm packages. All source code must be vanilla ES modules and standard browser APIs.
2. **Zero External C Linker Flags**:
   - The C headers (`<graphics.h>` and `<graphics_canvas.h>`) declare host functions directly resolved by WebAssembly host imports (`env.*`). C programs compile without extra linker flags (e.g. `gcc app.c -o a.out` without `-l...`).
3. **C Header Parity (`include/` vs `src/headers.js`)**:
   - The header files under `include/` (`graphics.h`, `graphics_canvas.h`) MUST remain byte-for-byte identical (ignoring leading/trailing whitespace) with the exported string constants (`GRAPHICS_H`, `GRAPHICS_CANVAS_H`) in `src/headers.js`.
   - This parity is enforced by `test/canvas-wasi.test.js`.
4. **Pixel Format Invariant**:
   - Framebuffers use little-endian 32-bit RGBA (`0xAABBGGRR`):
     - Byte 0: Red
     - Byte 1: Green
     - Byte 2: Blue
     - Byte 3: Alpha
5. **2D Canvas Buffer Preservation**:
   - Native `OffscreenCanvas.transferToImageBitmap()` detaches and empties the drawing surface.
   - For `canvas_present()`, `createGraphicsImports` maintains a reusable intermediate `cloneCanvas` to blit and transfer, preserving canvas content across frames for retained/incremental vector graphics.
6. **Cross-Origin Isolation Fallbacks**:
   - While zero-latency synchronous input and frame pacing use a 512-byte `SharedArrayBuffer` with `Atomics`, the codebase must gracefully function in non-isolated contexts via `handleInputEvent` and transferable `ArrayBuffer` rendering.
7. **Thread Safety & Clean Detachment**:
   - When the user pops out the window into a separate browser window, `InputCoordinator` listeners and canvas contexts must dynamically re-bind between the in-page canvas and popup canvas, restoring cleanly when docked or closed.

---

## 3. Directory Structure & Key Files

```
canvas-wasi/
├── include/
│   ├── graphics.h             # C header for software framebuffer & input
│   └── graphics_canvas.h      # C header for HTML5 Canvas 2D vector API
├── src/
│   ├── index.js               # Main package export (UI, coordinator, imports, headers)
│   ├── worker.js              # Lightweight worker export (createGraphicsImports)
│   ├── headers.js             # String constants of C headers for browser VFS
│   ├── host/
│   │   └── graphics-imports.js# WebAssembly host import provider implementation
│   ├── input/
│   │   └── input-coordinator.js# DOM event handling & SharedArrayBuffer synchronization
│   └── ui/
│       ├── graphics-window.js # Floating draggable & pop-out window controller
│       └── style.css          # CSS styles for floating window
├── types/
│   └── index.d.ts             # TypeScript definitions for all exports
├── examples/
│   ├── demo.html              # Standalone interactive browser demo
│   ├── serve.js               # Zero-dependency local dev server with COOP/COEP
│   ├── 01_framebuffer.c       # C example: 60 FPS plasma & pixel painting
│   ├── 02_canvas_vector.c     # C example: Bouncing balls & vector transforms
│   └── 03_canvas_pixels.c     # C example: Image filters (Sobel, blur, lens)
├── test/
│   └── canvas-wasi.test.js    # Standalone unit test suite
├── package.json               # Package metadata and subpath export definitions
├── SPEC.md                    # Detailed architectural and protocol specification
├── README.md                  # User-facing documentation and quick start
└── AGENTS.md                  # Developer and agent maintenance guidelines
```

---

## 4. Development & Testing Commands

All commands are zero-dependency standard Node.js:

```bash
# Run unit test suite
npm test
# (Equivalent to: node test/canvas-wasi.test.js)

# Start local interactive demo server (http://localhost:3000/examples/demo.html)
npm run demo
# or: npm start

# Validate npm package contents
npm pack --dry-run
```

---

## 5. Agent Modification Procedures

### 5.1 Adding a New C Graphics / Canvas API Function

1. **Update C Header**:
   - Add function declaration to `include/graphics.h` or `include/graphics_canvas.h`.
2. **Synchronize Virtual Header Constant**:
   - Update `GRAPHICS_H` or `GRAPHICS_CANVAS_H` in `src/headers.js`. Ensure text matches `include/` headers exactly.
3. **Implement Host Import**:
   - In `src/host/graphics-imports.js`, implement the function under `graphics` or `canvas` object.
   - Decode string pointers using `decodeStr(ptr)` when passing text.
   - Convert coordinate or color parameters as appropriate.
4. **Update TypeScript Definitions**:
   - Add function type in `types/index.d.ts` under `GraphicsImportsResult` or related interfaces.
5. **Update Test Suite**:
   - Add the function name to `expectedGraphicsFuncs` or `expectedCanvasFuncs` in `test/canvas-wasi.test.js`.
   - Add unit test verification if applicable.
6. **Update Specifications**:
   - Document new API signature in `SPEC.md`.
7. **Verify**:
   - Run `npm test` and ensure all tests pass.

### 5.2 Modifying the Input Memory Layout

1. **Verify Layout in `SPEC.md`**:
   - Check the 512-byte table in `SPEC.md`. Offsets 0..375 are active fields; 376..511 are reserved.
2. **Update Writer**:
   - Update `updateSharedState()` and `pollToWasm()` in `src/input/input-coordinator.js`.
3. **Update Reader**:
   - Update reads in `graphics_get_mouse`, `graphics_is_key_down`, and `graphics_should_close` in `src/host/graphics-imports.js`.
4. **Update Tests**:
   - Update data view checks in `test/canvas-wasi.test.js`.
5. **Verify**:
   - Run `npm test`.

### 5.3 Modifying Window UI or Popup Handling

1. **DOM Container**:
   - HTML structure is generated in `GraphicsWindowUI.prototype.initDOM()`.
   - Ensure IDs remain consistent (`#graphics-window`, `#graphics-canvas`, `#btn-graphics-popout`, `#btn-graphics-min`, `#btn-graphics-close`).
2. **Styles**:
   - Update `src/ui/style.css`.
3. **Popup Window**:
   - Managed in `popOut()` and `dockBack()`.
   - Remember to rebind `inputCoordinator.attachListeners()` when switching between in-page canvas and popup window.

---

## 6. Pre-Commit / Pre-Completion Checklist

Before completing tasks or submitting PRs, verify:

- [ ] `node test/canvas-wasi.test.js` passes with zero errors.
- [ ] Header parity verified: `include/` headers match `src/headers.js`.
- [ ] No new npm runtime dependencies introduced.
- [ ] `types/index.d.ts` reflects any newly added or modified methods and options.
- [ ] Documentation (`README.md`, `SPEC.md`, `AGENTS.md`) is kept synchronized with code changes.
