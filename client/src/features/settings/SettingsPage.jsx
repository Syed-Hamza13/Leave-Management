import { useMemo, useState } from "react";

import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Checkbox from "../../components/ui/Checkbox.jsx";
import NumberInput from "../../components/ui/NumberInput.jsx";
import Select from "../../components/ui/Select.jsx";
import TextInput from "../../components/ui/TextInput.jsx";
import Toggle from "../../components/ui/Toggle.jsx";
import { LoadingState } from "../../components/ui/LoadingState.jsx";
import { useToast } from "../../components/ui/ToastContext.js";

import useAsyncData from "../../hooks/useAsyncData.js";
import useMutation from "../../hooks/useMutation.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { errorMessage, fieldErrors } from "../../services/errors.js";
import { settings as settingsApi } from "../../services/resources.js";

import { usePermissions } from "../permissions/PermissionsContext.js";

function fromSmtp(smtp) {
  return {
    host: smtp?.host ?? "",
    port: String(smtp?.port ?? ""),
    secure: Boolean(smtp?.secure),
    username: smtp?.username ?? "",
    fromAddress: smtp?.fromAddress ?? "",
    authMode: smtp?.authMode ?? "password",
    password: "",
    clearPassword: false,
  };
}

/*
 * Only the difference from what the server reported is sent, so saving the card
 * never rewrites a field the administrator did not touch, and the stored
 * password is left alone unless a new one is typed or it is cleared.
 */
function buildPatch(saved, draft) {
  const base = fromSmtp(saved);
  const payload = {};

  /*
   * Both sides are trimmed before comparing. A stored value that carries
   * surrounding whitespace would otherwise leave the card permanently dirty,
   * offering a change that was never made.
   */
  if (draft.host.trim() !== base.host.trim()) payload.host = draft.host.trim();
  if (draft.username.trim() !== base.username.trim()) payload.username = draft.username.trim();
  if (draft.fromAddress.trim() !== base.fromAddress.trim()) {
    payload.fromAddress = draft.fromAddress.trim();
  }

  if (draft.secure !== base.secure) payload.secure = draft.secure;
  if (draft.authMode !== base.authMode) payload.authMode = draft.authMode;

  const port = Number.parseInt(draft.port, 10);

  if (Number.isFinite(port) && port !== base.port) payload.port = port;

  if (draft.password) payload.password = draft.password;
  if (draft.clearPassword && !draft.password) payload.clearPassword = true;

  return payload;
}

export default function SettingsPage() {
  const { can } = usePermissions();
  const toast = useToast();

  const canManage = can(PERMISSIONS.SETTINGS_MANAGE);

  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [testResult, setTestResult] = useState(null);

  const { data, loading, error, reload } = useAsyncData("settings", () => settingsApi.list());

  const { run: runSave, pending: saving, error: saveError } = useMutation();
  const { run: runTest, pending: testing } = useMutation();

  const saved = data?.data ?? null;
  const smtp = saved?.smtp ?? null;

  const value = useMemo(
    () => (draft === null ? fromSmtp(smtp) : { ...fromSmtp(smtp), ...draft }),
    [draft, smtp]
  );

  const patch = (changes) => setDraft((current) => ({ ...(current ?? fromSmtp(smtp)), ...changes }));

  function resetDraft() {
    setDraft(null);
    setErrors({});
  }

  async function handleSave(event) {
    event.preventDefault();

    const payload = buildPatch(smtp, value);

    setErrors({});
    setTestResult(null);

    if (Object.keys(payload).length === 0) {
      toast.info("Nothing on this card has changed yet.");
      return;
    }

    const outcome = await runSave(() => settingsApi.updateSmtp(payload));

    if (outcome.ok) {
      setDraft(null);
      toast.success("Mail settings were saved.");
      reload();
      return;
    }

    setErrors(fieldErrors(outcome.error));
  }

  const turnstile = saved?.turnstile ?? {
    enabled: false,
    siteKey: "",
    secretConfigured: false,
    configuredInEnv: false,
  };

  const [turnstileDraft, setTurnstileDraft] = useState(null);
  const [turnstileErrors, setTurnstileErrors] = useState({});
  const {
    run: runSaveTurnstile,
    pending: savingTurnstile,
    error: turnstileSaveError,
  } = useMutation();

  const turnstileValue = useMemo(
    () => (turnstileDraft === null ? turnstile : { ...turnstile, ...turnstileDraft }),
    [turnstileDraft, turnstile]
  );

  const turnstileDirty =
    turnstileDraft !== null &&
    (turnstileDraft.enabled !== turnstile.enabled ||
      (turnstileDraft.siteKey !== undefined && turnstileDraft.siteKey !== turnstile.siteKey) ||
      Boolean(turnstileDraft.secretKey));

  async function handleSaveTurnstile(event) {
    event.preventDefault();
    setTurnstileErrors({});

    const payload = {
      enabled: Boolean(turnstileValue.enabled),
      siteKey: (turnstileValue.siteKey || "").trim(),
    };

    if (turnstileDraft?.secretKey) {
      payload.secretKey = turnstileDraft.secretKey.trim();
    }

    const outcome = await runSaveTurnstile(() => settingsApi.updateTurnstile(payload));

    if (outcome.ok) {
      setTurnstileDraft(null);
      toast.success("Turnstile settings were saved.");
      reload();
      return;
    }

    setTurnstileErrors(fieldErrors(outcome.error));
  }

  async function handleTest() {
    setTestResult(null);

    const outcome = await runTest(() => settingsApi.testSmtp());

    if (outcome.ok) {
      const result = outcome.result?.data ?? {};

      setTestResult({
        tone: "success",
        text: outcome.result?.message ?? "The mail server answered.",
        result,
      });

      return;
    }

    setTestResult({
      tone: "error",
      text: errorMessage(outcome.error, "The mail server test failed."),
      code: outcome.error?.data?.code ?? null,
    });
  }

  if (loading) return <LoadingState label="Loading settings…" />;

  if (error || !saved) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-danger">
          {errorMessage(error, "Settings could not be loaded.")}
        </p>

        <Button variant="secondary" size="sm" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  const dirty = draft !== null && Object.keys(buildPatch(smtp, value)).length > 0;

  return (
    <div className="space-y-6">
      {!saved.secretStorageConfigured ? (
        <p className="rounded-card border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          This server has no encryption key configured, so a mail password cannot be
          saved. An administrator must set <code className="font-mono">ENCRYPTION_KEY</code>{" "}
          in the server environment first.
        </p>
      ) : null}

      <section className="space-y-4 rounded-card border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">Outgoing mail (SMTP)</h2>

            <p className="mt-1 text-sm text-ink-soft">
              Credentials are encrypted at rest and are never shown after saving, so this
              form cannot display the stored password.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone={smtp.passwordConfigured ? "success" : "neutral"}>
              {smtp.passwordConfigured ? "Password stored" : "No password stored"}
            </Badge>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4" noValidate>
          {saveError ? (
            <p
              role="alert"
              className="rounded-control border border-danger bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
            >
              {errorMessage(saveError, "The mail settings could not be saved.")}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput
              id="smtp-host"
              label="Host"
              disabled={!canManage}
              /*
               * Autofill would type a value the administrator never entered and
               * leave the card dirty, offering a change that was never made.
               */
              autoComplete="off"
              value={value.host}
              onChange={(event) => patch({ host: event.target.value })}
              error={errors.host}
              maxLength={255}
              placeholder="smtp.example.com"
            />

            <NumberInput
              id="smtp-port"
              label="Port"
              disabled={!canManage}
              value={value.port}
              onChange={(event) => patch({ port: event.target.value })}
              error={errors.port}
              placeholder="587"
            />

            <Select
              id="smtp-auth-mode"
              label="Authentication"
              disabled={!canManage}
              value={value.authMode}
              onChange={(event) => patch({ authMode: event.target.value })}
              error={errors.authMode}
              options={[
                { value: "password", label: "Username and password" },
                { value: "none", label: "No authentication" },
              ]}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              id="smtp-username"
              label="Username"
              disabled={!canManage || value.authMode === "none"}
              value={value.username}
              onChange={(event) => patch({ username: event.target.value })}
              error={errors.username}
              maxLength={255}
              autoComplete="off"
            />

            <TextInput
              id="smtp-from"
              type="email"
              label="From address"
              disabled={!canManage}
              /*
               * A saved address is exactly what a browser offers to autofill on an
               * email input, which would dirty the card without an edit.
               */
              autoComplete="off"
              value={value.fromAddress}
              onChange={(event) => patch({ fromAddress: event.target.value })}
              error={errors.fromAddress}
              maxLength={255}
              placeholder="no-reply@example.com"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              id="smtp-password"
              type="password"
              label="Password"
              hint={
                smtp.passwordConfigured
                  ? "Leave blank to keep the stored password."
                  : "Saved encrypted, and never shown again."
              }
              disabled={!canManage || value.authMode === "none"}
              value={value.password}
              onChange={(event) => patch({ password: event.target.value })}
              error={errors.password}
              maxLength={200}
              autoComplete="new-password"
            />

            <Toggle
              id="smtp-secure"
              label="Connect with TLS from the start (SMTPS)"
              hint={
                value.secure
                  ? "Port 465 is the usual choice for this mode."
                  : "Otherwise the connection upgrades with STARTTLS when the server offers it."
              }
              checked={value.secure}
              disabled={!canManage}
              onChange={(event) => patch({ secure: event.target.checked })}
            />
          </div>

          {smtp.passwordConfigured && canManage ? (
            <Checkbox
              id="smtp-clear-password"
              label="Remove the stored password"
              hint="Use this when the mail account itself no longer has a password."
              checked={value.clearPassword}
              onChange={(event) => patch({ clearPassword: event.target.checked })}
            />
          ) : null}

          {canManage ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Button type="submit" loading={saving} disabled={!dirty}>
                Save mail settings
              </Button>

              <Button
                variant="secondary"
                type="button"
                onClick={resetDraft}
                disabled={!dirty || saving}
              >
                Discard changes
              </Button>

              <Button variant="secondary" type="button" onClick={handleTest} loading={testing}>
                Test connection
              </Button>
            </div>
          ) : (
            <p className="border-t border-line pt-4 text-sm text-ink-soft">
              You can review these settings but not change them; changing them and testing
              them needs the settings permission.
            </p>
          )}
        </form>

        {testResult ? (
          <div
            className={
              testResult.tone === "success"
                ? "rounded-card border border-success/30 bg-success-soft px-4 py-3 text-sm text-success"
                : "rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
            }
          >
            <p className="font-medium">{testResult.text}</p>

            {testResult.result ? (
              <p className="mt-1 text-xs">
                Reached {testResult.result.host}:{testResult.result.port}
                {testResult.result.tls ? " over TLS" : " without TLS"}
                {testResult.result.authAttempted
                  ? testResult.result.authAccepted
                    ? ", credentials accepted"
                    : ", credentials not accepted"
                  : ", credentials not attempted"}
                . No message was sent.
              </p>
            ) : null}

            {testResult.code ? (
              <p className="mt-1 font-mono text-xs">{testResult.code}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Cloudflare Turnstile Security Card */}
      <section className="space-y-4 rounded-card border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">Sign-in security (Cloudflare Turnstile)</h2>

            <p className="mt-1 text-sm text-ink-soft">
              Require a human verification challenge on the sign-in form to prevent automated brute-force and credential stuffing attacks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={turnstileValue.enabled ? "success" : "neutral"}>
              {turnstileValue.enabled ? "Active" : "Disabled"}
            </Badge>

            <Badge tone={turnstile.secretConfigured ? "success" : "warning"}>
              {turnstile.secretConfigured ? "Secret configured" : "No secret configured"}
            </Badge>

            {turnstile.configuredInEnv ? (
              <Badge tone="neutral">From environment</Badge>
            ) : null}
          </div>
        </div>

        <form onSubmit={handleSaveTurnstile} className="space-y-4" noValidate>
          {turnstileSaveError ? (
            <p
              role="alert"
              className="rounded-control border border-danger bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
            >
              {errorMessage(turnstileSaveError, "Turnstile settings could not be saved.")}
            </p>
          ) : null}

          <div className="rounded-control border border-line/60 bg-surface-muted/30 p-3.5">
            <Toggle
              id="turnstile-enabled"
              label="Enable Cloudflare Turnstile challenge on sign-in"
              hint="When enabled, visitors must complete the Turnstile challenge before they can submit credentials."
              checked={Boolean(turnstileValue.enabled)}
              disabled={!canManage}
              onChange={(event) =>
                setTurnstileDraft((cur) => ({
                  ...(cur ?? turnstile),
                  enabled: event.target.checked,
                }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              id="turnstile-sitekey"
              label="Site Key"
              disabled={!canManage}
              autoComplete="off"
              value={turnstileValue.siteKey ?? ""}
              onChange={(event) =>
                setTurnstileDraft((cur) => ({
                  ...(cur ?? turnstile),
                  siteKey: event.target.value,
                }))
              }
              error={turnstileErrors.siteKey}
              placeholder="0x4AAAAAAFd4ompD4TuKdB-I"
              hint="The public site key rendered on the login form."
            />

            <TextInput
              id="turnstile-secretkey"
              type="password"
              label="Secret Key"
              disabled={!canManage}
              autoComplete="new-password"
              value={turnstileDraft?.secretKey ?? ""}
              onChange={(event) =>
                setTurnstileDraft((cur) => ({
                  ...(cur ?? turnstile),
                  secretKey: event.target.value,
                }))
              }
              error={turnstileErrors.secretKey}
              placeholder={
                turnstile.secretConfigured
                  ? "Configured (leave blank to keep current)"
                  : "Enter secret key"
              }
              hint="Private secret key used server-side to verify tokens against Cloudflare."
            />
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Button type="submit" loading={savingTurnstile} disabled={!turnstileDirty}>
                Save Turnstile settings
              </Button>

              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setTurnstileDraft(null);
                  setTurnstileErrors({});
                }}
                disabled={!turnstileDirty || savingTurnstile}
              >
                Reset Turnstile changes
              </Button>
            </div>
          ) : (
            <p className="border-t border-line pt-4 text-sm text-ink-soft">
              You can review these settings but changing them requires the settings permission.
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
