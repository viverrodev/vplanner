"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Toast = { id: number; kind: "success" | "error"; message: string };
type ToastAPI = { success: (message: string) => void; error: (message: string) => void };

const ToastContext = createContext<ToastAPI | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const api: ToastAPI = {
    success: (message) => push("success", message),
    error: (message) => push("error", message),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 shadow-lg text-[13px] font-medium max-w-sm animate-[toastin_.2s_ease] ${
              t.kind === "error" ? "bg-red text-white" : "bg-ink text-paper"
            }`}
          >
            <span className="mt-[1px]">{t.kind === "error" ? "⚠" : "✓"}</span>
            <span className="leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
