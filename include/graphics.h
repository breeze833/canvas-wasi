/*
 * canvas-wasi: Minimal Generic Graphics & Framebuffer Header for WASI
 * https://github.com/breeze833/canvas-wasi
 */
#ifndef _GRAPHICS_H
#define _GRAPHICS_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Initialize graphics canvas window */
void graphics_init(int width, int height, const char *title);

/* Present a 32-bit RGBA pixel framebuffer (width * height * 4 bytes) */
void graphics_present(const uint32_t *pixels);

/* Present a raw RGBA byte buffer with custom dimensions */
void graphics_present_rgba(const uint8_t *rgba, int width, int height);

/* Returns true if the user has requested closing the window */
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
