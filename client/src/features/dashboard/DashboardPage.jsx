import { Link } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { Skeleton } from "../../components/ui/LoadingState.jsx";

import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";

import { PERMISSIONS } from "../../lib/permissions.js";

/*
 * The platform is configured before it is used, so the dashboard states that
 * order instead of repeating counts nobody can act on. A step appears only when
 * the signed-in user may open it.
 */
const STEPS = [
  {
    to: "/admin/fields",
    permission: PERMISSIONS.FIELDS_VIEW,
    title: "Fields",
    text: "Define each question once, with its type and validation.",
  },
  {
    to: "/admin/dropdowns",
    permission: PERMISSIONS.DROPDOWNS_VIEW,
    title: "Dropdowns",
    text: "Collect the choices those questions draw from.",
  },
  {
    to: "/admin/forms",
    permission: PERMISSIONS.FORMS_VIEW,
    title: "Forms",
    text: "Compose fields into the screen people submit through.",
  },
  {
    to: "/admin/tables",
    permission: PERMISSIONS.TABLES_VIEW,
    title: "Tables",
    text: "Add the columns that hold each answer.",
  },
  {
    to: "/admin/mappings",
    permission: PERMISSIONS.MAPPINGS_VIEW,
    title: "Form mappings",
    text: "Connect a form's fields to a table's columns.",
  },
  {
    to: "/organization",
    permission: PERMISSIONS.ORGANIZATION_VIEW,
    title: "Organization",
    text: "Describe the structure records belong to.",
  },
  {
    to: "/records",
    permission: PERMISSIONS.RECORDS_VIEW,
    title: "Records",
    text: "Enter and inspect the data itself.",
  },
];

function DashboardPage() {
  const { user } = useAuth();
  const { can, roles, loading } = usePermissions();

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email;

  const steps = STEPS.filter((step) => can(step.permission));

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-soft">Signed in as</span>
        <span className="font-medium text-ink">{fullName}</span>

        {user?.status ? (
          <Badge tone={user.status === "active" ? "success" : "warning"}>
            {user.status}
          </Badge>
        ) : null}

        {roles.map((role) => (
          <Badge key={role.key} tone="neutral">
            {role.label}
          </Badge>
        ))}
      </section>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : steps.length === 0 ? (
        <EmptyState
          title="No administration areas are open to you yet"
          description="An administrator grants the permissions behind these screens. Your sign-in itself worked, so the account and session are fine."
        />
      ) : (
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.to}>
              <Link
                to={step.to}
                className="flex h-full flex-col gap-1.5 rounded-card border border-line bg-surface px-4 py-4 transition-colors hover:border-brand hover:bg-brand-soft"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Step {index + 1}
                </span>

                <span className="text-sm font-semibold text-ink">{step.title}</span>

                <span className="text-sm text-ink-soft">{step.text}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default DashboardPage;
