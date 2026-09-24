"use client";

import { useEffect } from "react";

/**
 * Keyboard support for action menus (⋯ menus, "Move to"): focuses the
 * first item on open; ↑/↓ (wrapping), Home/End move between enabled
 * [role=menuitem]s; Esc closes and returns focus to the trigger; Tab
 * closes. Enter/Space are native button clicks.
 */
export function useMenuKeyboard(
  open: boolean,
  menuRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLElement | null>,
  close: () => void
) {
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const items = () =>
      Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));

    requestAnimationFrame(() => items()[0]?.focus());

    function onKey(e: KeyboardEvent) {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        list[(i + 1) % list.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        list[(i - 1 + list.length) % list.length]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        list[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        list[list.length - 1]?.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        triggerRef.current?.focus();
      } else if (e.key === "Tab") {
        close();
      }
    }
    menu.addEventListener("keydown", onKey);
    return () => menu.removeEventListener("keydown", onKey);
  }, [open, menuRef, triggerRef, close]);
}
