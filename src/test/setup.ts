import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class DataTransferPolyfill {
  private _data: Record<string, string> = {};
  types: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  files: any = Object.assign([], { item: () => null });
  effectAllowed: string = "uninitialized";
  dropEffect: string = "none";

  setData(type: string, val: string): void {
    this._data[type] = val;
    if (!this.types.includes(type)) this.types.push(type);
  }
  getData(type: string): string {
    return this._data[type] ?? "";
  }
  clearData(type?: string): void {
    if (type) {
      delete this._data[type];
      this.types = this.types.filter((t) => t !== type);
    } else {
      this._data = {};
      this.types = [];
    }
  }
  setDragImage(): void {}
}

if (typeof DataTransfer === "undefined") {
  // @ts-ignore
  global.DataTransfer = DataTransferPolyfill;
}

function ensureDragTransfer(e: Event): void {
  const de = e as DragEvent;
  if (de.dataTransfer === null || de.dataTransfer === undefined) {
    Object.defineProperty(de, "dataTransfer", {
      value: new DataTransferPolyfill(),
      configurable: true,
      writable: true,
    });
  }
}

for (const type of ["dragstart", "dragover", "dragenter", "dragleave", "drop", "dragend"]) {
  document.addEventListener(type, ensureDragTransfer, true);
}

afterEach(() => {
  cleanup();
});
