// canvas-wasi: WebAssembly Host Import Provider for Graphics and 2D Canvas

export function createGraphicsImports(options = {}) {
  const getMemory = typeof options.getMemory === 'function' ? options.getMemory : () => options.memory || null;
  const sharedBuffer = options.sharedBuffer || null;
  const inputCoordinator = options.inputCoordinator || null;

  const postMessage = typeof options.postMessage === 'function' ? options.postMessage : null;
  const onInit = options.onInit || (postMessage ? (data) => postMessage({ type: 'graphics_init', ...data }) : () => {});
  const onFrame = options.onFrame || (postMessage ? (bitmap) => postMessage({ type: 'frame', bitmap }, [bitmap]) : () => {});
  const onFrameBuffer = options.onFrameBuffer || (postMessage ? (buffer, width, height) => postMessage({ type: 'frame_buffer', buffer, width, height }, [buffer]) : () => {});
  const onFps = options.onFps || (postMessage ? (fps) => postMessage({ type: 'fps', fps }) : () => {});
  const onClose = options.onClose || (postMessage ? () => postMessage({ type: 'graphics_close' }) : () => {});

  let gfxWidth = options.width || 800;
  let gfxHeight = options.height || 450;
  let lastFrameTime = performance.now();
  let lastFpsTime = performance.now();
  let frameCount = 0;

  // Local fallback input state if no SharedArrayBuffer is provided
  let currentMouseX = -1;
  let currentMouseY = -1;
  let currentMouseButtons = 0;
  let currentMouseWheel = 0;
  const currentKeysDown = new Uint8Array(512);

  // Offscreen 2D canvas context for vector canvas API
  let offscreen2d = options.offscreenCanvas || null;
  let ctx2d = null;
  let cloneCanvas = null;
  let cloneCtx = null;

  function get2dContext() {
    if (!offscreen2d && typeof OffscreenCanvas !== 'undefined') {
      try {
        offscreen2d = new OffscreenCanvas(gfxWidth, gfxHeight);
      } catch (_) {
        offscreen2d = null;
      }
    }
    if (offscreen2d && !ctx2d) {
      try {
        ctx2d = offscreen2d.getContext('2d', { willReadFrequently: true });
      } catch (_) {
        ctx2d = null;
      }
    }
    return ctx2d;
  }

  const utf8Decoder = new TextDecoder('utf-8');
  function decodeStr(ptr) {
    if (!ptr) return '';
    const mem = getMemory();
    if (!mem || !mem.buffer) return '';
    const u8 = new Uint8Array(mem.buffer);
    let end = ptr;
    while (end < u8.length && u8[end] !== 0) end++;
    try {
      return utf8Decoder.decode(u8.subarray(ptr, end));
    } catch (_) {
      return '';
    }
  }

  function finishPresent() {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      try { onFps(fps); } catch (_) {}
      frameCount = 0;
      lastFpsTime = now;
    }
  }

  function presentBuffer(ptr, w, h) {
    const mem = getMemory();
    if (!mem || !ptr || w <= 0 || h <= 0) return;
    const byteLen = w * h * 4;

    try {
      const ctx = get2dContext();
      if (ctx && offscreen2d) {
        if (offscreen2d.width !== w || offscreen2d.height !== h) {
          offscreen2d.width = w;
          offscreen2d.height = h;
        }
        const imgData = ctx.createImageData(w, h);
        imgData.data.set(new Uint8Array(mem.buffer, ptr, byteLen));
        ctx.putImageData(imgData, 0, 0);

        if (typeof offscreen2d.transferToImageBitmap === 'function') {
          try {
            const bitmap = offscreen2d.transferToImageBitmap();
            if (bitmap) {
              onFrame(bitmap);
              finishPresent();
              return;
            }
          } catch (_) {}
        }
      }

      // Synchronous transferable ArrayBuffer fallback
      const copyBuffer = mem.buffer.slice(ptr, ptr + byteLen);
      onFrameBuffer(copyBuffer, w, h);
    } catch (_) {}

    finishPresent();
  }

  const graphics = {
    graphics_init: (w, h, titlePtr) => {
      gfxWidth = w > 0 ? w : 800;
      gfxHeight = h > 0 ? h : 450;
      if (offscreen2d) {
        offscreen2d.width = gfxWidth;
        offscreen2d.height = gfxHeight;
      }
      const titleStr = decodeStr(titlePtr) || 'Graphics Display';
      try {
        onInit({ width: gfxWidth, height: gfxHeight, title: titleStr });
      } catch (_) {}
    },

    graphics_present: (pixelsPtr) => {
      presentBuffer(pixelsPtr, gfxWidth, gfxHeight);
    },

    graphics_present_rgba: (rgbaPtr, w, h) => {
      presentBuffer(rgbaPtr, w, h);
    },

    graphics_wait_frame: (targetFps) => {
      const fps = targetFps > 0 ? targetFps : 60;
      const targetDelta = 1000 / fps;
      const now = performance.now();
      const elapsed = now - lastFrameTime;
      const waitMs = Math.max(1, Math.floor(targetDelta - elapsed));

      if (sharedBuffer && typeof Atomics !== 'undefined') {
        const syncWord = new Int32Array(sharedBuffer, 372, 1);
        Atomics.wait(syncWord, 0, 0, Math.min(waitMs, 50));
      }
      lastFrameTime = performance.now();
    },

    graphics_should_close: () => {
      if (sharedBuffer) {
        const v = new DataView(sharedBuffer);
        return v.getInt32(20, true) !== 0 ? 1 : 0;
      }
      if (inputCoordinator) {
        return inputCoordinator.shouldClose ? 1 : 0;
      }
      return 0;
    },

    graphics_close: () => {
      try { onClose(); } catch (_) {}
    },

    graphics_get_mouse: (xPtr, yPtr, btnPtr, wheelPtr) => {
      let mx = -1;
      let my = -1;
      let btn = 0;
      let wheel = 0;

      if (sharedBuffer) {
        const v = new DataView(sharedBuffer);
        mx = Math.round(v.getFloat32(24, true));
        my = Math.round(v.getFloat32(28, true));
        wheel = Math.round(v.getFloat32(36, true));
        btn = v.getUint32(40, true);
      } else if (inputCoordinator) {
        mx = Math.round(inputCoordinator.mouseX);
        my = Math.round(inputCoordinator.mouseY);
        btn = inputCoordinator.mouseButtons;
        wheel = Math.round(inputCoordinator.mouseWheelY);
      } else {
        mx = currentMouseX;
        my = currentMouseY;
        btn = currentMouseButtons;
        wheel = currentMouseWheel;
      }

      const mem = getMemory();
      if (mem && mem.buffer) {
        const memView = new DataView(mem.buffer);
        if (xPtr) memView.setInt32(xPtr, mx, true);
        if (yPtr) memView.setInt32(yPtr, my, true);
        if (btnPtr) memView.setUint32(btnPtr, btn, true);
        if (wheelPtr) memView.setInt32(wheelPtr, wheel, true);
      }
    },

    graphics_is_key_down: (key) => {
      if (sharedBuffer && key >= 0 && key < 512) {
        const v = new DataView(sharedBuffer);
        const word = Math.floor(key / 32);
        const bit = key % 32;
        const wordVal = v.getUint32(44 + word * 4, true);
        return ((wordVal >>> bit) & 1) ? 1 : 0;
      }
      if (inputCoordinator && key >= 0 && key < 512) {
        const word = Math.floor(key / 32);
        const bit = key % 32;
        return ((inputCoordinator.keysDown[word] >>> bit) & 1) ? 1 : 0;
      }
      if (key >= 0 && key < 512) {
        return currentKeysDown[key] ? 1 : 0;
      }
      return 0;
    }
  };

  const canvas = {
    canvas_present: () => {
      if (!offscreen2d) return;
      try {
        if (typeof OffscreenCanvas !== 'undefined') {
          if (!cloneCanvas || cloneCanvas.width !== offscreen2d.width || cloneCanvas.height !== offscreen2d.height) {
            cloneCanvas = new OffscreenCanvas(offscreen2d.width, offscreen2d.height);
            cloneCtx = cloneCanvas.getContext('2d');
          }
          if (cloneCtx && typeof cloneCanvas.transferToImageBitmap === 'function') {
            cloneCtx.drawImage(offscreen2d, 0, 0);
            const bitmap = cloneCanvas.transferToImageBitmap();
            if (bitmap) {
              onFrame(bitmap);
              finishPresent();
              return;
            }
          }
        }
      } catch (_) {}
      if (typeof createImageBitmap !== 'undefined') {
        createImageBitmap(offscreen2d).then((bitmap) => {
          onFrame(bitmap);
        }).catch(() => {});
      }
      finishPresent();
    },

    canvas_clear_rect: (x, y, w, h) => {
      const ctx = get2dContext();
      if (ctx) ctx.clearRect(x, y, w, h);
    },

    canvas_fill_rect: (x, y, w, h) => {
      const ctx = get2dContext();
      if (ctx) ctx.fillRect(x, y, w, h);
    },

    canvas_stroke_rect: (x, y, w, h) => {
      const ctx = get2dContext();
      if (ctx) ctx.strokeRect(x, y, w, h);
    },

    canvas_begin_path: () => {
      const ctx = get2dContext();
      if (ctx) ctx.beginPath();
    },

    canvas_close_path: () => {
      const ctx = get2dContext();
      if (ctx) ctx.closePath();
    },

    canvas_move_to: (x, y) => {
      const ctx = get2dContext();
      if (ctx) ctx.moveTo(x, y);
    },

    canvas_line_to: (x, y) => {
      const ctx = get2dContext();
      if (ctx) ctx.lineTo(x, y);
    },

    canvas_arc: (x, y, radius, startAngle, endAngle, counterclockwise) => {
      const ctx = get2dContext();
      if (ctx) ctx.arc(x, y, radius, startAngle, endAngle, Boolean(counterclockwise));
    },

    canvas_fill: () => {
      const ctx = get2dContext();
      if (ctx) ctx.fill();
    },

    canvas_stroke: () => {
      const ctx = get2dContext();
      if (ctx) ctx.stroke();
    },

    canvas_set_fill_style: (stylePtr) => {
      const ctx = get2dContext();
      if (ctx) ctx.fillStyle = decodeStr(stylePtr);
    },

    canvas_set_stroke_style: (stylePtr) => {
      const ctx = get2dContext();
      if (ctx) ctx.strokeStyle = decodeStr(stylePtr);
    },

    canvas_set_fill_rgb: (r, g, b) => {
      const ctx = get2dContext();
      if (ctx) ctx.fillStyle = `rgb(${r & 255},${g & 255},${b & 255})`;
    },

    canvas_set_line_width: (width) => {
      const ctx = get2dContext();
      if (ctx) ctx.lineWidth = width;
    },

    canvas_set_line_cap: (capPtr) => {
      const ctx = get2dContext();
      if (ctx) ctx.lineCap = decodeStr(capPtr);
    },

    canvas_fill_text: (textPtr, x, y) => {
      const ctx = get2dContext();
      if (ctx) ctx.fillText(decodeStr(textPtr), x, y);
    },

    canvas_stroke_text: (textPtr, x, y) => {
      const ctx = get2dContext();
      if (ctx) ctx.strokeText(decodeStr(textPtr), x, y);
    },

    canvas_set_font: (fontPtr) => {
      const ctx = get2dContext();
      if (ctx) ctx.font = decodeStr(fontPtr);
    },

    canvas_save: () => {
      const ctx = get2dContext();
      if (ctx) ctx.save();
    },

    canvas_restore: () => {
      const ctx = get2dContext();
      if (ctx) ctx.restore();
    },

    canvas_translate: (x, y) => {
      const ctx = get2dContext();
      if (ctx) ctx.translate(x, y);
    },

    canvas_rotate: (rad) => {
      const ctx = get2dContext();
      if (ctx) ctx.rotate(rad);
    },

    canvas_scale: (sx, sy) => {
      const ctx = get2dContext();
      if (ctx) ctx.scale(sx, sy);
    },

    canvas_get_image_data: (sx, sy, sw, sh, outPtr) => {
      const mem = getMemory();
      if (!mem || !outPtr || sw <= 0 || sh <= 0) return;
      const ctx = get2dContext();
      if (!ctx) return;
      try {
        const imgData = ctx.getImageData(sx, sy, sw, sh);
        new Uint8Array(mem.buffer, outPtr, sw * sh * 4).set(imgData.data);
      } catch (_) {}
    },

    canvas_put_image_data: (dx, dy, dw, dh, inPtr) => {
      const mem = getMemory();
      if (!mem || !inPtr || dw <= 0 || dh <= 0) return;
      const ctx = get2dContext();
      if (!ctx) return;
      try {
        const imgData = ctx.createImageData(dw, dh);
        imgData.data.set(new Uint8Array(mem.buffer, inPtr, dw * dh * 4));
        ctx.putImageData(imgData, dx, dy);
      } catch (_) {}
    },

    canvas_get_pixels: (outPtr) => {
      const mem = getMemory();
      if (!mem || !outPtr || gfxWidth <= 0 || gfxHeight <= 0) return;
      const ctx = get2dContext();
      if (!ctx) return;
      try {
        const imgData = ctx.getImageData(0, 0, gfxWidth, gfxHeight);
        new Uint8Array(mem.buffer, outPtr, gfxWidth * gfxHeight * 4).set(imgData.data);
      } catch (_) {}
    },

    canvas_put_pixels: (inPtr) => {
      const mem = getMemory();
      if (!mem || !inPtr || gfxWidth <= 0 || gfxHeight <= 0) return;
      const ctx = get2dContext();
      if (!ctx) return;
      try {
        const imgData = ctx.createImageData(gfxWidth, gfxHeight);
        imgData.data.set(new Uint8Array(mem.buffer, inPtr, gfxWidth * gfxHeight * 4));
        ctx.putImageData(imgData, 0, 0);
      } catch (_) {}
    },

    canvas_get_pixel: (x, y) => {
      if (x < 0 || x >= gfxWidth || y < 0 || y >= gfxHeight) return 0;
      const ctx = get2dContext();
      if (!ctx) return 0;
      try {
        const p = ctx.getImageData(x, y, 1, 1).data;
        return ((p[3] << 24) | (p[2] << 16) | (p[1] << 8) | p[0]) >>> 0;
      } catch (_) {
        return 0;
      }
    },

    canvas_set_pixel: (x, y, color) => {
      if (x < 0 || x >= gfxWidth || y < 0 || y >= gfxHeight) return;
      const ctx = get2dContext();
      if (!ctx) return;
      try {
        const r = color & 0xFF;
        const g = (color >> 8) & 0xFF;
        const b = (color >> 16) & 0xFF;
        const a = (color >> 24) & 0xFF;
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
        ctx.fillRect(x, y, 1, 1);
      } catch (_) {}
    }
  };

  return {
    graphics,
    canvas,
    // Combined imports object ready to spread into Wasm env
    env: {
      ...graphics,
      ...canvas
    },
    // Helper to feed input events when not using SharedArrayBuffer
    handleInputEvent: (event) => {
      if (!event) return;
      if (event.type === 'mouse') {
        currentMouseX = event.x;
        currentMouseY = event.y;
        currentMouseButtons = event.buttons;
        currentMouseWheel = event.wheel || 0;
      } else if (event.type === 'keydown' && event.key >= 0 && event.key < 512) {
        currentKeysDown[event.key] = 1;
      } else if (event.type === 'keyup' && event.key >= 0 && event.key < 512) {
        currentKeysDown[event.key] = 0;
      } else if (event.type === 'blur') {
        currentKeysDown.fill(0);
        currentMouseButtons = 0;
      }
    }
  };
}
