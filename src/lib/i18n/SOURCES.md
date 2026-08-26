# Where Carta's Spanish comes from

CLAUDE.md §9: *"Spanish wording comes from **CDSS's official translations of the
same forms** wherever it exists, not from scratch translation."*

The content packs enforce that mechanically — every claim in `content/*.json`
carries `source_url`, `verified_on` and `confidence`, and `npm run content:check`
names anything unverified. **`en.json` and `es.json` have no such mechanism**:
they are flat string maps that i18next consumes, and adding provenance keys to
them would turn into translation keys. So provenance for the UI strings lives
here, and `tests/node/i18n.test.ts` keeps the two locales in the same shape.

This file records **which Spanish strings are the state's words and which are
Carta's**. That distinction is the whole point — writing plausible Spanish is
easy, and a plausible-but-invented label on a screen that says "check this
against your letter" is worse than no label.

---

## Sourced from CDSS forms

Both PDFs are committed under `tools/forms/spanish/`, downloaded manually on
**2026-08-22** because `cdss.ca.gov` returns a 302 to a dead host for automated
requests (CLAUDE.md §13).

### CF 377.6 (SP) — *Notificación de Acción, Se Necesita Información/Verificación*, Rev 8/13
`tools/forms/spanish/cf377_6_sp.pdf` · verified_on **2026-08-22**

| Carta string | Spanish now used | Form's printed label |
|---|---|---|
| `review.fields.caseNumber` | Número del caso | `Número del caso:` |
| `review.fields.recipientName` | Nombre del caso | `Nombre del caso:` |
| `review.fields.noticeDate` | Fecha de la notificación | `Fecha de la notificación:` |

**One nuance, recorded rather than smoothed over.** Carta's English for
`recipientName` is "Name on the letter" — the addressee. The form's label for
that same printed slot is `Nombre del caso`, which literally means *case name*.
On CF 377.6 and CF 30 there is exactly one name field and it carries that label,
so a user looking at the paper will find "Nombre del caso" and nothing else.
Review's job is to help them match what is on the page, so the page's label wins.
If a future notice type separates case name from addressee, this needs revisiting.

Also available from this form and **not yet used anywhere**, because Carta does
not extract these fields: `Nombre del trabajador`, `Número del trabajador`,
`Número de teléfono`, `Horario del trabajador`, `Dirección`, `CONDADO DE`.

### CF 30 (SP) — *Aviso de Recordatorio, SAR 7*, Rev 2/18
`tools/forms/spanish/cf30_sp_sar7-reminder.pdf` · verified_on **2026-08-22**

⚠️ **This is the reminder notice, not the SAR 7 form.** It is sent when a SAR 7
is missing or incomplete. It therefore carries no required-document checklist —
see "Still unsourced" below.

| Carta string | What was taken |
|---|---|
| `detail.mustDoWithDeadline` | The form's own statement of the stakes: *"Tiene que entregar un SAR 7 completado en \_\_\_ o antes para continuar recibiendo beneficios."* Carta now uses **"…o antes, para continuar recibiendo beneficios"** rather than a scratch translation of "send back before the date below". |
| `review.fields.caseNumber` | Confirms `Número del caso` (agrees with CF 377.6). |

**Available and deliberately unused:** the official Spanish name of the form,
**"Reporte sobre el estado de elegibilidad (SAR 7)"**. Carta has nowhere that
renders a form's long name today — Review shows the raw `formId` value ("SAR 7")
as printed. Recorded here so that if a form-name display is ever added, the
state's name is already to hand and nobody translates it again from scratch.

---

## Still unsourced — Carta's own wording

Everything not listed above. The largest and most important block:

### `content/doc_types.json` — the required-document vocabulary

Pay stub, rent receipt or lease, utility bill, bank statement, photo ID, Social
Security card, medical bill, child care receipt, school record, immigration
document.

**Neither staged form carries a required-document checklist**, so none of this
is sourced. It stays open on `npm run content:check` as
`doc_types: Spanish labels and descriptions`, and `_translation_blocker` in that
file names what is still needed:

- **SAR 7 (SP)** — the semi-annual report itself, whose "Section 3 — proof you
  must send" names each document type.
- **SAR 7A (SP)** — the "how to fill out your SAR 7" instruction sheet, which is
  likely to name them in plainer Spanish.

Three terms in that file *are* borrowed, from San Mateo County's Spanish SAR 7
guide (*Cómo completar el SAR 7*, adapted from San Diego County) rather than
from CDSS: **servicios públicos**, **comprobante** / **prueba**, and
**gastos médicos**. County wording, not state wording, and marked as such.

### The `settings.*` block — Carta's own wording (added 2026-08-25)

About thirty strings: the language picker, the model download, reminder timing,
the privacy explainer and "delete everything".

**None of it is sourced, and none of it should be.** CLAUDE.md §9 defers to CDSS
*"wherever it exists"*, and it does not exist here — the state does not publish a
Spanish translation of "one-time download, about 1.12 GB, use wifi". This is
software copy, not notice vocabulary, so the rule that applies is the one below:
prose keeps Carta's words.

Two deliberate choices worth recording:

- **`settings.language.en` / `.es` are endonyms in both locales** — "English" and
  "Español" render identically whether the UI is in English or Spanish. Someone
  who cannot read the current language has to be able to find their own, and
  translating a language's name into a language they do not read defeats the one
  control that gets them out.
- **`settings.privacyExact`** is a translation of the verbatim NOTES.md sentence,
  and it is the one string here that is *technical rather than plain*. It sits
  under its own heading, below three plain sentences that carry the meaning —
  see the comment on `PRIVACY_SENTENCE` in `settings.tsx` for why the
  reading-level rule is knowingly relaxed for that one paragraph and nowhere
  else.

**Still wants a fluent speaker**, like everything else in this section. Accents
are correct and the register is deliberately plain, but nobody has read it aloud.

### The rest of `en.json` / `es.json`

Carta's own plain-language copy, and mostly it should stay that way. **The state's
phrasing is the thing this app exists to translate** — CLAUDE.md §10 requires all
copy at ≤6th grade in both languages, and "Se necesita información/verificación"
is exactly the register Maria cannot parse at the end of a double shift.

So the rule applied here is:

> **Field labels take the state's words. Prose keeps Carta's.**

A label is something the user hunts for on a piece of paper, and it should match
the paper. A sentence is Carta explaining, and it should be plain. `review.actions.info_request`
stays "Necesitan papeles de usted" and not the form's own
"Se necesita información/verificación", on purpose.

### Fluent-speaker review, 2026-08-26

Every Spanish string in `cross_reference.json` (`what_es`) was read by a fluent
speaker and signed off, which closed that item on `npm run content:check`.

**`doc_types.json` was reviewed in the same pass and did not close**, and the
distinction is the point of this file: that item asks two questions — *is the
Spanish good* and *whose words are they* — and the review only answers the first.
CLAUDE.md §9 defers to CDSS's own wording wherever it exists, and for the proof
vocabulary it does exist, in SAR 7 (SP). Carta just does not have the document.
A well-reviewed translation is still a translation.

### `content/cross_reference.json`

California LifeLine, WIC, LIHEAP, school meals, Medi-Cal, subsidised child care,
Medi-Cal Dental, IHSS. **These are not CDSS forms**, so §9 has nothing to defer
to — there is no official translation of "discounted home phone service" to
prefer. Carta's wording, open on `content:check` as
`cross_reference: Spanish descriptions (what_es)` pending a fluent speaker.

---

## Keeping this honest

- A string moving from "Carta's" to "the state's" means someone read it on a
  committed PDF in `tools/forms/spanish/`, not that it sounds official.
- Applying a form's wording **does not close** a `content:check` item unless the
  form actually covers what that item is about. CF 377.6 and CF 30 improved four
  strings and closed **zero** items, because neither one covers the document
  vocabulary that the open items are about.
