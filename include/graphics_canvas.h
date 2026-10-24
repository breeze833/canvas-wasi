/*
 * canvas-wasi: Minimal HTML5 Canvas 2D Vector API for WASI
 * https://github.com/breeze833/canvas-wasi
 */
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
