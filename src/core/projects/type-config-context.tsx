"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { getTypeIcon, getTypeColor } from "./type-icons";

type TypeConfigMap = Record<string, { icon?: string; color?: string }>;

interface TypeConfigContextValue {
  configs: TypeConfigMap;
  getIcon: (type: string) => string;
  getColor: (type: string) => string;
}

const TypeConfigContext = React.createContext<TypeConfigContextValue>({
  configs: {},
  getIcon: getTypeIcon,
  getColor: getTypeColor,
});

export function TypeConfigProvider({ children }: { children: React.ReactNode }) {
  const { data } = trpc.projects.typeConfigs.useQuery(undefined, {
    staleTime: 60_000,
  });

  const configs: TypeConfigMap = data ?? {};

  const getIcon = React.useCallback(
    (type: string) => configs[type]?.icon ?? getTypeIcon(type),
    [configs],
  );

  const getColor = React.useCallback(
    (type: string) => configs[type]?.color ?? getTypeColor(type),
    [configs],
  );

  return (
    <TypeConfigContext.Provider value={{ configs, getIcon, getColor }}>
      {children}
    </TypeConfigContext.Provider>
  );
}

export function useTypeConfig() {
  return React.useContext(TypeConfigContext);
}
