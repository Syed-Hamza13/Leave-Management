import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useMatches } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext.js";
import { useMetadata } from "../features/metadata/MetadataContext.js";
import { usePermissions } from "../features/permissions/PermissionsContext.js";

import Button from "../components/ui/Button.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import { Skeleton } from "../components/ui/LoadingState.jsx";

import { PERMISSIONS } from "../lib/permissions.js";

import { NAV_GROUPS } from "./navigation.js";

const LINK_CLASS = ({ isActive }) =>
  [
    "block rounded-control px-3 py-2 text-sm transition-colors",
    isActive
      ? "bg-brand-soft font-semibold text-brand"
      : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
  ].join(" ");

/*
 * The shell owns navigation, the page header and the content outlet. Screens
 * declare their heading through the route's `handle` and never render their own
 * page chrome, so breadcrumb and title stay consistent everywhere.
 */
function AppShell() {
  const { user, logout } = useAuth();
  const { can, loading } = usePermissions();
  const { lookups } = useMetadata();
  const matches = useMatches();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const heading = useMemo(() => {
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const handle = matches[index].handle;

      if (handle) {
        return typeof handle === "function" ? handle(matches[index]) : handle;
      }
    }

    return null;
  }, [matches]);

  const groups = useMemo(() => {
    /*
     * Entity types are defined at runtime, so they are appended to the group that
     * opts in through `nest`. The extra indent marks them as one level below the
     * group's own screens.
     */
    const entityItems = (lookups.entityTypes ?? []).map((entityType) => ({
      to: `/organization/${entityType.id}`,
      label: entityType.label,
      permission: PERMISSIONS.ORGANIZATION_VIEW,
      nested: true,
    }));

    return NAV_GROUPS.map((group) => {
      const dynamic = group.nest === "entityTypes" ? entityItems : [];

      return {
        ...group,
        items: [...group.items, ...dynamic].filter((item) => can(item.permission)),
      };
    }).filter((group) => group.items.length > 0);
  }, [can, lookups.entityTypes]);

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email;

  /*
   * The tab order would otherwise start in the sidebar on every page. Focus is
   * moved by script rather than by following the link so the router does not see
   * a hash change.
   */
  function skipToMain(event) {
    event.preventDefault();

    document.getElementById("main-content")?.focus();
  }

  useEffect(() => {
    document.title = heading?.title
      ? `${heading.title} · Leave Management`
      : "Leave Management System";
  }, [heading]);

  async function handleLogout() {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  const sidebar = (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-control bg-brand text-sm font-bold text-white">
          LM
        </span>

        <span className="text-sm font-semibold tracking-tight text-ink">
          Leave Management
        </span>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        <NavLink to="/" end onClick={() => setMenuOpen(false)} className={LINK_CLASS}>
          Dashboard
        </NavLink>

        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                {group.label}
              </p>

              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      [LINK_CLASS({ isActive }), item.nested ? "ml-3" : ""]
                        .filter(Boolean)
                        .join(" ")
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))
        )}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <p className="truncate px-1 text-sm font-medium text-ink">{fullName}</p>
        <p className="truncate px-1 text-xs text-ink-muted">{user?.email}</p>

        <Button
          variant="secondary"
          size="sm"
          className="mt-2 w-full"
          onClick={handleLogout}
        >
          Sign out
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      <a
        href="#main-content"
        onClick={skipToMain}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-md"
      >
        Skip to main content
      </a>

      {menuOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        id="app-navigation"
        aria-label="Main navigation"
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface",
          "transition-[transform,visibility] duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0",
          /*
           * Closed on a narrow screen means hidden, not merely slid off-screen:
           * a translated-but-visible sidebar keeps its links in the tab order.
           */
          menuOpen
            ? "visible translate-x-0"
            : "invisible -translate-x-full md:visible md:translate-x-0",
        ].join(" ")}
      >
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="app-navigation"
          >
            Menu
          </Button>

          <span className="truncate text-sm font-semibold text-ink">
            Leave Management
          </span>
        </div>

        {heading ? (
          <PageHeader
            breadcrumb={heading.breadcrumb}
            title={heading.title}
            description={heading.description}
          />
        ) : null}

        <main
          id="main-content"
          tabIndex={-1}
          key={location.pathname}
          className="flex-1 px-4 py-6 outline-none md:px-6"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppShell;
