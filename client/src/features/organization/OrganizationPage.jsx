import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ColumnVisibilityManager from "../../components/ui/ColumnVisibilityManager.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";
import Select from "../../components/ui/Select.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useColumnPreferences from "../../hooks/useColumnPreferences.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { errorMessage } from "../../services/errors.js";
import { organization as organizationApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";
import { useMetadata } from "../metadata/MetadataContext.js";

import EntityTypeDialog from "./EntityTypeDialog.jsx";

const PAGE_SIZE = 25;

const AVAILABLE_COLUMNS = [
  { key: "label", label: "Entity type", alwaysVisible: true },
  { key: "description", label: "Description" },
  { key: "configurationCount", label: "Configurations" },
  { key: "entityCount", label: "Entities" },
  { key: "status", label: "Status" },
];

const DEFAULT_VISIBLE_KEYS = AVAILABLE_COLUMNS.map((c) => c.key);

export default function OrganizationPage() {
  const { can } = usePermissions();
  const { refresh: refreshMetadata } = useMetadata();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);

  const {
    orderedColumns,
    visibleKeys: visibleColumnKeys,
    setVisibleKeys: setVisibleColumnKeys,
    reorderColumns,
    resetPreferences,
  } = useColumnPreferences({
    storageKey: "columns:organization-types",
    columns: AVAILABLE_COLUMNS,
    defaultVisibleKeys: DEFAULT_VISIBLE_KEYS,
  });

  const [dialog, setDialog] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const canManage = can(PERMISSIONS.ORGANIZATION_MANAGE);

  const { data, loading, error, reload } = useAsyncData(
    `entity-types:${page}:${search}:${status}`,
    () => organizationApi.listEntityTypes({ page, pageSize: PAGE_SIZE, search, status })
  );

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  const { run: runArchive, pending: archiving } = useMutation();

  const columnDefinitionMap = useMemo(() => {
    const map = new Map();

    map.set("label", {
      key: "label",
      header: "Entity type",
      alwaysVisible: true,
      render: (row) => (
        <div className="min-w-0">
          <Link
            to={`/organization/${row.id}`}
            className="truncate font-medium text-ink hover:text-brand hover:underline"
          >
            {row.label}
          </Link>
          <code className="ml-2 font-mono text-xs text-ink-muted">{row.key}</code>
        </div>
      ),
    });

    map.set("description", {
      key: "description",
      header: "Description",
      render: (row) => (
        <span className="truncate max-w-xs block text-sm text-ink-soft">
          {row.description || "—"}
        </span>
      ),
    });

    map.set("configurationCount", {
      key: "configurationCount",
      header: "Configurations",
      align: "right",
      render: (row) => <span className="font-medium text-ink-soft">{row.configurationCount ?? 0}</span>,
    });

    map.set("entityCount", {
      key: "entityCount",
      header: "Entities",
      align: "right",
      render: (row) => <span className="font-medium text-ink-soft">{row.entityCount ?? 0}</span>,
    });

    map.set("status", {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={row.status === "active" ? "success" : "neutral"}>{row.status}</Badge>
      ),
    });

    return map;
  }, []);

  const columns = useMemo(() => {
    return orderedColumns.map((col) => {
      const def = columnDefinitionMap.get(col.key) || {
        key: col.key,
        header: col.label || col.key,
        render: (row) => String(row[col.key] ?? "—"),
      };
      return {
        ...def,
        hidden: !visibleColumnKeys.includes(col.key),
      };
    });
  }, [orderedColumns, columnDefinitionMap, visibleColumnKeys]);

  async function confirmArchive() {
    const target = archiveTarget;

    const outcome = await runArchive(() => organizationApi.archiveEntityType(target.id));

    setArchiveTarget(null);

    if (outcome.ok) {
      toast.success(`"${target.label}" was archived.`);
      reload();
      refreshMetadata();
      return;
    }

    toast.error(errorMessage(outcome.error, "The entity type could not be archived."));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-end gap-3">
          <SearchInput
            className="w-full sm:max-w-xs"
            value={search}
            onChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
            label="Search entity types"
            placeholder="Search by name or key…"
          />

          <Select
            id="entity-types-status"
            label="Status"
            className="w-40"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ColumnVisibilityManager
            columns={orderedColumns}
            visibleKeys={visibleColumnKeys}
            onChangeVisibleKeys={setVisibleColumnKeys}
            onReorderColumns={reorderColumns}
            onReset={resetPreferences}
            storageKey="columns:organization-types"
            defaultVisibleKeys={DEFAULT_VISIBLE_KEYS}
          />

          {canManage ? (
            <Button onClick={() => setDialog({ mode: "create" })}>New entity type</Button>
          ) : null}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        onReorderColumns={reorderColumns}
        pagination={meta}
        onPageChange={setPage}
        empty={
          <EmptyState
            title={search ? "No entity types match your search" : "No entity types yet"}
            description={
              search
                ? "Try a different name or key, or clear the search."
                : "Entity types are the kinds of things your organization contains. Each one gets its own profile and sections."
            }
            action={
              canManage && !search ? (
                <Button onClick={() => setDialog({ mode: "create" })}>New entity type</Button>
              ) : null
            }
          />
        }
        actions={(row) => (
          <>
            <Link to={`/organization/${row.id}`}>
              <Button variant="ghost" size="sm">
                Open
              </Button>
            </Link>

            {canManage ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog({ mode: "edit", entityType: row })}
                >
                  Edit
                </Button>

                {row.status === "active" ? (
                  <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(row)}>
                    Archive
                  </Button>
                ) : null}
              </>
            ) : null}
          </>
        )}
      />

      {dialog ? (
        <EntityTypeDialog
          entityType={dialog.entityType ?? null}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            toast.success(
              dialog.mode === "create"
                ? `"${saved?.label ?? "Entity type"}" was created.`
                : `"${saved?.label ?? "Entity type"}" was saved.`
            );
            reload();
            refreshMetadata();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive entity type"
        message={`Archive "${archiveTarget?.label ?? ""}"?`}
        detail="A type is refused while it still has entities or child types. Existing records are never deleted by archiving a definition."
        confirmLabel="Archive type"
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
