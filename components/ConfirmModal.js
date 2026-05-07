export default function ConfirmModal({
  visible,
  onCancel,
  onConfirm,
  message,
  title = "Confirmar cambios",
  detail,
  confirmLabel = "Guardar cambios",
  cancelLabel = "Seguir editando",
  children,
}) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-indigo-600 to-sky-500 px-6 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-100">Validacion</p>
          <h3 className="mt-1 text-xl font-bold">{title}</h3>
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-base font-semibold text-slate-900">{message}</p>
          {detail && <p className="text-sm text-slate-600">{detail}</p>}
          {children}
          <p className="text-xs text-slate-500">Esta accion aplicara los cambios del formulario al producto seleccionado.</p>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-100 transition"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="w-full sm:w-auto rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 shadow-sm transition"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
