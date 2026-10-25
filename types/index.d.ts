// Type definitions for canvas-wasi

export interface GraphicsWindowUIOptions {
  width?: number;
  height?: number;
  title?: string;
  onCloseRequested?: () => void;
  onFocusChange?: (focused: boolean) => void;
  onFrameActivity?: (active: boolean) => void;
  sharedBuffer?: SharedArrayBuffer | null;
  inputCoordinator?: InputCoordinator | null;
}

export class GraphicsWindowUI {
  constructor(options?: GraphicsWindowUIOptions);
  width: number;
  height: number;
  title: string;
  isPoppedOut: boolean;
  isMinimized: boolean;
  open(width?: number, height?: number, title?: string): void;
  close(): void;
  show(): void;
  hide(): void;
  toggle(): void;
  toggleMinimize(): void;
  togglePopOut(): void;
  dockBack(): void;
  isOpen(): boolean;
  isCanvasVisible(): boolean;
  renderBitmap(bitmap: ImageBitmap): void;
  renderFrame(bitmap: ImageBitmap): void;
  renderFrameBuffer(buffer: ArrayBuffer | ArrayBufferView, width: number, height: number): void;
  updateFps(fps: number): void;
  updateFPS(fps: number): void;
  setInputCoordinator(inputCoordinator: InputCoordinator): void;
  setActivity(active: boolean): void;
  clearActivity(): void;
}

export interface InputCoordinatorOptions {
  sharedBuffer?: SharedArrayBuffer | null;
  canvas?: HTMLCanvasElement | null;
  width?: number;
  height?: number;
  dpiScale?: number;
}

export class InputCoordinator {
  constructor(options?: InputCoordinatorOptions);
  windowWidth: number;
  windowHeight: number;
  renderWidth: number;
  renderHeight: number;
  dpiScale: number;
  shouldClose: boolean;
  mouseX: number;
  mouseY: number;
  mouseButtons: number;
  mouseWheelX: number;
  mouseWheelY: number;
  keysDown: Uint32Array;
  attachListeners(canvas: HTMLCanvasElement, windowTarget?: Window | null): void;
  detach(): void;
  reset(): void;
  updateSharedState(): void;
  pollToWasm(destPtr: number, mem: WebAssembly.Memory): void;
  addListener(fn: (event: any) => void): () => void;
}

export const DOM_KEY_MAP: Record<string, number>;

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
