/**
 * Preview seeding — the native no-op.
 *
 * Metro resolves `dev-seed.web.ts` over this file on web only, so an iOS or
 * Android bundle gets exactly this: a function that does nothing. Keeping the
 * pair means `_layout.tsx` has one unconditional call instead of a platform
 * branch, and deleting the preview is deleting two files and one line.
 *
 * Dev only. Goes before the freeze, with `src/lib/diagnostics/`.
 */
export async function devSeed(): Promise<void> {}
