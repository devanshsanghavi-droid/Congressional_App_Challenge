/**
 * Strip entitlements a personal (free) Apple Developer team cannot be granted.
 *
 * AUTHORSHIP: Claude. Build configuration.
 *
 * Xcode refuses to create a development provisioning profile at all if the
 * entitlement set contains anything the team is not entitled to:
 *
 *   error: Cannot create a iOS App Development provisioning profile for
 *   "com.devanshsanghavi.carta". Personal development teams, including
 *   "Devansh Sanghavi", do not support the Extended Virtual Addressing and
 *   Push Notifications capabilities.
 *
 * NOTE: this plugin must be FIRST in app.json's `plugins` array. Expo mods
 * run in reverse registration order, so first-registered runs last — and it has
 * to run after expo-notifications, which re-adds `aps-environment` whenever it
 * finds it missing.
 *
 * `app.json` keeps the full *intended* set, because that is what the app wants
 * and what a paid team would ship. This plugin removes what cannot be signed
 * today. **Delete this plugin from app.json's `plugins` array the moment there
 * is a paid developer account** and both come back with no other change.
 */

const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = function withPersonalTeamEntitlements(config) {
  return withEntitlementsPlist(config, (mod) => {
    // ---------------------------------------------------------------------
    // aps-environment — REMOVED PERMANENTLY, and this is a correction.
    //
    // Added by expo-notifications' own config plugin, which assumes you want
    // remote push. Carta does not: every reminder is computed on the device
    // from a date the user confirmed and scheduled locally with iOS. SPEC §6
    // says "locally scheduled only"; there is no push token call anywhere, and
    // tests/node/privacy.test.ts asserts that.
    //
    // So this entitlement was never needed. Removing it is not a compromise —
    // it makes the app *unable* to receive a remote push, which is a stronger
    // version of the promise than a code comment saying we do not.
    // ---------------------------------------------------------------------
    delete mod.modResults['aps-environment'];

    // ---------------------------------------------------------------------
    // extended-virtual-addressing — REMOVED FOR BUILD A, KEPT FOR BUILD B.
    //
    // Split 2026-08-26. The camera path does not need this entitlement; only
    // the ~1 GB model does. Coupling them meant every failure to sign the model
    // entitlement also cost the camera, which is why the capture path had still
    // never run on a phone months in.
    //
    //   Build A (default)          — no model. Camera, picker, OCR, cascade,
    //                                Review, save, real banner. Stripped here.
    //   Build B (CARTA_MODEL_BUILD=1) — keeps it, for the model only.
    //
    // This one is real and it is wanted. llama.rn needs it to hold a ~1 GB
    // GGUF model; without it the model is OOM-killed, and CLAUDE.md §13 records
    // that this misreads as "the model is too big, downgrade to 0.5B" when it
    // is actually an entitlement problem.
    //
    // `increased-memory-limit` survives — a personal team can have that one —
    // so the memory ceiling is still raised, just not the address space.
    //
    // **Any llama.rn benchmark run on a build made with this plugin active is
    // measuring the wrong thing.** The local model is no longer part of
    // extraction (2026-08-20), so it does not block the capture path, but the
    // week 1 latency numbers need a paid team before they mean anything.
    // ---------------------------------------------------------------------
    if (process.env['CARTA_MODEL_BUILD'] === '1') {
      // Build B. Both memory entitlements stay, and it is the caller's problem
      // whether the signing team can hold them.
      return mod;
    }

    // Both of these exist for the ~1 GB GGUF and nothing else — CLAUDE.md §13
    // records that without them the model is OOM-killed, and that the failure
    // misreads as "the model is too big". Build A has no model, so it needs
    // neither, and every capability dropped here is one fewer thing the App ID
    // has to be granted before a phone will run the camera.
    delete mod.modResults['com.apple.developer.kernel.extended-virtual-addressing'];
    delete mod.modResults['com.apple.developer.kernel.increased-memory-limit'];

    return mod;
  });
};
