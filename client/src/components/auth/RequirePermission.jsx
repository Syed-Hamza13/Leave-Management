import { usePermissions } from "../../features/permissions/PermissionsContext.js";
import EmptyState from "../ui/EmptyState.jsx";
import { LoadingState } from "../ui/LoadingState.jsx";

/*
 * Keeps a screen the user cannot use from mounting and firing requests that
 * would only return 403. The server still enforces the same permission.
 */
export default function RequirePermission({ permission, label, children }) {
  const { can, loading } = usePermissions();

  if (loading) {
    return <LoadingState label="Checking access…" />;
  }

  if (!can(permission)) {
    return (
      <EmptyState
        title="You do not have access to this area"
        description={
          label
            ? `${label} is not part of your current role. Ask an administrator if you need it.`
            : "Your current role does not include this permission."
        }
      />
    );
  }

  return children;
}
