"use client";

import * as React from "react";

export interface ShortcutItem {
  id: string;
  label: string;
  group?: string;
  keys: string[];
  onTrigger?: () => void;
}

interface ShortcutsRegistryState {
  shortcuts: ShortcutItem[];
}

type ShortcutsRegistryAction =
  | { type: "register"; shortcuts: ShortcutItem[] }
  | { type: "unregister"; ids: string[] };

function reducer(state: ShortcutsRegistryState, action: ShortcutsRegistryAction): ShortcutsRegistryState {
  if (action.type === "register") {
    const existing = new Set(state.shortcuts.map((s) => s.id));
    const fresh = action.shortcuts.filter((s) => !existing.has(s.id));
    return { shortcuts: [...state.shortcuts, ...fresh] };
  }
  if (action.type === "unregister") {
    const ids = new Set(action.ids);
    return { shortcuts: state.shortcuts.filter((s) => !ids.has(s.id)) };
  }
  return state;
}

interface ShortcutsRegistryContext {
  shortcuts: ShortcutItem[];
  registerShortcuts: (shortcuts: ShortcutItem[]) => void;
  unregisterShortcuts: (ids: string[]) => void;
}

export const ShortcutsRegistryContext = React.createContext<ShortcutsRegistryContext | null>(null);

export function ShortcutsRegistryProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, dispatch] = React.useReducer(reducer, { shortcuts: [] });

  const registerShortcuts = React.useCallback((shortcuts: ShortcutItem[]) => {
    dispatch({ type: "register", shortcuts });
  }, []);

  const unregisterShortcuts = React.useCallback((ids: string[]) => {
    dispatch({ type: "unregister", ids });
  }, []);

  return (
    <ShortcutsRegistryContext.Provider value={{ shortcuts: state.shortcuts, registerShortcuts, unregisterShortcuts }}>
      {children}
    </ShortcutsRegistryContext.Provider>
  );
}

export function useShortcutsRegistry(): ShortcutsRegistryContext {
  const ctx = React.useContext(ShortcutsRegistryContext);
  if (!ctx) throw new Error("useShortcutsRegistry must be used within ShortcutsRegistryProvider");
  return ctx;
}

export function useRegisterShortcuts(shortcuts: ShortcutItem[]): void {
  const { registerShortcuts, unregisterShortcuts } = useShortcutsRegistry();
  const shortcutsRef = React.useRef(shortcuts);
  const idsRef = React.useRef(shortcuts.map((s) => s.id));
  React.useEffect(() => {
    registerShortcuts(shortcutsRef.current);
    const ids = idsRef.current;
    return () => unregisterShortcuts(ids);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerShortcuts, unregisterShortcuts]);
}
