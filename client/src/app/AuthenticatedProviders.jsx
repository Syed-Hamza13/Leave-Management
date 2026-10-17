import { Outlet } from "react-router-dom";

import MetadataProvider from "../features/metadata/MetadataProvider.jsx";
import PermissionsProvider from "../features/permissions/PermissionsProvider.jsx";

/*
 * Mounted inside ProtectedRoute so these providers only exist for a signed-in
 * user, and are torn down on logout instead of caching another account's
 * permissions.
 */
export default function AuthenticatedProviders() {
  return (
    <PermissionsProvider>
      <MetadataProvider>
        <Outlet />
      </MetadataProvider>
    </PermissionsProvider>
  );
}
