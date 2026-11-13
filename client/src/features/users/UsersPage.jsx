import { useEffect, useMemo, useState } from "react";

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
import {
  authorization as authorizationApi,
  tables as tablesApi,
  users as usersApi,
} from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";
import useEntryOptions from "../records/useEntryOptions.js";
import { formatRecordValue } from "../records/recordValues.js";

import BulkUpdateDialog from "./BulkUpdateDialog.jsx";
import ResetPasswordDialog from "./ResetPasswordDialog.jsx";
import UserDialog from "./UserDialog.jsx";
import UserFieldsDialog from "./UserFieldsDialog.jsx";

const PAGE_SIZE = 25;

function formatDate(value) {
  if (!value) return "—";

  return String(value).slice(0, 10);
}

export default function UsersPage() {
  const { can } = usePermissions();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [sort, setSort] = useState({ key: "createdAt", direction: "desc" });
  const [page, setPage] = useState(1);

  // Row selection state
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Dialogs
  const [dialog, setDialog] = useState(null);
  const [fieldsDialogOpen, setFieldsDialogOpen] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [singleDeleteTarget, setSingleDeleteTarget] = useState(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  const canManage = can(PERMISSIONS.USERS_MANAGE);
  const { getDataType } = useMetadata();

  const { run: runDelete, pending: deleting } = useMutation();

  const { data: rolesData } = useAsyncData("authorization-roles", () => authorizationApi.roles());
  const roles = useMemo(() => rolesData?.data ?? [], [rolesData]);

  const { data: tableData, reload: reloadTableMeta } = useAsyncData("table-users-meta", () =>
    tablesApi.get("users")
  );

  const allCustomColumns = useMemo(
    () =>
      (tableData?.data?.columns ?? []).filter(
        (col) => !col.isSystem && col.status === "active"
      ),
    [tableData]
  );

  const availableColumns = useMemo(
    () => [
      { key: "email", label: "Account", alwaysVisible: true },
      { key: "roles", label: "Roles" },
      { key: "status", label: "Status" },
      ...allCustomColumns.map((col) => ({
        key: `custom_${col.key}`,
        label: col.label,
      })),
      { key: "lastLoginAt", label: "Last sign-in" },
      { key: "createdAt", label: "Created" },
    ],
    [allCustomColumns]
  );

  const defaultVisibleKeys = useMemo(
    () => availableColumns.map((col) => col.key),
    [availableColumns]
  );

  const {
    orderedColumns,
    visibleKeys: visibleColumnKeys,
    setVisibleKeys: setVisibleColumnKeys,
    reorderColumns,
    resetPreferences,
    removeColumnFromPreferences,
  } = useColumnPreferences({
    storageKey: "columns:users-table",
    columns: availableColumns,
    defaultVisibleKeys,
  });

  const { optionsFor } = useEntryOptions(allCustomColumns);

  const { data, loading, error, reload } = useAsyncData(
    `users:${page}:${search}:${status}:${role}:${sort?.key ?? "none"}:${sort?.direction ?? "none"}`,
    () =>
      usersApi.list({
        page,
        pageSize: PAGE_SIZE,
        search,
        status: status || undefined,
        role: role || undefined,
        sort: sort ?? { key: "createdAt", direction: "desc" },
      })
  );

  const rows = data?.data ?? [];
  const meta = data?.meta ?? null;

  // Selection handlers
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (rows.length === 0) return;
    const allSelectedOnPage = rows.every((r) => selectedIds.has(r.id));
    if (allSelectedOnPage) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const r of rows) next.delete(r.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const r of rows) next.add(r.id);
        return next;
      });
    }
  }

  const isAllSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const isIndeterminate = rows.some((r) => selectedIds.has(r.id)) && !isAllSelected;

  async function handleExecuteSingleDelete() {
    if (!singleDeleteTarget) return;

    const outcome = await runDelete(() => usersApi.delete(singleDeleteTarget.id));
    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to delete account."));
      return;
    }

    toast.success(`Account ${singleDeleteTarget.email} was deleted.`);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(singleDeleteTarget.id);
      return next;
    });
    setSingleDeleteTarget(null);
    reload();
  }

  async function handleExecuteBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const outcome = await runDelete(() => usersApi.bulkDelete(ids));
    if (!outcome.ok) {
      toast.danger(errorMessage(outcome.error, "Failed to delete selected accounts."));
      return;
    }

    toast.success(`Successfully deleted ${outcome.result?.data?.deletedCount ?? ids.length} account(s).`);
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    reload();
  }

  const columnDefinitionMap = useMemo(() => {
    const map = new Map();

    map.set("email", {
      key: "email",
      header: "Account",
      sortable: true,
      alwaysVisible: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">
            {[row.firstName, row.lastName].filter(Boolean).join(" ")}
          </p>
          <p className="truncate text-xs text-ink-muted">{row.email}</p>
        </div>
      ),
    });

    map.set("roles", {
      key: "roles",
      header: "Roles",
      render: (row) =>
        row.roles?.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.roles.map((entry) => (
              <Badge key={entry.key} tone={entry.key === "super_admin" ? "brand" : "neutral"}>
                {entry.label}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-ink-muted">No role</span>
        ),
    });

    map.set("status", {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => (
        <Badge tone={row.status === "active" ? "success" : "warning"}>{row.status}</Badge>
      ),
    });

    for (const col of allCustomColumns) {
      map.set(`custom_${col.key}`, {
        key: `custom_${col.key}`,
        header: col.label,
        render: (row) => {
          const val = row.values?.[col.key];
          return (
            <span className="text-ink">
              {formatRecordValue(val, {
                storage: getDataType(col.dataType)?.storage,
                options: optionsFor(col),
              })}
            </span>
          );
        },
      });
    }

    map.set("lastLoginAt", {
      key: "lastLoginAt",
      header: "Last sign-in",
      sortable: true,
      render: (row) => (
        <span className="text-ink-soft">
          {row.lastLoginAt ? formatDate(row.lastLoginAt) : "Never"}
        </span>
      ),
    });

    map.set("createdAt", {
      key: "createdAt",
      header: "Created",
      sortable: true,
      render: (row) => <span className="text-ink-soft">{formatDate(row.createdAt)}</span>,
    });

    return map;
  }, [allCustomColumns, getDataType, optionsFor]);

  const columns = useMemo(() => {
    const cols = orderedColumns.map((col) => {
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

    if (canManage) {
      cols.unshift({
        key: "select",
        header: (
          <input
            type="checkbox"
            checked={isAllSelected}
            ref={(el) => {
              if (el) el.indeterminate = isIndeterminate;
            }}
            onChange={toggleSelectAll}
            aria-label="Select all accounts on page"
            className="rounded border-line text-brand focus:ring-brand cursor-pointer"
          />
        ),
        width: "44px",
        alwaysVisible: true,
        isFixed: true,
        render: (row) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={() => toggleSelect(row.id)}
            aria-label={`Select ${row.email}`}
            className="rounded border-line text-brand focus:ring-brand cursor-pointer"
          />
        ),
      });
    }

    return cols;
  }, [orderedColumns, columnDefinitionMap, visibleColumnKeys, canManage, isAllSelected, isIndeterminate, selectedIds, rows]);

  return (
    <div className="space-y-4">
      {/* Top Search and Toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-end gap-3">
          <SearchInput
            className="w-full sm:max-w-xs"
            value={search}
            onChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
            label="Search accounts"
            placeholder="Search by name or email…"
          />

          <Select
            id="users-status"
            label="Status"
            className="w-40"
            placeholder="All statuses"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            options={[
              { value: "active", label: "Active" },
              { value: "disabled", label: "Deactivated" },
            ]}
          />

          <Select
            id="users-role"
            label="Role"
            className="w-44"
            placeholder="All roles"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
            options={roles.map((entry) => ({ value: entry.key, label: entry.label }))}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Actions Dropdown Button */}
          {canManage && (
            <div className="relative">
              <Button
                variant={selectedIds.size > 0 ? "primary" : "secondary"}
                onClick={() => setActionsMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5"
              >
                Actions {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                <span className="text-xs">▾</span>
              </Button>

              {actionsMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setActionsMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 z-40 w-48 rounded-md border border-line bg-surface py-1 shadow-lg">
                    <button
                      type="button"
                      disabled={selectedIds.size === 0}
                      onClick={() => {
                        setActionsMenuOpen(false);
                        setBulkUpdateOpen(true);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Bulk Update Selected...
                    </button>

                    <button
                      type="button"
                      disabled={selectedIds.size === 0}
                      onClick={() => {
                        setActionsMenuOpen(false);
                        setBulkDeleteOpen(true);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Delete Selected
                    </button>

                    {selectedIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIds(new Set());
                          setActionsMenuOpen(false);
                        }}
                        className="w-full text-left px-3.5 py-1.5 text-[11px] text-ink-muted hover:bg-surface-sunken border-t border-line mt-1"
                      >
                        Clear Selection ({selectedIds.size})
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <ColumnVisibilityManager
            columns={orderedColumns}
            visibleKeys={visibleColumnKeys}
            onChangeVisibleKeys={setVisibleColumnKeys}
            onReorderColumns={reorderColumns}
            onReset={resetPreferences}
            storageKey="columns:users-table"
            defaultVisibleKeys={defaultVisibleKeys}
          />

          {canManage ? (
            <Button
              variant="secondary"
              onClick={() => setFieldsDialogOpen(true)}
              title="Customize placement and add/edit user profile fields"
            >
              Customize fields
            </Button>
          ) : null}

          {canManage ? (
            <Button onClick={() => setDialog({ mode: "create" })}>New account</Button>
          ) : null}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
        }}
        onReorderColumns={reorderColumns}
        pagination={meta}
        onPageChange={setPage}
        empty={
          <EmptyState
            title={search ? "No accounts match your search" : "No accounts yet"}
            description={
              search
                ? "Try a different name or email, or clear the search."
                : "Accounts are created here. Roles decide what each person may administer."
            }
            action={
              canManage && !search ? (
                <Button onClick={() => setDialog({ mode: "create" })}>New account</Button>
              ) : null
            }
          />
        }
        actions={(row) =>
          canManage ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialog({ mode: "edit", user: row })}
              >
                Edit
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialog({ mode: "password", user: row })}
              >
                Set password
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-soft hover:text-danger"
                onClick={() => setSingleDeleteTarget(row)}
              >
                Delete
              </Button>
            </div>
          ) : null
        }
      />

      {/* Bulk Update Dialog */}
      {bulkUpdateOpen && (
        <BulkUpdateDialog
          open={bulkUpdateOpen}
          userIds={Array.from(selectedIds)}
          customColumns={allCustomColumns}
          roles={roles}
          optionsFor={optionsFor}
          onClose={() => setBulkUpdateOpen(false)}
          onSaved={() => {
            setSelectedIds(new Set());
            reload();
          }}
        />
      )}

      {/* Bulk Delete Confirm Dialog */}
      {bulkDeleteOpen && (
        <ConfirmDialog
          open={bulkDeleteOpen}
          title={`Delete ${selectedIds.size} accounts`}
          message={`Are you sure you want to permanently delete ${selectedIds.size} selected account(s)?`}
          detail="This will revoke all active sessions for these accounts and remove their user profile data. This action cannot be undone."
          confirmLabel={`Delete ${selectedIds.size} accounts`}
          tone="danger"
          loading={deleting}
          onConfirm={handleExecuteBulkDelete}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}

      {/* Single User Delete Confirm Dialog */}
      {singleDeleteTarget && (
        <ConfirmDialog
          open={Boolean(singleDeleteTarget)}
          title={`Delete ${singleDeleteTarget.email}`}
          message={`Are you sure you want to permanently delete the account for "${[singleDeleteTarget.firstName, singleDeleteTarget.lastName].filter(Boolean).join(" ") || singleDeleteTarget.email}"?`}
          detail="This will revoke active sessions and delete this account's profile values."
          confirmLabel="Delete account"
          tone="danger"
          loading={deleting}
          onConfirm={handleExecuteSingleDelete}
          onCancel={() => setSingleDeleteTarget(null)}
        />
      )}

      {fieldsDialogOpen ? (
        <UserFieldsDialog
          table={tableData?.data}
          columns={tableData?.data?.columns ?? []}
          onClose={() => setFieldsDialogOpen(false)}
          onColumnsChanged={(deletedKey) => {
            if (deletedKey) {
              removeColumnFromPreferences(`custom_${deletedKey}`);
            }
            reloadTableMeta();
            reload();
          }}
        />
      ) : null}

      {dialog?.mode === "password" ? (
        <ResetPasswordDialog
          user={dialog.user}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            toast.success(`A new password was set for ${dialog.user.email}.`);
          }}
        />
      ) : null}

      {dialog && dialog.mode !== "password" ? (
        <UserDialog
          user={dialog.user ?? null}
          roles={roles}
          customColumns={allCustomColumns}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            toast.success(
              dialog.mode === "create"
                ? `Account ${saved?.email ?? ""} was created.`
                : `Account ${saved?.email ?? dialog.user.email} was saved.`
            );
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
