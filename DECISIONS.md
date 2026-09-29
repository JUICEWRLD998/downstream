# Downstream — build-window decisions and measured evidence

Newest first. Every bullet carries a bold label, the measurement, the rejected alternative, and the test or
command that pins it. No quality adjective without its instrument and number; an unmeasured claim is written
as *unmeasured*. Wrongness is an entry, never an edit.

---

## 2026-09-29 (Phase 2 — the what-if model)

### The model is pure, and the sliders' constants live with it
- **`src/lib/model.ts` takes numbers, never data.** `getSimulatableCompounds` in `data.ts` supplies `C0` and `r0`; the model knows nothing about
  compounds. This is what lets the formula rendered on `/about` and the arithmetic behind the result panel be the same code rather than two
  implementations that agree until one is edited. The defaults and ranges the plan specifies (`d` 0.05 / 0–0.30, `u` 0.10 / 0–0.5, ceiling 0.95,
  dominance factor 3) are exported constants so Phase 3's sliders read them instead of hard-coding and drifting.
- **Out-of-range input is deliberately not clamped.** An `r1` below `r0` produces `C1 > C0`; a `d × a` above 1 produces a negative load. Silently
  clamping would turn a broken control into a plausible-looking number, which is the failure mode the whole evidence-labelling scheme exists to
  prevent. Pinned by the test *"does not clamp out-of-range input, so a UI bug cannot look plausible"*.
- **Two degenerate cases return a documented value instead of `NaN` or `Infinity`.** `u = 0, r0 = 1` makes `passThrough(r0)` zero — a plant that
  already removes everything, so the ratio is 1 because an upgrade has nothing left to remove. `C0 = 0` has no reduction to report, so the
  percentage is 0. Both are reachable through the sliders and both would otherwise print `NaN`/`Infinity` into the result panel.

### Correction to a Phase 1 assumption — one compound is simulatable, not four
- **Measured, after two of my own predictions were wrong.** I expected `ciprofloxacin` per city and, on the first run, an empty Oslo. Both were
  wrong: `ciprofloxacin` has **no detection row at all** (`detections.some(d => d.compoundId === "ciprofloxacin")` → `false`), and `carbamazepine`
  carries a **study-wide** maximum of **1,218 ng/L**, so it resolves for all five cities through the `cityId: "all"` fallback. The pinned map is
  therefore `{benevento, coimbra, ghent, oslo, toulouse} → ["carbamazepine"]`. What went wrong was the predicting, not the code: I reasoned from
  the plan's *required* compounds instead of reading the detection rows. Two of the four parameters — `atenolol` and `propranolol` — occur in
  `detections.json` only with `value: null`, because the study reports their per-city detection frequency and not their concentration.
- **Consequence for the UI, stated rather than smoothed over.** The `/whatif` dropdown will offer exactly one compound today, and its value is
  study-wide. Phase 3 must render "Study-wide value (all 5 cities)" on the result panel, not only on the city cards, or the simulation will read as
  if 1,218 ng/L were measured in the visitor's own city. This is a **coverage gap, not a bug**: `null` means "not reported" and the simulator is
  supposed to hide what it cannot support.
- **Pinned so it cannot close by accident.** The coverage map and the study-wide scope are asserted per city, and the antibiotic check asserts
  `ciprofloxacin` still has no baseline — so adding one is a deliberate act that fails a test first.

### Phase 2 needs no AI model
- **Decision: no OpenRouter, no Gemini 2.5 Flash, no model dependency in Phase 2.** Everything in §6 is closed-form arithmetic over six numbers;
  a language model has nothing to compute here. The plausible future use is an unscripted "ask about your stream" surface, and
  `IMPLEMENTATION.md` §9 explicitly lists **a chatbot** under "Do NOT build", alongside accounts, live sensors and maps. Adding a provider now would
  buy an API key to manage, a cost surface, and a nondeterministic step inside a pipeline whose entire value is that every number is traceable to a
  citation. Rejected alternative: wiring Gemini in early "in case". The key stays unused; if a later surface genuinely needs generation, that is a
  fresh decision with its own justification.
- **Retraction, in place.** A first draft of this entry claimed the disposal branch was unreachable through the sliders as specified, and quoted
  "≈78%" from an arithmetic slip (`0.9 × 0.7` written as `0.9 + 0.7`). Both claims were wrong. Measured, with the test
  *"reaches the disposal message from real slider values, not just literals"*: at `d = 0.3, a = 1, u = 0.1, r0 = 0.2, r1 = 0.3` take-back is
  **30.00%** against treatment **≈10.98%**, so the branch fires on a strict take-back win and not only on a tie. The `d ≤ 0.30` cap does bound
  take-back at 30%, but a treatment slider left near `r0` stays below that. The lesson is the ordinary one: I asserted a reachability claim from
  reasoning instead of writing the case, which is the same failure this file records elsewhere as "an empty scan and a broken scanner look
  identical".
- **The real Phase 3 hazard, measured.** At the page's initial state (`a = 0`, `r1 = r0`) both effects are exactly zero, and `0 >= 0` resolves to
  `VERDICT_DISPOSAL_MATTERS`. So a page that renders `verdict()` unconditionally opens by telling the visitor how they dispose of unused pills,
  before they have touched a control. Phase 3 must render a "nothing changed yet" state. Pinned by
  *"returns the disposal message before the user touches anything"* rather than left as a comment.

### Verification
- **`npm run verify` green on the Phase 2 branch.** `next typegen && tsc --noEmit` → `eslint` → **43/43 tests** (up from 22) → `next build`,
  exit code 0. The 252-case slider grid is the load-bearing test: it is what turns "the formula looks bounded" into a measured claim. Every
  `npm run verify` piped to `tail`/`grep` reports the *pipe's* exit status, not npm's, and looked green while showing only 14 lines of output — the
  real gate is `npm run verify > log 2>&1; echo "REAL_EXIT=$?"`.

### Phase 3 decisions taken before it starts
- **CSS Modules and design tokens; Tailwind is out.** `IMPLEMENTATION.md` §3 mandates Tailwind v4, and it is installed and wired through
  `postcss.config.mjs`. The operator's standing design preference is CSS Modules with a token cascade and explicitly no Tailwind (it is what the
  masayume and anti-slop UI workflow assumes), and on the conflict being put to them they chose CSS Modules. Rejected alternative: keeping
  Tailwind for layout and tokens only for colour — two systems to keep coherent for no gain on a six-screen app.
- **Consequence, deliberately deferred to Phase 3's first step.** `tailwindcss` and `@tailwindcss/postcss` are still live dependencies and
  PostCSS is still wired to them. Leaving them is a landmine: any file that adds `@import "tailwindcss"` silently starts a second styling system
  next to the token cascade. Removing them is a code change that needs its own `npm run verify`, so it is the first Phase 3 task rather than
  something done here.
- **The simulator ships with carbamazepine alone.** On the coverage gap being put to them, the operator chose to proceed rather than spend budget
  hunting baselines. Phase 3 must therefore label the result panel's baseline "Study-wide value (all 5 cities)", because 1,218 ng/L is the
  all-sites maximum and not a figure measured in the visitor's city. Rejected alternatives: a research pass for the `atenolol` / `propranolol` /
  `ciprofloxacin` baselines (the study's SI is unobtainable), and listing the three as disabled "not enough data" rows.

---

## 2026-09-29 (Phase 1 — data foundation and campaign validation)

### Per-compound values exist, stated in the body text — not in Table 5
- **The app's headline numbers are recoverable, with city and sampling site.** The paper states them in prose
  rather than only in the (vector-outline) Table 5: irbesartan **31,659 ng/L** (T13, Toulouse);
  acetaminophen **16,789 ng/L** (G6, Ghent); losartan **1,676 ng/L** (G1, Ghent); ofloxacin **1,625 ng/L**
  (G21, Ghent, which the paper itself calls *"considered an outlier"*); and the study-wide group maxima in
  Table 3 (carbamazepine 1,218 · citalopram 1,599 · ofloxacin 1,625). Lowest single value: bisoprolol
  **0.06 ng/L** (C11, Coimbra). Rejected alternative: accepting the earlier verdict that the data was
  locked in Table 5 and therefore unavailable. Test: `node research/params/extract-values.mjs`, which
  refuses to run unless a planted positive control (`irbesartan` + `31,659`) is present in the source text.
- **Correction to an earlier conclusion — the extraction instrument, not the PDF, was the limit.**
  A prior pass reported Table 5 unrecoverable because nothing installed could rasterise it, and asked for
  poppler to be installed. **`pdftotext` (poppler) was already on PATH at `/mingw64/bin/pdftotext`** and
  reads this paper's Tables 2/3/4 and body cleanly. The rasteriser verdict was about the toolkit that had
  been checked (pdftoppm/ghostscript/mutool — rasterisers), not about the document. Table 5's *body* is
  genuinely a Form XObject of vector outlines (that part was right), but the values it was believed to
  guard are in the text after all. Saved as `research/extraction/paper_poppler.txt`.
- **An empty scan and a broken scanner look identical.** My first removal-table matchers required a `%`
  *inside the row*, which is blind to the commonest table shape — `Removal (%)` in the header with bare
  ranges such as `0-70` in the rows (exactly PMC12459797's shape). Widening the matcher to key off the
  caption/header and match compound abbreviations produced hits on the next run. Separately, `FULL_TEXT:`
  is not a supported Europe PMC field: it returns **0 hits silently**, not an error.

### What-if parameters: four compounds, cited, with the limit stated
- **carbamazepine 0.2** (required, passes through treatment poorly), **ciprofloxacin 0.4** (the required
  antibiotic), **propranolol 0.65**, **atenolol 0.97** — plus atenolol's **0.9** excreted-unchanged
  fraction. Sources: Charlebois & Nyutu 2026 *Toxics* 14(5):402; Zhao et al. 2026 *RSC Adv* 16(28);
  Machado et al. 2026 *ESPR* 33(15). Each cited in `sources.json` with DOI.
- **Rejected alternative: advanced-oxidation and membrane numbers.** The review tables offering
  ozonation/photo-Fenton/UV/membrane removal figures describe an *upgrade*; `r0` in the model means the
  conventional plant in place today. Using them would have misrepresented the baseline as far better than
  it is, which is the direction of error that flatters the status quo. The four chosen values sit at the
  poor-removal end of the ranges a review reports for conventional treatment, which is consistent with the
  study's own framing (*"the general inefficiency of the WWTPs to remove pharmaceuticals"*).
- **Honest limit, carried into the UI:** these are EU-wide reported ranges, not measurements taken at these
  five plants. The parameter is labelled *Literature estimate*, never *Measured*.

### Study-wide vs per-city: the fallback branch is the one that applies
- **The paper publishes no per-city median per compound.** Table 3 is explicitly study-wide — *"in the 102
  stream sites"* — and per-city detail lives in SM Table S2, which is not obtainable (`hasSuppl: N`; the
  publisher returns 403; no repository holds the SI). So the six group medians and the two study-wide
  maxima sit under `cityId: "all"` and must render with the note *"Study-wide value (all 5 cities)"*.
  Only the four per-compound maxima and the per-city Watch List frequencies are genuinely city-specific.

### Data model: one deliberate widening
- **Six therapeutic-group rows use `group-*` ids, and a test pins them.** The study reports the therapeutic
  groups as single figures (e.g. "Antibiotic 4/7, 24 % of sites, 1625 ng/L, median 41"), so they are not
  compounds and cannot carry a `compoundId`. The referential-integrity test skips `group-*` and a second
  test asserts only the six known group ids appear. Rejected alternative: inventing a 17th "compound" to
  hold group data, which would have broken the `compounds.length === 16` check that exists to catch exactly
  that kind of drift.

### Verification: the chain had a real gap
- **`tsc --noEmit` alone fails on a Next 16 project; `next typegen` must run first.** The generated
  `LayoutProps` global lives in `.next/types`, which does not exist on a clean checkout. `npm run
  typecheck` now runs `next typegen && tsc --noEmit`. Evidence: before the fix, `src/app/layout.tsx(20,50):
  error TS2304: Cannot find name 'LayoutProps'`; after it, clean. `npm run verify` (typecheck → lint → test
  → build) passes end to end: **22/22 tests, build static-prerendered.**
- **Vitest config renamed to `.mts` and switched to `import.meta.dirname`.** Both were Vite
  `configLoader: 'native'` warnings, not errors; fixing them keeps the test output silent so a real warning
  stands out.

### The lane is empty, and the sweep is now falsifiable
- **Empty cell confirmed, with a positive control.** GitHub REST repo search: `q=oneaquahealth` →
  `total_count = 29`; `q=pharmaceutical+stream+hackathon` → `0`; `medicine+stream+hackathon` → `0`;
  `antibiotic+resistance+stream+citizen` → `0`; `amr+river+citizen+science` → `0`;
  `medicine+cabinet+disposal` → `0`; `pharmaco+stream` → `2` (unrelated academic); 
  `pharmaceutical+wastewater+treatment+plant` → `3` (unrelated).
  Rejected alternative: trusting the prior selection note's absence claim as written. That claim named 13
  entrants; the sweep found **29 repos / ~10 occupied cells**, so the field was undercounted by the note
  even though its cell structure held. Evidence and the positive-control argument: `research/lane/LANE_SWEEP.md`.
- **Honest regression note — the absence is not provable.** The Devpost project gallery for this event is
  unpublished (*"the hackathon managers haven't published this gallery yet"*), so no search can prove nobody
  else is in this lane. The defensible claim is narrower: *no competitor is publicly discoverable as of
  2026-09-29*. This limitation is written into `LANE_SWEEP.md` rather than smoothed over. Re-check queued
  before freeze.

### Eligibility: the event's own two pages contradict each other, and rules govern
- **Blocker resolved.** The Devpost overview box states *"Students only · Team required · Companies/professional
  organizations excluded."* The **rules page** states *"Open to individuals or teams (each participant can join
  only one team)"* and gives the only individual requirement as *"Participants must meet the legal age
  requirement in their country of residence."* No student or affiliation restriction appears on the rules page.
  Decision: **rules page governs** — individual, non-student participation is permitted. Rejected alternative:
  withdrawing, or recruiting teammates to satisfy the overview box. Test: `WebFetch` of
  `oneaquahealth-ieee-hackathon.devpost.com/rules` vs the landing page; quotes recorded above.
- **Deadline conflict recorded, unresolved by choice.** The page header says *"Oct 4, 2026 @ 9:00pm PDT"*
  while the timeline says *"September 16 – September 30, 2026."* Working assumption: **Oct 4, 9:00pm PDT**,
  with the internal deadline of Oct 4 12:00 PM PDT retained, because assuming the earlier date costs optionality
  and assuming the later one costs the entry if it is real. Partition sits at 1,165 registered participants.

### The dataset is real, and a manuscript copy is obtainable
- **Source verified and localised.** Rodrigues et al. 2025, *J Hazard Mater* 499:139946, PMID 41075635. OpenAlex
  reports `is_oa: true`, `oa_status: hybrid`, CC BY-NC-ND. An author-accepted manuscript is retrievable from HAL:
  `https://hal.science/hal-05369037v1/document` → HTTP 200, `content-length: 7000057`,
  `content-disposition: inline; filename="Rodrigues_2025.pdf"`. Saved as `research/papers/hal-paper.pdf`
  (7,000,057 bytes, `%PDF-1.4` magic verified). Rejected alternative: designing around the abstract alone, or
  treating the publisher WAF (403 on sciencedirect.com) as proof the data is unreachable.
- **Policy brief downloaded.** Zenodo record 22025388 → `research/papers/policy-brief.pdf`, 10,880,613 bytes,
  matching the API's stated file size and md5 `2bdee02f8a99b4c9cae4bf3c856fc7af`. CC BY 4.0.

### Environment: the npm cache path silently blocked the install
- **Root cause found, with the fix.** `npm config get cache` → `C:\Users\fadhm\AppData\Local\npm-cache`, which
  is **outside the project directory**, so writes to it are blocked and `npm install` stalls before creating
  `node_modules` (observed: `node_modules` absent after ~7 minutes with a 0-byte log). Retrying with
  `--cache ./.npm-cache` populated 216 MB and `node_modules` began materialising. The registry is a mirror
  (`registry.npmmirror.com`) and reachable (`npm ping` → `PONG 2164ms`). Rejected alternative: reading the
  stall as a network fault and abandoning the install. `/.npm-cache` added to `.gitignore`.

### Phase 1 scope, fixed
- **Exactly 16 compounds, and the count is a test.** The study reports 16 pharmaceuticals across 6 therapeutic
  classes; `data.test.ts` asserts `compounds.length === 16` so an extraction that drops or invents a compound
  fails loudly rather than quietly. Rejected alternative: shipping whatever count the extraction returned.
- **`null` means "not reported", and is never collapsed to zero.** The schema keeps nullable concentration,
  detection frequency and parameters; the simulator hides any compound lacking a citation rather than defaulting
  its parameters. Test: `data.test.ts` → *"parametrises at least four compounds"*, *"includes carbamazepine"*,
  *"includes at least one antibiotic"*, and `"never reports a concentration without a citation"`.
- **Provenance is asserted, not assumed.** `data.test.ts` requires `sources.json` to cite both the study
  (`10.1016/j.jhazmat.2025.139946`) and the policy brief (`22025388`), and requires every `sourceId`,
  `compoundId` and `cityId` reference to resolve. Rejected alternative: relying on zod alone, which validates a
  file in isolation and cannot see a dangling reference.
