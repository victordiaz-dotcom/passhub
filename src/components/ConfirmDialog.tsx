type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Sí",
  cancelLabel = "No",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={onCancel}
    >
      <div className="modal max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        {message && <p className="mt-2 text-sm text-ink-soft">{message}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              variant === "danger"
                ? "rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90"
                : "btn-primary"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
