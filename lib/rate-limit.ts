/**
 * A small in-memory attempt counter, used to slow password guessing.
 *
 * bcrypt makes each guess expensive, but "expensive" only matters against a
 * stolen hash file. Against the login form an attacker gets unlimited tries at
 * the real thing, and staff passwords are the guessable kind. This puts a lock
 * on the door after a handful of misses.
 *
 * In memory, deliberately: the app is one Node process against one SQLite file,
 * so there is nowhere else for this to live and nothing to share it with. A
 * restart clears the counters — an attacker can't cause a restart, and the
 * legitimate cost of that is one forgotten lockout ending early.
 *
 * If this ever runs behind more than one process, this must move to the
 * database or it will only count the attempts that happen to hit one of them.
 */

type Attempt = { count: number; first: number; lockedUntil: number };

const attempts = new Map<string, Attempt>();

/** Misses allowed before the door shuts. */
const MAX_ATTEMPTS = 5;
/** Misses older than this no longer count against you. */
const WINDOW_MS = 15 * 60 * 1000;
/** How long the lock holds once it trips. */
const LOCK_MS = 15 * 60 * 1000;
/** Stop the map growing without bound if someone sprays random addresses. */
const MAX_KEYS = 10_000;

/**
 * Whether this key is currently locked out, and for how much longer.
 * Call before doing any password work.
 */
export function checkRateLimit(key: string): {
  allowed: boolean;
  retryAfterMinutes: number;
} {
  const now = Date.now();
  const found = attempts.get(key);
  if (!found) return { allowed: true, retryAfterMinutes: 0 };

  if (found.lockedUntil > now) {
    return {
      allowed: false,
      // Round up, so "1 minute" never means "any second now" to someone waiting.
      retryAfterMinutes: Math.ceil((found.lockedUntil - now) / 60_000),
    };
  }

  // The lock has expired, or the window has rolled over: start clean.
  if (found.lockedUntil > 0 || now - found.first > WINDOW_MS) {
    attempts.delete(key);
  }
  return { allowed: true, retryAfterMinutes: 0 };
}

/** Record a failure. Trips the lock once the misses pile up. */
export function recordFailure(key: string): void {
  const now = Date.now();
  sweep(now);

  const found = attempts.get(key);
  if (!found || now - found.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now, lockedUntil: 0 });
    return;
  }

  found.count += 1;
  if (found.count >= MAX_ATTEMPTS) found.lockedUntil = now + LOCK_MS;
}

/** A success wipes the slate — the person clearly owns the account. */
export function clearRateLimit(key: string): void {
  attempts.delete(key);
}

/** Drop entries nothing is waiting on, so the map can't grow forever. */
function sweep(now: number): void {
  if (attempts.size < MAX_KEYS) return;
  for (const [key, a] of attempts) {
    if (a.lockedUntil < now && now - a.first > WINDOW_MS) attempts.delete(key);
  }
}
