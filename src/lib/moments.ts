export const MOMENT_LIFETIME_MS = 24 * 60 * 60 * 1000

export function isMomentActive(expiresAt: number, now = Date.now()): boolean {
  return Number.isFinite(expiresAt) && expiresAt > now
}

export function filterActiveMoments<T extends { expiresAt: number }>(
  moments: T[],
  now = Date.now(),
): T[] {
  return moments.filter(moment => isMomentActive(moment.expiresAt, now))
}
