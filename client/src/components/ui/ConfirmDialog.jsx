import Modal from "./Modal.jsx";
import Button from "./Button.jsx";

/*
 * Destructive confirmations always name the object and the action, because
 * "Are you sure?" on a screen full of rows is how the wrong row gets archived.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>

          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            data-autofocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-ink-soft">
        <p className="text-ink">{message}</p>

        {detail ? <p>{detail}</p> : null}
      </div>
    </Modal>
  );
}
