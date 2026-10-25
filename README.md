# canvas-wasi

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Zero-dependency HTML5 Canvas and software framebuffer graphics bridge for WebAssembly & WASI applications in the browser.

`canvas-wasi` enables compiled C/C++ programs to render directly to HTML5 Canvas elements with low latency, synchronous input coordination, and an interactive floating/pop-out window UI.

For complete architectural details, C API signatures, and SharedArrayBuffer memory layout, see [SPEC.md](SPEC.md).

---

## Features

- 🎮 **Direct Software Framebuffer (`<graphics.h>`)**: Zero-dependency 32-bit RGBA pixel buffer presentation (`graphics_present`) for pure C programs.
- 🎨 **HTML5 Canvas 2D Vector Primitives (`<graphics_canvas.h>`)**: High-performance path drawing (`arc`, `line_to`, `fill`), transformations, text, and styles backed by `CanvasRenderingContext2D` with canvas state preservation.
- 🖼️ **Dual Presentation Pipeline**: Zero-copy hardware-accelerated `ImageBitmap` presentation via `bitmaprenderer` and fallback transferable array buffer rendering.
- ⚡ **Zero-Latency Synchronous Input**: 512-byte `SharedArrayBuffer` memory layout with Atomics frame pacing for mouse coordinates, buttons, wheel, and key states.
- 🪟 **Interactive Window Controller**: Floating, draggable in-page window with pop-out support (`window.open`), dock back, minimize, resolution badge, and real-time FPS counter.
- 🚀 **Zero External Dependencies**: Pure vanilla JavaScript/ES modules and standard C headers without linker dependencies.

---

## Installation

Install directly from GitHub via npm:

```bash
npm install github:breeze833/canvas-wasi
# or specify a tag, branch, or commit:
npm install github:breeze833/canvas-wasi#main
```

Or clone the repository:

```bash
git clone https://github.com/breeze833/canvas-wasi.git
```

Prepackaged release assets (`canvas-wasi.tar.gz`, `canvas-wasi.zip`, and npm tarball) are also available on [GitHub Releases](https://github.com/breeze833/canvas-wasi/releases).

---

## Quick Start

### 1. In Your C Program

Write standard C using `<graphics.h>`:

```c
#include <graphics.h>
#include <stdint.h>

#define WIDTH 320
#define HEIGHT 240

static uint32_t pixels[WIDTH * HEIGHT];

int main(void) {
    graphics_init(WIDTH, HEIGHT, "My C Graphics App");

    while (!graphics_should_close()) {
        int mx, my, btn, wheel;
        graphics_get_mouse(&mx, &my, &btn, &wheel);

        // Fill background
        for (int i = 0; i < WIDTH * HEIGHT; i++) {
            pixels[i] = 0xFF181818; // 0xAABBGGRR
        }

        // Draw cursor
        if (mx >= 0 && mx < WIDTH && my >= 0 && my < HEIGHT) {
            pixels[my * WIDTH + mx] = 0xFF00FFFF;
        }

        graphics_present(pixels);
        graphics_wait_frame(60);
    }

    graphics_close();
    return 0;
}
```

Or use high-level HTML5 vector graphics using `<graphics_canvas.h>`:

```c
#include <graphics_canvas.h>

int main(void) {
    graphics_init(640, 480, "2D Vector Demo");

    canvas_clear_rect(0, 0, 640, 480);
    canvas_set_fill_rgb(255, 100, 50);
    canvas_fill_rect(50, 50, 200, 150);

    canvas_begin_path();
    canvas_arc(320, 240, 60, 0, 3.14159f * 2, false);
    canvas_set_fill_style("#00bcd4");
    canvas_fill();

    canvas_present();
    return 0;
}
```

---

### 2. In Your Browser Application (Main Thread)

```javascript
import { GraphicsWindowUI, InputCoordinator } from 'canvas-wasi';
import 'canvas-wasi/style.css';

// 1. Setup Input Coordinator
const sharedBuffer = window.crossOriginIsolated ? new SharedArrayBuffer(512) : null;
const inputCoord = new InputCoordinator({ sharedBuffer, width: 800, height: 450 });

// 2. Setup Graphics Window UI
const win = new GraphicsWindowUI({
  inputCoordinator: inputCoord,
  onCloseRequested: () => console.log('Window closed by user'),
  onFrameActivity: (active) => console.log('Background frame activity:', active)
});

// 3. Connect to your Web Worker
worker.onmessage = (e) => {
  const { type } = e.data;
  if (type === 'graphics_init') win.open(e.data.width, e.data.height, e.data.title);
  else if (type === 'frame') win.renderFrame(e.data.bitmap);
  else if (type === 'frame_buffer') win.renderFrameBuffer(e.data.buffer, e.data.width, e.data.height);
  else if (type === 'fps') win.updateFPS(e.data.fps);
  else if (type === 'graphics_close') win.close();
};
```

---

### 3. In Your WebAssembly Worker

```javascript
import { createGraphicsImports } from 'canvas-wasi/worker';

let wasmMemory;
const graphicsImports = createGraphicsImports({
  getMemory: () => wasmMemory,
  sharedBuffer: sharedInputBuffer,
  postMessage: self.postMessage.bind(self)
});

const instance = await WebAssembly.instantiate(wasmModule, {
  env: {
    ...graphicsImports.env // graphics_* and canvas_* imports
  }
});

wasmMemory = instance.exports.memory;
```

---

## Virtual Filesystem Header Constants

For browser-based compiler playgrounds (like [wasm-c-ide](https://github.com/breeze833/wasm-c-ide)), headers are also exported as string constants:

```javascript
import { GRAPHICS_H, GRAPHICS_CANVAS_H } from 'canvas-wasi/headers';

vfs.writeFile('/usr/include/graphics.h', GRAPHICS_H);
vfs.writeFile('/usr/include/graphics_canvas.h', GRAPHICS_CANVAS_H);
```

---

## Package Exports Reference

| Subpath | Target | Description |
|---|---|---|
| `canvas-wasi` (`.`) | `./src/index.js` | Main package entry: `GraphicsWindowUI`, `InputCoordinator`, `DOM_KEY_MAP`, `createGraphicsImports`, `GRAPHICS_H`, `GRAPHICS_CANVAS_H` |
| `canvas-wasi/worker` (`./worker`) | `./src/worker.js` | Worker entry: lightweight `createGraphicsImports` |
| `canvas-wasi/headers` (`./headers`) | `./src/headers.js` | C header string constants (`GRAPHICS_H`, `GRAPHICS_CANVAS_H`) for browser virtual filesystems |
| `canvas-wasi/style.css` (`./style.css`) | `./src/ui/style.css` | Stylesheet for the floating window component |

---

## Standalone Demos & Examples

The repository includes a zero-dependency local development server and reference C programs:

### Running the Interactive Demo

Start the demo server with COOP/COEP headers enabled for `SharedArrayBuffer` support:

```bash
npm run demo
# or
npm start
```

Then navigate to `http://localhost:3000/examples/demo.html` to test the floating canvas window, pop-out controls, and interactive plasma simulation.

### Included Reference C Programs

- **[`examples/01_framebuffer.c`](examples/01_framebuffer.c)**: Direct 32-bit RGBA pixel manipulation using `<graphics.h>`, 60 FPS procedural plasma, interactive mouse drawing, and key detection.
- **[`examples/02_canvas_vector.c`](examples/02_canvas_vector.c)**: Native HTML5 2D vector graphics using `<graphics_canvas.h>`, anti-aliased geometry, matrix transforms (`save`, `rotate`, `restore`), bouncing physics balls, and interactive pointer rays.
- **[`examples/03_canvas_pixels.c`](examples/03_canvas_pixels.c)**: Hybrid 2D pipeline with pixel-level image processing filters (3x3 Sobel edge detection, 3x3 box blur, color inversion, and interactive mouse lens).

---

## Running Tests

Run the standalone unit test suite:

```bash
npm test
# or directly via node:
node test/canvas-wasi.test.js
```

---

## Technical Specifications & Agent Guidelines

- **[SPEC.md](SPEC.md)**: Full technical architecture, 512-byte SharedArrayBuffer memory layout, C API specifications, and frame presentation protocols.
- **[AGENTS.md](AGENTS.md)**: Architecture map, design invariants, coding conventions, and contribution guidelines for AI agents and human developers.

---

## License

[MIT](LICENSE)
