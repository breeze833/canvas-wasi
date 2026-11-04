# Integration & Architecture Guide

This guide walks you through integrating `canvas-wasi` into your WebAssembly applications, browser environments, and educational Web IDEs.

---

## Table of Contents

- [Architectural Overview](#architectural-overview)
- [Step 1: Compiling C Code to WebAssembly](#step-1-compiling-c-code-to-webassembly)
  - [Compiler Invariants & Zero Linker Flags](#compiler-invariants--zero-linker-flags)
  - [Using `wasm32-wasi` with Clang](#using-wasm32-wasi-with-clang)
- [Step 2: Web Worker Implementation](#step-2-web-worker-implementation)
  - [Worker Runtime Code](#worker-runtime-code)
  - [Binding Linear Memory](#binding-linear-memory)
- [Step 3: Main Thread & UI Implementation](#step-3-main-thread--ui-implementation)
  - [Initializing Input & Window Controller](#initializing-input--window-controller)
  - [Connecting Worker Message Handlers](#connecting-worker-message-handlers)
- [Step 4: Cross-Origin Isolation (COOP/COEP)](#step-4-cross-origin-isolation-coopcoep)
  - [Configuring HTTP Headers](#configuring-http-headers)
  - [Fallback for Non-Isolated Contexts](#fallback-for-non-isolated-contexts)
- [Step 5: Browser IDE Integration (e.g. `wasm-c-ide`)](#step-5-browser-ide-integration-eg-wasm-c-ide)
  - [Mounting Virtual Headers in VFS](#mounting-virtual-headers-in-vfs)
  - [Dual Console & Activity Coordination](#dual-console--activity-coordination)

---

## Architectural Overview

`canvas-wasi` uses a decoupled multi-tier architecture that isolates compute-heavy user WebAssembly code in a background Web Worker while preserving smooth, responsive UI interaction on the browser's main thread:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Main Browser Thread                             │
│                                                                        │
│   ┌───────────────────────────┐      ┌──────────────────────────────┐  │
│   │     GraphicsWindowUI      │      │       InputCoordinator       │  │
│   │                           │      │                              │  │
│   │  - Draggable In-Page Win  │◄────►│  - Mouse/Wheel Listeners     │  │
│   │  - External Popup Window  │      │  - Keyboard DOM Key Map      │  │
│   │  - ImageBitmap Renderer   │      │  - Coordinate Translation    │  │
│   │  - FPS & Activity Badges  │      │  - Focus / Blur Lifecycle    │  │
│   └─────────────▲─────────────┘      └──────────────┬───────────────┘  │
└─────────────────┼───────────────────────────────────┼──────────────────┘
                  │ postMessage (ImageBitmap / msg)   │ 512-byte SharedArrayBuffer
┌─────────────────┼───────────────────────────────────┼──────────────────┐
│                 │                                   ▼                  │
│   ┌─────────────┴─────────────┐      ┌──────────────────────────────┐  │
│   │   createGraphicsImports   │      │      Shared Memory View      │  │
│   │                           │      │                              │  │
│   │  - OffscreenCanvas 2D Ctx │      │  - Atomics.wait Frame Pacing │  │
│   │  - Reusable Clone Canvas  │      │  - Synchronous Mouse & Keys  │  │
│   │  - Frame Pacing & Timing  │      │  - ShouldClose Detection     │  │
│   │  - String Pointer Decoder │      │  - Direct pollToWasm         │  │
│   └─────────────▲─────────────┘      └──────────────┬───────────────┘  │
│                 │ WebAssembly Imports (env)         │                  │
│   ┌─────────────┴───────────────────────────────────▼──────────────┐  │
│   │                    WebAssembly Instance (WASI)                 │  │
│   │                                                                │  │
│   │  User C/C++ program using <graphics.h> or <graphics_canvas.h> │  │
│   └────────────────────────────────────────────────────────────────┘  │
│                         Web Worker Thread                              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Compiling C Code to WebAssembly

### Compiler Invariants & Zero Linker Flags

`canvas-wasi` requires **no external static library or linker flags**. The host functions are resolved as WebAssembly host imports (`env.*`). Users compile with standard Clang or GCC targeting `wasm32-wasi` without adding `-l...`.

### Using `wasm32-wasi` with Clang

```bash
# Compile using <graphics.h> or <graphics_canvas.h>
clang --target=wasm32-wasi -O2 \
  -I/path/to/canvas-wasi/include \
  app.c -o app.wasm
```

When targeting WASI Preview 1 (`wasm32-wasip1`), compilation remains identical:

```bash
clang --target=wasm32-wasip1 -O2 \
  -I/path/to/canvas-wasi/include \
  app.c -o app.wasm
```

---

## Step 2: Web Worker Implementation

The Web Worker hosts the WebAssembly runtime and manages vector rasterization and framebuffer presentation without blocking the browser UI thread.

### Worker Runtime Code

Create `worker.js`:

```javascript
import { createGraphicsImports } from 'canvas-wasi/worker';

let wasmMemory = null;

self.onmessage = async (e) => {
  const { type, wasmBytes, sharedBuffer } = e.data;

  if (type === 'start') {
    // 1. Create graphics host imports
    const graphicsImports = createGraphicsImports({
      getMemory: () => wasmMemory,
      sharedBuffer: sharedBuffer,
      postMessage: (msg, transfer) => self.postMessage(msg, transfer)
    });

    // 2. Compile WebAssembly module
    const wasmModule = await WebAssembly.compile(wasmBytes);

    // 3. Setup WASI environment imports (example using minimal WASI mock or wasi-shim)
    const wasiImports = {
      proc_exit: (code) => {
        self.postMessage({ type: 'exit', code });
      },
      fd_write: () => 0
    };

    // 4. Instantiate with graphics imports merged into 'env'
    const instance = await WebAssembly.instantiate(wasmModule, {
      env: graphicsImports.env,
      wasi_snapshot_preview1: wasiImports
    });

    // 5. Connect linear memory so graphics functions can read framebuffers & strings
    wasmMemory = instance.exports.memory;

    // 6. Execute user main / entrypoint
    try {
      if (instance.exports._start) {
        instance.exports._start();
      } else if (instance.exports.main) {
        instance.exports.main();
      }
    } catch (err) {
      console.error('Wasm execution error:', err);
    }
  } else if (type === 'input_event') {
    // Fallback input routing when SharedArrayBuffer is unavailable
    if (graphicsImports) {
      graphicsImports.handleInputEvent(e.data.event);
    }
  }
};
```

---

## Step 3: Main Thread & UI Implementation

The main browser thread is responsible for DOM rendering, window dragging/resizing, pop-out window coordination, and user input capture.

### Initializing Input & Window Controller

In `main.js`:

```javascript
import { GraphicsWindowUI, InputCoordinator } from 'canvas-wasi';
import 'canvas-wasi/style.css';

// 1. Check for Cross-Origin Isolation
const isIsolated = window.crossOriginIsolated === true;
const sharedBuffer = isIsolated ? new SharedArrayBuffer(512) : null;

// 2. Create InputCoordinator
const inputCoordinator = new InputCoordinator({
  sharedBuffer: sharedBuffer,
  width: 640,
  height: 480
});

// 3. Create GraphicsWindowUI
const win = new GraphicsWindowUI({
  inputCoordinator: inputCoordinator,
  sharedBuffer: sharedBuffer,
  onCloseRequested: () => {
    console.log('User closed graphics window');
  },
  onFocusChange: (focused) => {
    console.log('Canvas focus changed:', focused);
  },
  onFrameActivity: (active) => {
    console.log('Background frame activity:', active);
  }
});
```

### Connecting Worker Message Handlers

```javascript
// 4. Launch Worker
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

// 5. Handle worker messages
worker.onmessage = (e) => {
  const msg = e.data;

  switch (msg.type) {
    case 'graphics_init':
      win.open(msg.width, msg.height, msg.title);
      break;

    case 'frame':
      // Hardware-accelerated ImageBitmap transfer
      win.renderFrame(msg.bitmap);
      break;

    case 'frame_buffer':
      // Fallback transferable ArrayBuffer
      win.renderFrameBuffer(msg.buffer, msg.width, msg.height);
      break;

    case 'fps':
      win.updateFPS(msg.fps);
      break;

    case 'graphics_close':
      win.close();
      break;

    case 'exit':
      console.log('Program exited with code:', msg.code);
      break;
  }
};

// 6. Start Wasm program
const wasmResponse = await fetch('app.wasm');
const wasmBytes = await wasmResponse.arrayBuffer();

worker.postMessage({
  type: 'start',
  wasmBytes,
  sharedBuffer
});
```

---

## Step 4: Cross-Origin Isolation (COOP/COEP)

To enable zero-latency input polling and `Atomics.wait()` frame pacing without blocking, browsers require **Cross-Origin Isolation**.

### Configuring HTTP Headers

Your HTTP server must send the following response headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

#### Node.js Zero-Dependency Dev Server Example
See `examples/serve.js` in the repository:

```javascript
import http from 'node:http';
import fs from 'node:fs';

const server = http.createServer((req, res) => {
  // Set isolation headers
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  
  // Serve files...
});
server.listen(3000);
```

#### Vite Configuration Example
In `vite.config.js`:

```javascript
export default {
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
};
```

### Fallback for Non-Isolated Contexts

If your deployment environment cannot send COOP/COEP headers (e.g. GitHub Pages without service workers):
1. `sharedBuffer` will be `null`.
2. `inputCoordinator.addListener()` can be used to forward input events to the worker via `postMessage`:
   ```javascript
   if (!sharedBuffer) {
     inputCoordinator.addListener((event) => {
       worker.postMessage({ type: 'input_event', event });
     });
   }
   ```
3. Frame pacing will safely degrade to non-blocking timeout pacing.

---

## Step 5: Browser IDE Integration (e.g. `wasm-c-ide`)

In web-based IDEs like [wasm-c-ide](https://github.com/breeze833/wasm-c-ide):

### Mounting Virtual Headers in VFS

Instead of requiring users to download C header files to disk, import virtual header constants and write them into the virtual file system:

```javascript
import { GRAPHICS_H, GRAPHICS_CANVAS_H } from 'canvas-wasi/headers';

// Inside your VFS bootstrap:
vfs.writeFile('/usr/include/graphics.h', GRAPHICS_H);
vfs.writeFile('/usr/include/graphics_canvas.h', GRAPHICS_CANVAS_H);
```

User programs can now simply `#include <graphics.h>` or `#include <graphics_canvas.h>` without any additional setup.

### Dual Console & Activity Coordination

`canvas-wasi` coordinates cleanly with terminal emulators (such as xterm.js):
- When `graphics_init()` is called, `GraphicsWindowUI.open()` pops open the graphics canvas alongside the terminal.
- The `onFrameActivity(active)` callback can be used to display a pulsating glow or badge on the IDE's `[🎮 Canvas]` toolbar button if the user minimizes or hides the window while frames are actively being generated.
- When `graphics_close()` or `_start()` finishes, the window cleanly closes or preserves the last frame according to IDE preference.
