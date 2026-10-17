import { createContext, useContext } from "react";

export const MetadataContext = createContext(null);

export function useMetadata() {
  const context = useContext(MetadataContext);

  if (!context) {
    throw new Error("useMetadata must be used inside MetadataProvider");
  }

  return context;
}
