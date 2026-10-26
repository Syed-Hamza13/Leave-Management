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

function ChevronIcon({ open, className = "" }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
        open ? "rotate-180 text-ink" : "text-ink-muted group-hover:text-ink"
      } ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function GroupIcon({ label, className = "h-4 w-4 shrink-0" }) {
  switch (label.toLowerCase()) {
    case "records":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 4h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "administration":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "organization":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    case "leave management":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "settings":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      );
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      );
  }
}

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
  const [openGroups, setOpenGroups] = useState({});

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
    }).filter((group) => group.items.length > 0 || group.allowEmpty);
  }, [can, lookups.entityTypes]);

  // Auto-expand group when navigating to a child page
  useEffect(() => {
    const current = location.pathname;
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const group of groups) {
        const hasActiveItem = group.items.some((item) =>
          item.end ? current === item.to : current.startsWith(item.to)
        );
        if (hasActiveItem) {
          next[group.label] = true;
        }
      }
      return next;
    });
  }, [location.pathname, groups]);

  function toggleGroup(groupLabel) {
    setOpenGroups((prev) => ({
      ...prev,
      [groupLabel]: !prev[groupLabel],
    }));
  }

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
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-control bg-brand text-sm font-bold text-white shadow-sm">
          LM
        </span>

        <span className="text-sm font-semibold tracking-tight text-ink">
          Leave Management
        </span>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        <NavLink
          to="/"
          end
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            [
              "flex items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-brand-soft font-semibold text-brand"
                : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
            ].join(" ")
          }
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span>Dashboard</span>
        </NavLink>

        {loading ? (
          <div className="space-y-2 pt-2" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          groups.map((group) => {
            const hasActiveChild = group.items.some((item) =>
              item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
            );
            const isOpen = Boolean(openGroups[group.label]);

            return (
              <div key={group.label} data-nav-group={group.label} className="space-y-1">
                <button
                  type="button"
                  data-nav-toggle={group.label}
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={isOpen}
                  className={[
                    "group flex w-full items-center justify-between rounded-control px-3 py-2 text-left transition-colors select-none",
                    hasActiveChild
                      ? "bg-brand-soft/40 text-brand font-semibold"
                      : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <GroupIcon
                      label={group.label}
                      className={[
                        "h-4 w-4 shrink-0 transition-colors",
                        hasActiveChild ? "text-brand" : "text-ink-muted group-hover:text-ink",
                      ].join(" ")}
                    />
                    <span className="truncate text-xs font-semibold uppercase tracking-wider text-inherit">
                      {group.label}
                    </span>
                  </div>

                  <ChevronIcon open={isOpen} />
                </button>

                <div
                  className={[
                    "space-y-0.5 ml-2.5 border-l-2 border-line/70 pl-2 transition-all duration-150",
                    isOpen ? "block" : "hidden",
                  ].join(" ")}
                >
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        [
                          LINK_CLASS({ isActive }),
                          item.nested ? "ml-2 text-xs" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")
                      }
                    >
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })
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
