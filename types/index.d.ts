// Type definitions for canvas-wasi

export {
  CanvasWindow,
  CanvasWindowOptions,
  GraphicsWindowUI,
  GraphicsWindowUIOptions,
  InputCoordinator,
  InputCoordinatorOptions,
  DOM_KEY_MAP,
  INPUT_BUFFER_SIZE,
  INPUT_LAYOUT_OFFSETS,
  OFF_WINDOW_WIDTH,
  OFF_WINDOW_HEIGHT,
  OFF_RENDER_WIDTH,
  OFF_RENDER_HEIGHT,
  OFF_DPI_SCALE,
  OFF_SHOULD_CLOSE,
  OFF_MOUSE_X,
  OFF_MOUSE_Y,
  OFF_MOUSE_WHEEL_X,
  OFF_MOUSE_WHEEL_Y,
  OFF_MOUSE_BUTTONS,
  OFF_KEYS_DOWN,
  OFF_KEY_PRESSED_COUNT,
  OFF_KEY_PRESSED_QUEUE,
  OFF_CHAR_PRESSED_COUNT,
  OFF_CHAR_PRESSED_QUEUE,
  OFF_FRAME_SYNC,
  OFF_RESERVED,
  MOUSE_BUTTON_LEFT,
  MOUSE_BUTTON_RIGHT,
  MOUSE_BUTTON_MIDDLE
} from 'canvas-window';

import type { InputCoordinator } from 'canvas-window';

export interface CreateGraphicsImportsOptions {
  getMemory?: () => WebAssembly.Memory | null;
  memory?: WebAssembly.Memory | null;
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

export interface GraphicsImportsResult {
  graphics: Record<string, Function>;
  canvas: Record<string, Function>;
  env: Record<string, Function>;
  handleInputEvent: (event: any) => void;
}

export function createGraphicsImports(options?: CreateGraphicsImportsOptions): GraphicsImportsResult;

export const GRAPHICS_H: string;
export const GRAPHICS_CANVAS_H: string;
