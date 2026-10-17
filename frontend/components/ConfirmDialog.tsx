/** A small yes/no confirmation modal. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="animate-[pop_0.18s_ease-out] w-[min(22rem,92%)] rounded-2xl bg-slate-900 p-5 text-center shadow-2xl ring-1 ring-white/15">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="mt-1.5 text-sm text-white/70">{message}</p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg bg-white/10 px-4 py-2.5 font-semibold text-white transition hover:bg-white/20"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 font-bold text-black transition hover:bg-amber-400"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
