import Spinner from "./Spinner.jsx";

const VARIANTS = {
  primary:
    "bg-brand text-white hover:bg-brand-hover disabled:hover:bg-brand border-transparent",
  secondary:
    "bg-surface text-ink hover:bg-surface-sunken border-line-strong",
  ghost: "bg-transparent text-ink-soft hover:bg-surface-sunken border-transparent",
  danger:
    "bg-danger text-white hover:bg-danger-hover disabled:hover:bg-danger border-transparent",
  quiet: "bg-surface-sunken text-ink-soft hover:bg-line border-transparent",
};

const SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

/*
 * Buttons default to type="button" so a control inside a form can never submit
 * it by accident; callers opt in explicitly.
 */
function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  children,
  type = "button",
  ...rest
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center rounded-control border font-medium",
        "transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 12 : 14} /> : null}
      {children}
    </button>
  );
}

export default Button;
