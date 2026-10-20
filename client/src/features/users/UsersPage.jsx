import { useMemo, useState } from "react";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";
import Select from "../../components/ui/Select.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  authorization as authorizationApi,
  tables as tablesApi,
  users as usersApi,
} from "../../services/resources.js";

import { useMetadata } from "../metadata/MetadataContext.js";
import { usePermissions } from "../permissions/PermissionsContext.js";
import useEntryOptions from "../records/useEntryOptions.js";
import { formatRecordValue } from "../records/recordValues.js";

import ResetPasswordDialog from "./ResetPasswordDialog.jsx";
import UserDialog from "./UserDialog.jsx";

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

  const [dialog, setDialog] = useState(null);

  const canManage = can(PERMISSIONS.USERS_MANAGE);
  const { getDataType } = useMetadata();

  const { data: rolesData } = useAsyncData("authorization-roles", () => authorizationApi.roles());
  const roles = useMemo(() => rolesData?.data ?? [], [rolesData]);

  const { data: tableData } = useAsyncData("table-users-meta", () =>
    tablesApi.get("users")
  );

  const customColumns = useMemo(
    () =>
      (tableData?.data?.columns ?? []).filter(
        (col) => !col.isSystem && col.status === "active" && col.isVisible
      ),
    [tableData]
  );

  const { optionsFor } = useEntryOptions(customColumns);

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

  const columns = useMemo(
    () => [
      {
        key: "email",
        header: "Account",
        sortable: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">
              {[row.firstName, row.lastName].filter(Boolean).join(" ")}
            </p>
            <p className="truncate text-xs text-ink-muted">{row.email}</p>
          </div>
        ),
      },
      {
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
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: (row) => (
          <Badge tone={row.status === "active" ? "success" : "warning"}>{row.status}</Badge>
        ),
      },
      ...customColumns.map((col) => ({
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
      })),
      {
        key: "lastLoginAt",
        header: "Last sign-in",
        sortable: true,
        render: (row) => (
          <span className="text-ink-soft">
            {row.lastLoginAt ? formatDate(row.lastLoginAt) : "Never"}
          </span>
        ),
      },
      {
        key: "createdAt",
        header: "Created",
        sortable: true,
        render: (row) => <span className="text-ink-soft">{formatDate(row.createdAt)}</span>,
      },
    ],
    [customColumns, getDataType, optionsFor]
  );

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

        {canManage ? <Button onClick={() => setDialog({ mode: "create" })}>New account</Button> : null}
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
            <>
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
            </>
          ) : null
        }
      />

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
          customColumns={customColumns}
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
