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

1. **Single Runtime Dependency (`canvas-window`)**:
   - `canvas-wasi` delegates DOM windowing, popup detachment, and input coordination to `canvas-window`. Do not introduce other runtime npm packages.
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

## 3. Developer Collaboration & Revision Workflow

All agent-assisted development in this repository must strictly adhere to the developer's 4-phase revision workflow:

```
┌──────────────────────────────────────────────────────────────┐
│  Phase 1: Specification Revision & Developer Confirmation     │
│  - Propose/update SPEC.md changes first                      │
│  - Await explicit developer review & approval                │
└──────────────────────────────┬───────────────────────────────┘
                               │ Approved
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 2: Specification-Compliant Implementation             │
│  - Strictly implement according to the confirmed SPEC.md     │
│  - Verify automated tests (npm test) with zero failures      │
└──────────────────────────────┬───────────────────────────────┘
                               │ Verified
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 3: Developer Manual Verification                      │
│  - Prompt developer to perform interactive verification      │
│  - Developer tests UI/input via npm run demo / examples      │
└──────────────────────────────┬───────────────────────────────┘
                               │ Developer Confirmed
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Phase 4: Explicitly Instructed Document Alignment & Commit  │
│  - Await developer's explicit instruction                    │
│  - Align secondary docs (README.md, types, etc.)             │
│  - Stage and commit changes to git repository                │
└──────────────────────────────────────────────────────────────┘
```

### Detailed Workflow Protocol

1. **Specification First**:
   - For any architectural change, protocol modification, API addition, or bug fix, first formulate the design in `SPEC.md`.
   - The developer must review and explicitly confirm the specification change before any source code is modified.
2. **Strict Specification Compliance**:
   - During implementation, agents must strictly conform to the confirmed `SPEC.md`. No unauthorized deviations or undocumented side-effects are permitted.
3. **Developer Manual Verification**:
   - Following automated test validation (`npm test`), the agent must pause and request the developer to conduct manual verification using the local interactive environment (`npm run demo` -> `examples/demo.html`).
   - The agent should provide clear, concise instructions on what interactive samples to test.
4. **Explicit Instruction for Document Alignment & Repo Commit**:
   - Agents must **not** unilaterally perform bulk document alignment or git commits without direct instruction.
   - The developer will explicitly instruct the agent when manual verification has succeeded and direct the document alignment (e.g., updating `README.md`, `types/index.d.ts`, etc.) and repository commit (`git add`, `git commit`).

---

## 4. Directory Structure & Key Files

```
canvas-wasi/
├── docs/                      # Comprehensive API documentation & integration guides
│   ├── README.md              # Documentation navigation & architecture overview
│   ├── c_api_reference.md     # C/C++ API reference (<graphics.h>, <graphics_canvas.h>)
│   ├── js_api_reference.md    # JavaScript & TypeScript host API reference
│   └── integration_guide.md   # Web Worker, COOP/COEP & Clang integration guide
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

## 5. Development & Testing Commands

All commands are standard Node.js:

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

## 6. Agent Modification Procedures

### 6.1 Adding a New C Graphics / Canvas API Function

1. **Specification First**:
   - Update `SPEC.md` and obtain developer confirmation.
2. **Update C Header**:
   - Add function declaration to `include/graphics.h` or `include/graphics_canvas.h`.
3. **Synchronize Virtual Header Constant**:
   - Update `GRAPHICS_H` or `GRAPHICS_CANVAS_H` in `src/headers.js`. Ensure text matches `include/` headers exactly.
4. **Implement Host Import**:
   - In `src/host/graphics-imports.js`, implement the function under `graphics` or `canvas` object.
   - Decode string pointers using `decodeStr(ptr)` when passing text.
   - Convert coordinate or color parameters as appropriate.
5. **Update TypeScript Definitions**:
   - Add function type in `types/index.d.ts` under `GraphicsImportsResult` or related interfaces.
6. **Update Test Suite**:
   - Add the function name to `expectedGraphicsFuncs` or `expectedCanvasFuncs` in `test/canvas-wasi.test.js`.
   - Add unit test verification if applicable.
7. **Verify**:
   - Run `npm test` and ensure all tests pass.

### 6.2 Modifying the Input Memory Layout

1. **Modify in `canvas-window`**:
   - The 512-byte `SharedArrayBuffer` memory layout and protocol constants are defined and owned by `canvas-window` (`src/protocol.js`).
   - If extending the memory layout (offsets 376..511), update `canvas-window` first.
2. **Update Reader in `canvas-wasi`**:
   - Update imports and reads in `src/host/graphics-imports.js`.
3. **Update Tests & Verification**:
   - Run `npm test`.

### 6.3 Modifying Window UI or Popup Handling

1. **Managed by `canvas-window`**:
   - The floating draggable window (`CanvasWindow` / `GraphicsWindowUI`), pop-out window (`window.open`), dock-back restoration, and styles are provided by `canvas-window`.
   - Any modifications to the UI structure or styles must be made in `canvas-window`.

---

## 7. Pre-Commit / Pre-Completion Checklist

Before completing tasks or submitting PRs, verify:

- [ ] Specification updated in `SPEC.md` and confirmed by the developer prior to code changes.
- [ ] Implementation strictly conforms to the confirmed `SPEC.md`.
- [ ] `node test/canvas-wasi.test.js` passes with zero errors.
- [ ] Header parity verified: `include/` headers match `src/headers.js`.
- [ ] Developer has conducted manual verification via `npm run demo` (`examples/demo.html`).
- [ ] Document alignment (`README.md`, `types/index.d.ts`, `docs/`, etc.) performed upon explicit developer instruction.
- [ ] Git commit performed only when explicitly instructed by the developer.
- [ ] Zero external C linker flags maintained (`gcc app.c` / `clang app.c` compiles without `-l...`).

