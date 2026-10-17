import { createContext, useContext } from "react";

export const PermissionsContext = createContext(null);

export function usePermissions() {
  const context = useContext(PermissionsContext);

  if (!context) {
    throw new Error("usePermissions must be used inside PermissionsProvider");
  }

  return context;
}
