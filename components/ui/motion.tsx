"use client";

import { useEffect, useState, useTransition } from "react";
import { setAnimations } from "@/app/(dashboard)/settings/actions";
import { useToast } from "./toast-provider";

const KEY = "vp-motion";

function apply(enabled: boolean) {
  try {
    if (enabled) {
      delete document.documentElement.dataset.motion;
      localStorage.removeItem(KEY);
    } else {
      document.documentElement.dataset.motion = "off";
      localStorage.setItem(KEY, "off");
    }
  } catch {
    /* private mode: the attribute still applies for this visit */
  }
}

/** Keeps this device in line with the account's animation setting. */
export function MotionSync({ enabled }: { enabled: boolean }) {
  useEffect(() => apply(enabled), [enabled]);
  return null;
}

/** Settings → Preferences → Animations. */
export function AnimationsToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const toast = useToast();

  function toggle() {
    const next = !on;
    setOn(next);
    apply(next);
    start(async () => {
      const res = await setAnimations(next);
      if (res?.error) {
        setOn(!next);
        apply(!next);
        toast.error(res.error);
      } else toast.success(next ? "Animations on" : "Animations off");
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Animations"
      disabled={pending}
      onClick={toggle}
      className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
      style={{ background: on ? "rgb(var(--green))" : "rgb(var(--line) / 0.2)" }}
    >
      <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}
