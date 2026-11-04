# C API Reference

This document provides a comprehensive reference for the C/C++ graphics APIs provided by `canvas-wasi`.

`canvas-wasi` exposes two standard C headers:
1. **`<graphics.h>`**: Low-level software framebuffer pixel manipulation, window lifecycle, frame pacing, and input queries.
2. **`<graphics_canvas.h>`**: High-level HTML5 Canvas 2D vector drawing primitives, styling, text rendering, matrix transformations, and direct pixel buffer interop.

---

## Table of Contents

- [Zero Linker Flags Guarantee](#zero-linker-flags-guarantee)
- [Software Framebuffer API (`<graphics.h>`)](#software-framebuffer-api-graphicsh)
  - [Window Lifecycle](#window-lifecycle)
    - [`graphics_init`](#graphics_init)
    - [`graphics_should_close`](#graphics_should_close)
    - [`graphics_close`](#graphics_close)
  - [Frame Presentation](#frame-presentation)
    - [`graphics_present`](#graphics_present)
    - [`graphics_present_rgba`](#graphics_present_rgba)
    - [Pixel Format & Color Packing](#pixel-format--color-packing)
  - [Frame Pacing](#frame-pacing)
    - [`graphics_wait_frame`](#graphics_wait_frame)
  - [Input Handling](#input-handling)
    - [`graphics_get_mouse`](#graphics_get_mouse)
    - [`graphics_is_key_down`](#graphics_is_key_down)
    - [Virtual Keycode Reference](#virtual-keycode-reference)
- [HTML5 Canvas 2D Vector API (`<graphics_canvas.h>`)](#html5-canvas-2d-vector-api-graphics_canvash)
  - [Frame Swapping & Persistence](#frame-swapping--persistence)
    - [`canvas_present`](#canvas_present)
  - [Rectangles & Clearing](#rectangles--clearing)
    - [`canvas_clear_rect`](#canvas_clear_rect)
    - [`canvas_fill_rect`](#canvas_fill_rect)
    - [`canvas_stroke_rect`](#canvas_stroke_rect)
  - [Path Drawing](#path-drawing)
    - [`canvas_begin_path`](#canvas_begin_path)
    - [`canvas_close_path`](#canvas_close_path)
    - [`canvas_move_to`](#canvas_move_to)
    - [`canvas_line_to`](#canvas_line_to)
    - [`canvas_arc`](#canvas_arc)
    - [`canvas_fill`](#canvas_fill)
    - [`canvas_stroke`](#canvas_stroke)
  - [Styles, Colors & Line Attributes](#styles-colors--line-attributes)
    - [`canvas_set_fill_style`](#canvas_set_fill_style)
    - [`canvas_set_stroke_style`](#canvas_set_stroke_style)
    - [`canvas_set_fill_rgb`](#canvas_set_fill_rgb)
    - [`canvas_set_line_width`](#canvas_set_line_width)
    - [`canvas_set_line_cap`](#canvas_set_line_cap)
  - [Text Rendering](#text-rendering)
    - [`canvas_fill_text`](#canvas_fill_text)
    - [`canvas_stroke_text`](#canvas_stroke_text)
    - [`canvas_set_font`](#canvas_set_font)
  - [Transformations & State Management](#transformations--state-management)
    - [`canvas_save`](#canvas_save)
    - [`canvas_restore`](#canvas_restore)
    - [`canvas_translate`](#canvas_translate)
    - [`canvas_rotate`](#canvas_rotate)
    - [`canvas_scale`](#canvas_scale)
  - [Pixel-Level Manipulation & Framebuffer Interop](#pixel-level-manipulation--framebuffer-interop)
    - [`canvas_get_image_data`](#canvas_get_image_data)
    - [`canvas_put_image_data`](#canvas_put_image_data)
    - [`canvas_get_pixels`](#canvas_get_pixels)
    - [`canvas_put_pixels`](#canvas_put_pixels)
    - [`canvas_get_pixel`](#canvas_get_pixel)
    - [`canvas_set_pixel`](#canvas_set_pixel)
- [Complete C Examples](#complete-c-examples)
  - [Example 1: Software Framebuffer Animation Loop](#example-1-software-framebuffer-animation-loop)
  - [Example 2: Vector Graphics with Matrix Transforms](#example-2-vector-graphics-with-matrix-transforms)
  - [Example 3: Hybrid Vector & Pixel Filter Pipeline](#example-3-hybrid-vector--pixel-filter-pipeline)

---

## Zero Linker Flags Guarantee

All functions declared in `<graphics.h>` and `<graphics_canvas.h>` are resolved directly by WebAssembly host imports provided by `canvas-wasi` (under the `env` import namespace). 

When compiling your C/C++ program with Clang targeting WebAssembly, **no extra static library or `-l` linker flag is needed**:

```bash
clang --target=wasm32-wasi -O2 -I/path/to/canvas-wasi/include app.c -o app.wasm
```

---

## Software Framebuffer API (`<graphics.h>`)

Header location: `include/graphics.h`

```c
#include <graphics.h>
```

### Window Lifecycle

#### `graphics_init`
```c
void graphics_init(int width, int height, const char *title);
```
Initializes the graphics display with the requested logical pixel dimensions and title bar label.
- **`width`**: Render buffer width in pixels (e.g. `640` or `320`).
- **`height`**: Render buffer height in pixels (e.g. `480` or `240`).
- **`title`**: Null-terminated UTF-8 string displayed on the window title bar.
- **Behavior**: If the host UI window is not yet visible, `graphics_init` causes the host to display `#graphics-window` and size the canvas appropriately.

#### `graphics_should_close`
```c
bool graphics_should_close(void);
```
Polls whether window termination has been requested.
- **Returns**: `true` if the user clicked the window close button (`×`), closed the popup window, or pressed the `Escape` key; `false` otherwise.
- **Usage**: Used as the termination condition in standard game/rendering loops:
  ```c
  while (!graphics_should_close()) {
      // update & draw
  }
  ```

#### `graphics_close`
```c
void graphics_close(void);
```
Notifies the host environment to close and hide the graphics window and free associated host resources.

---

### Frame Presentation

#### `graphics_present`
```c
void graphics_present(const uint32_t *pixels);
```
Presents a 32-bit RGBA pixel framebuffer matching the dimensions initialized with `graphics_init(width, height, ...)`.
- **`pixels`**: Pointer to a contiguous array of `width * height` 32-bit unsigned integers in linear memory.
- **Pixel Layout**: Little-endian 32-bit `0xAABBGGRR` (see [Pixel Format](#pixel-format--color-packing) below).
- **Presentation**: Transfers or blits pixels to the screen canvas via `ImageBitmap` or `ImageData`.

#### `graphics_present_rgba`
```c
void graphics_present_rgba(const uint8_t *rgba, int width, int height);
```
Presents a raw byte buffer with custom dimensions.
- **`rgba`**: Pointer to a contiguous byte buffer of `width * height * 4` bytes.
- **`width`**: Buffer width in pixels.
- **`height`**: Buffer height in pixels.
- **Byte Order**: Byte 0: Red, Byte 1: Green, Byte 2: Blue, Byte 3: Alpha.

#### Pixel Format & Color Packing

`canvas-wasi` uses standard little-endian 32-bit RGBA color representation:
- **Byte 0 (bits 0–7)**: Red channel ($0\dots255$)
- **Byte 1 (bits 8–15)**: Green channel ($0\dots255$)
- **Byte 2 (bits 16–23)**: Blue channel ($0\dots255$)
- **Byte 3 (bits 24–31)**: Alpha channel ($0\dots255$, where $255$ is fully opaque)

In integer hexadecimal literals on 32-bit little-endian architectures (`wasm32`), this corresponds to `0xAABBGGRR`:

```c
#define COLOR_RED   0xFF0000FF  // R=255, G=0,   B=0,   A=255
#define COLOR_GREEN 0xFF00FF00  // R=0,   G=255, B=0,   A=255
#define COLOR_BLUE  0xFFFF0000  // R=0,   G=0,   B=255, A=255
#define COLOR_WHITE 0xFFFFFFFF  // R=255, G=255, B=255, A=255
#define COLOR_BLACK 0xFF000000  // R=0,   G=0,   B=0,   A=255

// Helper macro for packing RGBA components:
static inline uint32_t make_rgba(uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
    return ((uint32_t)a << 24) | ((uint32_t)b << 16) | ((uint32_t)g << 8) | (uint32_t)r;
}
```

---

### Frame Pacing

#### `graphics_wait_frame`
```c
void graphics_wait_frame(int target_fps);
```
Synchronizes frame pacing with the specified target frame rate.
- **`target_fps`**: Desired frames per second (e.g. `60`, `30`).
- **Mechanism**: Calculates elapsed time since the previous frame. If running inside a Web Worker with `SharedArrayBuffer` support, it calls `Atomics.wait()` on a dedicated synchronization word to sleep the remainder of the frame interval without busy-looping or consuming 100% CPU.
- **Host FPS Tracker**: Updates the real-time FPS counter displayed on the window header badge.

---

### Input Handling

#### `graphics_get_mouse`
```c
void graphics_get_mouse(int *x, int *y, int *buttons, int *wheel);
```
Reads the current mouse cursor coordinates, mouse button bitmask, and accumulated vertical scroll delta.
- **`x`**: Pointer to write mouse X coordinate, mapped into the canvas render buffer coordinate system ($0 \le x < \text{width}$).
- **`y`**: Pointer to write mouse Y coordinate, mapped into the canvas render buffer coordinate system ($0 \le y < \text{height}$).
- **`buttons`**: Pointer to write the button bitmask:
  - `buttons & 1`: Primary / Left button is held down.
  - `buttons & 2`: Secondary / Right button is held down.
  - `buttons & 4`: Auxiliary / Middle button is held down.
- **`wheel`**: Pointer to write the accumulated vertical mouse wheel delta (positive when scrolling down, negative when scrolling up).
- **Note**: Any parameter pointer can be passed as `NULL` if not needed.

#### `graphics_is_key_down`
```c
bool graphics_is_key_down(int key);
```
Inspects whether a specific keyboard key is currently pressed.
- **`key`**: Standard virtual keycode or ASCII value (see [Virtual Keycode Reference](#virtual-keycode-reference)).
- **Returns**: `true` if the key is currently held down; `false` otherwise.

#### Virtual Keycode Reference

Keycodes align with the unified `DOM_KEY_MAP` standard:

| Category | Key Identifier | Keycode Constant / Value |
|---|---|---|
| **Letters** | `A` – `Z` | `65` – `90` (`'A'` – `'Z'`) |
| **Digits** | `0` – `9` | `48` – `57` (`'0'` – `'9'`) |
| **Punctuation / ASCII** | Space | `32` |
| | Minus (`-`) / Equals (`=`) | `45` / `61` |
| | BracketLeft (`[`) / BracketRight (`]`) | `91` / `93` |
| | Semicolon (`;`) / Quote (`'`) | `59` / `39` |
| | Comma (`,`) / Period (`.`) / Slash (`/`) | `44` / `46` |
| **Control Keys** | Escape | `256` |
| | Enter | `257` |
| | Tab | `258` |
| | Backspace | `259` |
| | Insert / Delete | `260` / `261` |
| **Navigation** | ArrowRight | `262` |
| | ArrowLeft | `263` |
| | ArrowDown | `264` |
| | ArrowUp | `265` |
| | PageUp / PageDown | `266` / `267` |
| | Home / End | `268` / `269` |
| **Function Keys** | `F1` – `F12` | `290` – `301` |
| **Numpad** | `Numpad0` – `Numpad9` | `320` – `329` |
| | `NumpadEnter` / `NumpadAdd` / `NumpadSubtract` | `335` / `334` / `333` |
| **Modifiers** | Left Shift / Right Shift | `340` / `344` |
| | Left Ctrl / Right Ctrl | `341` / `345` |
| | Left Alt / Right Alt | `342` / `346` |
| | Left Super / Right Super | `343` / `347` |

---

## HTML5 Canvas 2D Vector API (`<graphics_canvas.h>`)

Header location: `include/graphics_canvas.h`

```c
#include <graphics_canvas.h>
```

`<graphics_canvas.h>` automatically includes `<graphics.h>` and mirrors the browser's `CanvasRenderingContext2D` API for hardware-accelerated vector rendering, path construction, text formatting, and matrix transformations directly in C.

---

### Frame Swapping & Persistence

#### `canvas_present`
```c
void canvas_present(void);
```
Presents the vector canvas onto the screen.
- **State Preservation**: Unlike raw WebGL or default `transferToImageBitmap()`, `canvas-wasi` preserves the canvas drawing surface across frames using an internal intermediate cloning buffer. You do **not** need to redraw stationary scene elements every frame unless you explicitly call `canvas_clear_rect()`.

---

### Rectangles & Clearing

#### `canvas_clear_rect`
```c
void canvas_clear_rect(float x, float y, float w, float h);
```
Erases the rectangular area `(x, y, w, h)` to fully transparent black (`rgba(0, 0, 0, 0)`).

#### `canvas_fill_rect`
```c
void canvas_fill_rect(float x, float y, float w, float h);
```
Fills a rectangle using the current fill style.

#### `canvas_stroke_rect`
```c
void canvas_stroke_rect(float x, float y, float w, float h);
```
Outlines a rectangle using the current stroke style and line width.

---

### Path Drawing

#### `canvas_begin_path`
```c
void canvas_begin_path(void);
```
Starts a new subpath list, discarding any previous path geometry.

#### `canvas_close_path`
```c
void canvas_close_path(void);
```
Adds a straight line segment from the current position back to the beginning of the current subpath.

#### `canvas_move_to`
```c
void canvas_move_to(float x, float y);
```
Begins a new subpath at point `(x, y)`.

#### `canvas_line_to`
```c
void canvas_line_to(float x, float y);
```
Connects the last point in the current subpath to `(x, y)` with a straight line.

#### `canvas_arc`
```c
void canvas_arc(float x, float y, float radius, float start_angle, float end_angle, bool counterclockwise);
```
Appends a circular arc to the path centered at `(x, y)`.
- **`radius`**: Arc radius in pixels.
- **`start_angle`**: Starting angle in radians (e.g. `0.0f`).
- **`end_angle`**: Ending angle in radians (e.g. `2.0f * 3.14159265f` for a full circle).
- **`counterclockwise`**: `true` to draw counterclockwise; `false` to draw clockwise.

#### `canvas_fill`
```c
void canvas_fill(void);
```
Fills the current or given path with the current fill style.

#### `canvas_stroke`
```c
void canvas_stroke(void);
```
Strokes the current or given path with the current stroke style and line width.

---

### Styles, Colors & Line Attributes

#### `canvas_set_fill_style`
```c
void canvas_set_fill_style(const char *style);
```
Sets the color or style used when filling shapes. Accepts standard CSS color strings:
```c
canvas_set_fill_style("#FF5722");
canvas_set_fill_style("rgba(33, 150, 243, 0.8)");
canvas_set_fill_style("gold");
```

#### `canvas_set_stroke_style`
```c
void canvas_set_stroke_style(const char *style);
```
Sets the color or style used when stroking paths. Accepts standard CSS color strings.

#### `canvas_set_fill_rgb`
```c
void canvas_set_fill_rgb(uint8_t r, uint8_t g, uint8_t b);
```
Convenience helper to set opaque RGB fill style without allocating or formatting string literals in C:
```c
canvas_set_fill_rgb(255, 128, 0); // Equivalent to "rgb(255, 128, 0)"
```

#### `canvas_set_line_width`
```c
void canvas_set_line_width(float width);
```
Sets the thickness of stroked lines in pixels. Default is `1.0f`.

#### `canvas_set_line_cap`
```c
void canvas_set_line_cap(const char *cap);
```
Specifies the shape used to draw the end points of lines.
- **Values**: `"butt"`, `"round"`, or `"square"`.

---

### Text Rendering

#### `canvas_fill_text`
```c
void canvas_fill_text(const char *text, float x, float y);
```
Renders filled text at the coordinates `(x, y)`.
- **`text`**: Null-terminated UTF-8 string.
- **`x`**: Baseline X position.
- **`y`**: Baseline Y position.

#### `canvas_stroke_text`
```c
void canvas_stroke_text(const char *text, float x, float y);
```
Renders stroked outline text at coordinates `(x, y)`.

#### `canvas_set_font`
```c
void canvas_set_font(const char *font);
```
Sets the font used for text operations using standard CSS font syntax:
```c
canvas_set_font("16px monospace");
canvas_set_font("bold 24px sans-serif");
```

---

### Transformations & State Management

#### `canvas_save`
```c
void canvas_save(void);
```
Pushes the current canvas state (styles, transformations, clipping) onto the state stack.

#### `canvas_restore`
```c
void canvas_restore(void);
```
Pops the topmost canvas state from the state stack, restoring previous styles and transforms.

#### `canvas_translate`
```c
void canvas_translate(float x, float y);
```
Adds a translation transformation to the current matrix, moving the canvas origin by `(x, y)`.

#### `canvas_rotate`
```c
void canvas_rotate(float radians);
```
Adds a rotation to the current transformation matrix. Angle is in radians (positive = clockwise).

#### `canvas_scale`
```c
void canvas_scale(float sx, float sy);
```
Applies scaling transformations to the canvas units horizontally (`sx`) and vertically (`sy`).

---

### Pixel-Level Manipulation & Framebuffer Interop

`<graphics_canvas.h>` allows querying and modifying the rasterized 2D canvas backing store with direct pixel arrays.

#### `canvas_get_image_data`
```c
void canvas_get_image_data(int sx, int sy, int sw, int sh, uint32_t *pixels_out);
```
Copies pixel data from the specified rectangular region `(sx, sy, sw, sh)` of the canvas into a caller-allocated `pixels_out` buffer (`sw * sh` 32-bit unsigned integers).

#### `canvas_put_image_data`
```c
void canvas_put_image_data(int dx, int dy, int dw, int dh, const uint32_t *pixels_in);
```
Paints data from the `pixels_in` buffer (`dw * dh` elements) onto the canvas at destination position `(dx, dy)`.

#### `canvas_get_pixels`
```c
void canvas_get_pixels(uint32_t *pixels_out);
```
Captures the entire canvas drawing surface into `pixels_out` (`width * height * sizeof(uint32_t)` bytes).

#### `canvas_put_pixels`
```c
void canvas_put_pixels(const uint32_t *pixels_in);
```
Replaces the entire canvas drawing surface with the contents of `pixels_in`.

#### `canvas_get_pixel`
```c
uint32_t canvas_get_pixel(int x, int y);
```
Reads a single 32-bit `0xAABBGGRR` pixel color at coordinates `(x, y)`.

#### `canvas_set_pixel`
```c
void canvas_set_pixel(int x, int y, uint32_t color);
```
Writes a single 32-bit `0xAABBGGRR` pixel color at coordinates `(x, y)`.

---

## Complete C Examples

### Example 1: Software Framebuffer Animation Loop

Creates a 320x240 software framebuffer, draws an interactive circle following the mouse cursor, and handles the ESC key.

```c
#include <graphics.h>
#include <stdint.h>
#include <stdbool.h>

#define WIDTH 320
#define HEIGHT 240

static uint32_t framebuffer[WIDTH * HEIGHT];

int main(void) {
    graphics_init(WIDTH, HEIGHT, "Software Framebuffer Demo");

    while (!graphics_should_close()) {
        int mx, my, buttons, wheel;
        graphics_get_mouse(&mx, &my, &buttons, &wheel);

        // Exit on Escape key
        if (graphics_is_key_down(256)) {
            break;
        }

        // Fill background with dark grey (0xAABBGGRR)
        for (int i = 0; i < WIDTH * HEIGHT; i++) {
            framebuffer[i] = 0xFF202020;
        }

        // Draw interactive circle around mouse cursor
        int radius = (buttons & 1) ? 20 : 10;
        uint32_t circle_color = (buttons & 1) ? 0xFF0055FF : 0xFF00FF55;

        for (int dy = -radius; dy <= radius; dy++) {
            for (int dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy <= radius * radius) {
                    int px = mx + dx;
                    int py = my + dy;
                    if (px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) {
                        framebuffer[py * WIDTH + px] = circle_color;
                    }
                }
            }
        }

        graphics_present(framebuffer);
        graphics_wait_frame(60); // 60 FPS pacing
    }

    graphics_close();
    return 0;
}
```

---

### Example 2: Vector Graphics with Matrix Transforms

Draws a rotating star and anti-aliased geometric primitives using `<graphics_canvas.h>`.

```c
#include <graphics_canvas.h>
#include <math.h>

#define WIDTH 640
#define HEIGHT 480

int main(void) {
    graphics_init(WIDTH, HEIGHT, "Canvas 2D Vector Demo");

    float angle = 0.0f;

    while (!graphics_should_close()) {
        // Clear screen
        canvas_clear_rect(0, 0, WIDTH, HEIGHT);

        // Draw header text
        canvas_set_font("18px sans-serif");
        canvas_set_fill_style("#ffffff");
        canvas_fill_text("HTML5 Canvas 2D Vector Engine", 20, 40);

        // Save context and apply rotation around center
        canvas_save();
        canvas_translate(WIDTH / 2.0f, HEIGHT / 2.0f);
        canvas_rotate(angle);

        // Draw spinning rectangle
        canvas_set_fill_style("#ff5722");
        canvas_fill_rect(-60, -60, 120, 120);

        // Draw stroked circle
        canvas_begin_path();
        canvas_arc(0, 0, 90, 0, 3.14159265f * 2.0f, false);
        canvas_set_stroke_style("#00e5ff");
        canvas_set_line_width(4.0f);
        canvas_stroke();

        canvas_restore();

        // Increment rotation angle
        angle += 0.02f;

        canvas_present();
        graphics_wait_frame(60);
    }

    graphics_close();
    return 0;
}
```

---

### Example 3: Hybrid Vector & Pixel Filter Pipeline

Renders vector text onto the canvas, then uses `canvas_get_pixels()` and `canvas_put_pixels()` to apply an image inversion filter.

```c
#include <graphics_canvas.h>
#include <stdint.h>
#include <stdlib.h>

#define WIDTH 400
#define HEIGHT 300

int main(void) {
    graphics_init(WIDTH, HEIGHT, "Hybrid Canvas & Pixel Demo");

    // 1. Draw vector background and text
    canvas_set_fill_style("#1e1e1e");
    canvas_fill_rect(0, 0, WIDTH, HEIGHT);

    canvas_set_fill_style("#4caf50");
    canvas_set_font("bold 28px sans-serif");
    canvas_fill_text("Vector Text", 100, 150);

    // 2. Read pixels into C buffer
    uint32_t *pixels = malloc(WIDTH * HEIGHT * sizeof(uint32_t));
    if (!pixels) return 1;

    canvas_get_pixels(pixels);

    // 3. Invert color channels (Byte 0: R, Byte 1: G, Byte 2: B)
    for (int i = 0; i < WIDTH * HEIGHT; i++) {
        uint32_t p = pixels[i];
        uint8_t r = p & 0xFF;
        uint8_t g = (p >> 8) & 0xFF;
        uint8_t b = (p >> 16) & 0xFF;
        uint8_t a = (p >> 24) & 0xFF;

        pixels[i] = ((uint32_t)a << 24) | ((uint32_t)(255 - b) << 16) | 
                    ((uint32_t)(255 - g) << 8) | (uint32_t)(255 - r);
    }

    // 4. Write inverted pixels back to canvas and present
    canvas_put_pixels(pixels);
    canvas_present();

    free(pixels);

    while (!graphics_should_close()) {
        graphics_wait_frame(30);
    }

    graphics_close();
    return 0;
}
```
