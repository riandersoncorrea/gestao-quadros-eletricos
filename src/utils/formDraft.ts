// Best-effort localStorage persistence for in-progress form drafts.
// Failures (private browsing, quota, disabled storage) are swallowed —
// draft persistence must never break the form it's attached to.

export function saveDraft(key: string, data: Record<string, unknown>) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // ignore
  }
}

export function loadDraft<T = any>(key: string, maxAgeMs?: number): (T & { savedAt?: number }) | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (maxAgeMs && (!parsed.savedAt || Date.now() - parsed.savedAt > maxAgeMs)) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
