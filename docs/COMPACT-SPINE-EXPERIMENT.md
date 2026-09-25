# Compact-spine experiment

This optional numerical experiment tests a compact model response with an explicitly selected recipe. It preserves the useful compact-output idea from PR 6 without changing `draftUnit`, normal character lookup, CLI generation, UnitLab or `planned-v1`. The caller selects one of six generic recipes: `aimed`, `chain`, `heavy`, `element`, `deadeye` or `ward`. Selection is caller assistance, not automatic interpretation of a character.

The supplied Request and mechanics Definition remain authoritative. Recipe prices, abilities and progression suggestions are hints. Incompatible hints must be omitted or adapted. The experiment uses the existing numerical backend with three five-tier paths. Its compact base cannot represent a distinct-target volley or follow-up; it does not replace qualitative concept generation.

The separate interpretation experiment cannot be combined with this route. A Request containing a non-null pinned interpretation is rejected before any model call. Keeping the factors separate avoids claiming that a selected recipe preserves a supplied interpretation.

## Run an explicit example

Build with `pnpm build`. The public [request](../data/reference/bomb-shooter.compact-spine.request.json) includes a Bomb Shooter brief, explicit source text, constraints and a numerical Definition using Tokens. It requires no private project. The following example uses the existing Codex login and the configured Codex model. Running it dispatches a model call and allows one repair. It does not overwrite an existing output file.

```sh
node --input-type=module <<'JS'
import { mkdir, writeFile } from 'node:fs/promises';
import { prepareRequest } from '@mardwerk/unit-generator';
import { CodexModelClient, loadRequestFile, createEvidenceRun } from '@mardwerk/unit-generator/node';
import { draftCompactSpine } from '@mardwerk/unit-generator/experiments/compact-spine';

await mkdir('data/runs', { recursive: true });
const request = await loadRequestFile('data/reference/bomb-shooter.compact-spine.request.json');
const prepared = await prepareRequest(request);
const run = await createEvidenceRun({ directory: 'data/runs/evidence', input: prepared });
let result;
try {
  result = await draftCompactSpine(
    prepared,
    run.wrap(new CodexModelClient()),
    { spineId: 'aimed', maxRepairAttempts: 1 },
  );
} catch (error) {
  await run.fail(error);
  throw error;
}
await run.finish(result);
await writeFile('data/runs/compact-spine.result.json', JSON.stringify(result, null, 2), { flag: 'wx' });
JS
```

This is a usage example, not a recorded generation. The recording wrapper saves exact model requests and original responses before decoding, including failures. The final result retains the compact output, selected recipe, checked artifact and reported attempt usage. Missing usage remains unknown. Record scenarios, preservation judgments and acceptance in the run's `observations.json`; private input and output files stay outside version control.

`result.checked` is a normal checked artifact that the existing renderer, review API and library can consume. `result.output` retains the compact response and explicit source-span selections. `result.spine` records the recipe assistance. A revision supplies the full prior candidate and explicit feedback in `request.previous` and `request.feedback`, then prepares a new Request.

## What the checks establish

The model selects supplied source-span IDs for the base and each path. Code copies their exact document IDs and quotes and translates the explicit joins into blueprint references. An unknown span fails validation; there is no positional citation fallback. Valid joins establish where a claim came from, not whether its interpretation is faithful.

Each constraint receives a model-written implementation account or unresolved limitation. That text is retained unchanged. The ordinary checks inspect coverage and supported numerical mechanics; they do not prove natural-language constraint satisfaction or design preservation. Unsupported behaviors remain explicit proposals or reserved techniques.

The original PR's name-based trope intake, regex-derived source organization, generic constraint claims and simulator usefulness gate are excluded. There is no requirement to improve a kill-count score, add a manual ability, use a minimum follow-up radius or exceed a universal specialty multiplier unless the supplied Definition itself requires it. A failed or missing evaluator implementation is not evidence that a mechanic has no value.

The branch report at [3e5d73b](https://github.com/mardwerk/unit-generator/blob/3e5d73bd8ad588067a16e9e47721e797fc09c27b/docs/PIPELINE-EVALUATION.md) records earlier exploratory generations of the original route. It does not validate this revised experiment or justify a default change. On September 22, 2026, offline model-double tests verified source joins, complete revision context, bounded repair, usage accounting, supplied-Definition enforcement and isolation from normal entry points. No live experiment or gameplay study was run for this adaptation.
