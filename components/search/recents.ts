"use client";

import type { RecentItem } from "./types";

const MAX = 6;
const keyFor = (userId: string) => `vp:recent-search:${userId}`;

/** Per-user, per-browser list of recently opened search results. */
export function readRecents(userId: string): RecentItem[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const list = raw ? (JSON.parse(raw) as RecentItem[]) : [];
    return Array.isArray(list) ? list.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(userId: string, item: RecentItem) {
  try {
    const next = [item, ...readRecents(userId).filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(0, MAX);
    localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    /* storage full / disabled — recents are a nicety */
  }
}

export function clearRecents(userId: string) {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}
