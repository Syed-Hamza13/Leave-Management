import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { errorMessage } from "../../services/errors.js";
import { organization as organizationApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";

import ConfigurationDialog from "./ConfigurationDialog.jsx";

export default function EntityTypeConfigPage() {
  const { entityTypeId } = useParams();
  const { can } = usePermissions();
  const toast = useToast();

  const canManage = can(PERMISSIONS.ORGANIZATION_MANAGE);

  const [configDialog, setConfigDialog] = useState(null);
  const [configDeleteTarget, setConfigDeleteTarget] = useState(null);

  const {
    data: typeData,
    loading: typeLoading,
    error: typeError,
    reload: reloadType,
  } = useAsyncData(`entity-type:${entityTypeId}`, () =>
    organizationApi.getEntityType(entityTypeId)
  );

  const entityType = typeData?.data ?? null;
  const configurations = useMemo(() => entityType?.configurations ?? [], [entityType]);

  const { run: runDelete, pending: deleting } = useMutation();

  async function confirmConfigurationDelete() {
    const target = configDeleteTarget;

    const outcome = await runDelete(() => organizationApi.deleteConfiguration(target.id));

    setConfigDeleteTarget(null);

    if (outcome.ok) {
      toast.success(`"${target.label}" was removed.`);
      reloadType();
      return;
    }

    toast.error(errorMessage(outcome.error, "The configuration could not be removed."));
  }

  useEffect(() => {
    if (entityType?.label) {
      document.title = `Configure ${entityType.label} · Leave Management`;
    }
  }, [entityType?.label]);

  if (typeLoading) return <LoadingState label="Loading entity configurations…" />;

  if (typeError || !entityType) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(typeError, "This entity could not be loaded.")}
        </p>

        <Button variant="secondary" size="sm" onClick={reloadType}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 text-xs text-ink-muted">
            <Link to="/organization" className="hover:text-brand hover:underline">
              Organization
            </Link>
            <span aria-hidden="true">/</span>
            <Link to={`/organization/${entityType.id}`} className="hover:text-brand hover:underline">
              {entityType.label}
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-ink-soft">Configure</span>
          </nav>

          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Configure {entityType.label}
          </h1>

          <p className="mt-0.5 text-xs text-ink-soft">
            Map forms and tables to this entity so users can enter and view records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to={`/organization/${entityType.id}`}>
            <Button variant="secondary" size="sm">
              View records
            </Button>
          </Link>

          {canManage ? (
            <Button size="sm" onClick={() => setConfigDialog({ mode: "create" })}>
              New configuration
            </Button>
          ) : null}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Mapped Forms & Tables</h2>

        {configurations.length === 0 ? (
          <EmptyState
            title="Nothing is configured yet"
            description="Add a configuration to link a form and table to this entity."
            action={
              canManage ? (
                <Button onClick={() => setConfigDialog({ mode: "create" })}>
                  New configuration
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {configurations.map((configuration) => (
              <li key={configuration.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">
                      {configuration.label}
                    </span>

                    {!configuration.isActive ? <Badge tone="warning">Inactive</Badge> : null}
                  </p>

                  <p className="mt-0.5 text-xs text-ink-muted">
                    Form: <span className="font-medium text-ink-soft">{configuration.form.label}</span>
                    <span className="mx-2 text-ink-muted">→</span>
                    Table: <span className="font-medium text-ink-soft">{configuration.table.label}</span>
                  </p>
                </div>

                {canManage ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfigDialog({ mode: "edit", configuration })}
                    >
                      Edit
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfigDeleteTarget(configuration)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {configDialog ? (
        <ConfigurationDialog
          entityTypeId={entityType.id}
          configuration={configDialog.configuration ?? null}
          onClose={() => setConfigDialog(null)}
          onSaved={(saved) => {
            setConfigDialog(null);
            toast.success(
              configDialog.mode === "create"
                ? `"${saved?.label ?? "Configuration"}" was created.`
                : `"${saved?.label ?? "Configuration"}" was saved.`
            );
            reloadType();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(configDeleteTarget)}
        title="Remove configuration"
        message={`Remove "${configDeleteTarget?.label ?? ""}"?`}
        detail="Only the configuration is removed. The table and its records stay intact."
        confirmLabel="Remove configuration"
        loading={deleting}
        onCancel={() => setConfigDeleteTarget(null)}
        onConfirm={confirmConfigurationDelete}
      />
    </div>
  );
}
