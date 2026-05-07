"use client";

import * as React from "react";

export interface CommandItem {
  id: string;
  label: string;
  group?: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  onRun: () => void;
}

export interface SearchProvider {
  id: string;
  search: (query: string) => CommandItem[] | Promise<CommandItem[]>;
}

interface CommandRegistryState {
  commands: CommandItem[];
  searchProviders: SearchProvider[];
}

type CommandRegistryAction =
  | { type: "register"; commands: CommandItem[] }
  | { type: "unregister"; ids: string[] }
  | { type: "registerSearchProvider"; provider: SearchProvider }
  | { type: "unregisterSearchProvider"; id: string };

function reducer(state: CommandRegistryState, action: CommandRegistryAction): CommandRegistryState {
  if (action.type === "register") {
    const existing = new Set(state.commands.map((c) => c.id));
    const fresh = action.commands.filter((c) => !existing.has(c.id));
    return { ...state, commands: [...state.commands, ...fresh] };
  }
  if (action.type === "unregister") {
    const ids = new Set(action.ids);
    return { ...state, commands: state.commands.filter((c) => !ids.has(c.id)) };
  }
  if (action.type === "registerSearchProvider") {
    const existing = state.searchProviders.some((p) => p.id === action.provider.id);
    if (existing) return state;
    return { ...state, searchProviders: [...state.searchProviders, action.provider] };
  }
  if (action.type === "unregisterSearchProvider") {
    return { ...state, searchProviders: state.searchProviders.filter((p) => p.id !== action.id) };
  }
  return state;
}

interface CommandRegistryContext {
  commands: CommandItem[];
  searchProviders: SearchProvider[];
  registerCommands: (commands: CommandItem[]) => void;
  unregisterCommands: (ids: string[]) => void;
  registerSearchProvider: (provider: SearchProvider) => void;
  unregisterSearchProvider: (id: string) => void;
}

export const CommandRegistryContext = React.createContext<CommandRegistryContext | null>(null);

export function CommandRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [state, dispatch] = React.useReducer(reducer, { commands: [], searchProviders: [] });

  const registerCommands = React.useCallback((commands: CommandItem[]) => {
    dispatch({ type: "register", commands });
  }, []);

  const unregisterCommands = React.useCallback((ids: string[]) => {
    dispatch({ type: "unregister", ids });
  }, []);

  const registerSearchProvider = React.useCallback((provider: SearchProvider) => {
    dispatch({ type: "registerSearchProvider", provider });
  }, []);

  const unregisterSearchProvider = React.useCallback((id: string) => {
    dispatch({ type: "unregisterSearchProvider", id });
  }, []);

  return (
    <CommandRegistryContext.Provider
      value={{
        commands: state.commands,
        searchProviders: state.searchProviders,
        registerCommands,
        unregisterCommands,
        registerSearchProvider,
        unregisterSearchProvider,
      }}
    >
      {children}
    </CommandRegistryContext.Provider>
  );
}

export function useCommandRegistry(): CommandRegistryContext {
  const ctx = React.useContext(CommandRegistryContext);
  if (!ctx) throw new Error("useCommandRegistry must be used within CommandRegistryProvider");
  return ctx;
}

export function useRegisterCommands(commands: CommandItem[]): void {
  const { registerCommands, unregisterCommands } = useCommandRegistry();
  const commandsRef = React.useRef(commands);
  const idsRef = React.useRef(commands.map((c) => c.id));
  React.useEffect(() => {
    registerCommands(commandsRef.current);
    const ids = idsRef.current;
    return () => unregisterCommands(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCommands, unregisterCommands]);
}

export function useRegisterSearchProvider(provider: SearchProvider): void {
  const { registerSearchProvider, unregisterSearchProvider } = useCommandRegistry();
  const providerRef = React.useRef(provider);
  const idRef = React.useRef(provider.id);
  React.useEffect(() => {
    registerSearchProvider(providerRef.current);
    const id = idRef.current;
    return () => unregisterSearchProvider(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSearchProvider, unregisterSearchProvider]);
}
