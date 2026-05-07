"use client";

export function useKeyboardAware() {
  if (typeof window === "undefined") {
    return { keyboardOpen: false };
  }

  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    return { keyboardOpen: false };
  }

  const keyboardOpen =
    visualViewport.height < window.innerHeight * 0.75;

  return { keyboardOpen };
}

export function addKeyboardListener(callback: (open: boolean) => void): () => void {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return () => {};

  const handler = () => {
    const open = vv.height < window.innerHeight * 0.75;
    callback(open);
  };

  vv.addEventListener("resize", handler);
  return () => vv.removeEventListener("resize", handler);
}
