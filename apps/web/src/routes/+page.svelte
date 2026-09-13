<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { Select, Checkbox, Composer, ThemeToggle, ViewSwitcher } from '@mardwerk/ui';
  import {
    Box,
    SlidersHorizontal,
    Download,
    ArrowUp,
    Check,
    Code,
    ShieldCheck,
    BookOpen,
    X,
    Plus,
    Minus,
    ChevronRight
  } from '@lucide/svelte';
  import type { PageData } from './$types';
  import type { RunResult, ResearchResult, ValidationReport } from '@mardwerk/unit-core';

  let { data }: { data: PageData } = $props();
  let subject = $state('');
  let intent = $state('');
  let definition = $state<string>(untrack(() => data.defaultDefinitionId));
  let usesSubject = $derived(
    ['classic-three-path', 'manga-mayhem', 'btd6-derived', 'tower-defense'].includes(definition)
  );
  let mode = $state('default');
  let provider = $state('');
  let original = $state(true);
  let conceptKind = $state('original');
  let sourcesOpen = $state(false);
  let setupOpen = $state(false);
  let selectedMode = $derived(data.modes.find((item) => item.id === mode));
  let connectionAvailable = $derived(
    provider === 'fixture' || !!provider || !!selectedMode?.configured
  );
  let currentOperation = $state<'generate' | 'research'>('generate');
  let startedAt = $state(0);
  let elapsedSeconds = $state(0);
  const definitionLabels: Record<string, string> = {
    'classic-three-path': 'Classic three-path',
    'manga-mayhem': 'MangaMayhem',
    'btd6-derived': 'BTD6-derived',
    'tower-defense': 'Tower defense',
    'merge-family-example': 'Merge unit family'
  };
  const definitionHints: Record<string, string> = {
    'tower-defense':
      'Three upgrade paths, crosspaths and abilities on the shared mechanics engine. Review coverage for each result.',
    'classic-three-path': 'Three upgrade paths with five tiers. Uses the classic game rules.',
    'manga-mayhem':
      'Combat forms, Techniques and stamina. Prototype rules; review mechanic coverage.',
    'btd6-derived':
      'Tower attacks, crosspaths and abilities. Prototype rules; some game behavior is unassessed.',
    'merge-family-example': 'An example contract for a family of mergeable units.'
  };
  let permitResearch = $state(false);
  let allowUngrounded = $state(false);
  let sourceText = $state('');
  let sourceUrls = $state('');
  let continuity = $state('');
  let constraints = $state('');
  let context = $state('');
  let knowledge = $state('');
  let customInput = $state('');
  let advancedOpen = $state(false);
  let jsonOpen = $state(false);
  let outputView = $state<string>('design');
  let form = $state<HTMLFormElement>();
  const examples = [
    {
      name: 'Clockwork heron',
      role: 'Precision / control',
      intent: 'Protect narrow approaches with precise strikes, at the cost of sustained damage.'
    },
    {
      name: 'Lantern keeper',
      role: 'Support / detection',
      intent: 'Reveal hidden enemies and support nearby allies, with little direct damage.'
    },
    {
      name: 'Bramble ram',
      role: 'Area damage / disruption',
      intent:
        'Break up groups with a short-range charge. Strong against crowds, weak against isolated fast enemies.'
    }
  ];
  function useExample(example: (typeof examples)[number]) {
    subject = example.name;
    intent = example.intent;
    original = true;
    conceptKind = 'original';
    document.getElementById('subject')?.focus();
  }
  let busy = $state(false);
  let validating = $state(false);
  let error = $state('');
  let progress = $state<string[]>([]);
  let researchResults = $state<ResearchResult[]>([]);
  let result = $state<RunResult>();
  let runDefinition = $state('');
  let editor = $state('');
  let checkedEditor = $state('');
  let controller: AbortController | undefined;
  let outputHeading = $state<HTMLHeadingElement>();
  let dirty = $derived(editor !== checkedEditor);
  let characterResult = $derived(
    !!result &&
      (record(result.input).kind === 'character' ||
        result.research.some((item) => item.grounding !== 'original-concept'))
  );
  let sourceReviewRequired = $derived(
    characterResult &&
      (dirty ||
        result?.fidelity?.status !== 'checked' ||
        result?.fidelity?.claims.some(
          (claim) => claim.status === 'contradicted' || claim.status === 'unresolved'
        ) ||
        record(result).sourceReviewRequired === true)
  );
  let exportKind = $derived(
    !editor
      ? 'result'
      : dirty || result?.status !== 'success'
        ? 'candidate'
        : sourceReviewRequired
          ? 'draft'
          : 'result'
  );
  let report = $derived(dirty ? undefined : result?.validation);
  let qualification = $derived(dirty ? undefined : result?.qualification);
  const findingLabels: Record<string, string> = {
    validity: 'Mechanic validity',
    'purchase-usefulness': 'Upgrade usefulness',
    'claim-effect': 'Claim and effect',
    'source-fidelity': 'Character source review',
    coverage: 'Mechanic coverage',
    balance: 'Balance'
  };
  const sourceClaimLabels: Record<string, string> = {
    supported: 'Supported by sources',
    adapted: 'Adapted for gameplay',
    contradicted: 'Contradicted by sources',
    unresolved: 'Needs evidence'
  };
  const sourceRelationshipLabels: Record<string, string> = {
    'same-ability': 'Same ability',
    'numerical-tuning': 'Numbers adapted for gameplay',
    'delivery-abstraction': 'Attack behavior adapted for gameplay',
    'game-rule': 'Gameplay rule',
    unsupported: 'Not supported by sources'
  };
  const checkStatusLabels: Record<string, string> = {
    passed: 'Passed',
    failed: 'Needs changes',
    'not-completed': 'Not completed',
    'not-provided': 'Not provided'
  };
  let content = $derived.by(() => {
    try {
      return JSON.parse(editor) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  });
  const pretty = (value: unknown) => JSON.stringify(value, null, 2);
  function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const records = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
      ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      : [];
  const effectSummary = (effect: Record<string, unknown>): string => {
    const duration =
      typeof effect.durationSeconds === 'number' ? ` for ${effect.durationSeconds}s` : '';
    if (effect.kind === 'stun') return `Stuns the target${duration}.`;
    if (effect.kind === 'slow')
      return `Reduces movement to ${Math.round(Number(effect.speedMultiplier) * 100)}%${duration}.`;
    if (effect.kind === 'damage-over-time')
      return `${effect.damage} damage every ${effect.intervalSeconds}s${duration}.`;
    if (effect.kind === 'damage-taken')
      return `Changes incoming damage by +${effect.additive} and ×${effect.multiplier}${duration}.`;
    if (effect.kind === 'property')
      return `Changes target properties${duration || ' permanently'}${strings(effect.addTags).length ? `; adds ${strings(effect.addTags).join(', ')}` : ''}${strings(effect.removeTags).length ? `; removes ${strings(effect.removeTags).join(', ')}` : ''}.`;
    return String(effect.kind ?? effect.id ?? 'Effect');
  };
  let unitPaths = $derived(
    records(content?.paths).length
      ? records(content?.paths)
      : records(record(content?.upgradeGraph).paths)
  );
  const message = (cause: unknown) =>
    cause instanceof Error ? cause.message : 'The request failed.';
  onMount(() => {
    const cancel = () => controller?.abort();
    const timer = window.setInterval(() => {
      if (busy || validating) elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    }, 1000);
    window.addEventListener('pagehide', cancel);
    return () => {
      cancel();
      window.clearInterval(timer);
      window.removeEventListener('pagehide', cancel);
    };
  });
  function requestInput(): unknown {
    if (customInput.trim()) return JSON.parse(customInput);
    if (!usesSubject) throw new Error('Enter a complete request as JSON.');
    const sources: unknown[] = sourceUrls
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (sourceText.trim())
      sources.push({
        id: 'pasted-source',
        title: 'Supplied source material',
        content: sourceText,
        origin: 'supplied',
        status: 'read',
        truncated: false,
        omissions: []
      });
    return {
      subject: subject.trim(),
      kind: original ? 'original' : 'character',
      ...(intent.trim() ? { intent: intent.trim() } : {}),
      ...(continuity.trim() ? { continuity: continuity.trim() } : {}),
      ...(sources.length ? { sources } : {}),
      ...(constraints.trim() ? { constraints: JSON.parse(constraints) } : {}),
      ...(context.trim() ? { context: JSON.parse(context) } : {}),
      ...(knowledge.trim() ? { knowledge: JSON.parse(knowledge) } : {})
    };
  }
  async function submit(operation: 'generate' | 'research') {
    if (busy || validating) return;
    error = '';
    try {
      if (!connectionAvailable) {
        setupOpen = true;
        throw new Error(
          'Connect a model to generate a unit, or choose Demo fixture to explore the editor.'
        );
      }
      if (provider === 'fixture' && !original && usesSubject && !customInput.trim()) {
        throw new Error(
          'Demo fixtures support original concepts only. Choose a configured generation mode for an existing character.'
        );
      }
      const input = requestInput();
      currentOperation = operation;
      startedAt = Date.now();
      elapsedSeconds = 0;
      busy = true;
      outputView = operation === 'research' ? 'research' : 'design';
      result = undefined;
      editor = '';
      checkedEditor = '';
      researchResults = [];
      progress = [];
      runDefinition = definition;
      controller = new AbortController();
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          operation,
          definition,
          ...(provider ? { provider } : { mode }),
          input,
          research: permitResearch,
          allowUngrounded
        })
      });
      if (!response.ok) {
        const detail = await response.json();
        throw new Error(detail.message ?? 'The server rejected the request.');
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let received = 0;
      let completed = false;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          received += next.value.byteLength;
          if (received > 64 * 1024 * 1024)
            throw new Error('The response exceeded the playground limit.');
          pending += decoder.decode(next.value, { stream: true });
          let newline: number;
          while ((newline = pending.indexOf('\n')) >= 0) {
            const event = JSON.parse(pending.slice(0, newline));
            pending = pending.slice(newline + 1);
            if (event.type === 'progress')
              progress = [...progress.slice(-31), `${event.stage}: ${event.message}`];
            if (event.type === 'research')
              researchResults = [
                ...researchResults.filter((r) => r.subject !== event.result.subject),
                event.result
              ];
            if (event.type === 'error') throw new Error(event.message);
            if (event.type === 'result') {
              completed = true;
              if (operation === 'research') researchResults = [event.result];
              else {
                result = event.result;
                researchResults = result!.research;
                editor = pretty(result!.output ?? result!.candidate) ?? '';
                checkedEditor = editor;
              }
              if (event.result.error) error = event.result.error.message;
            }
          }
        }
        if (!completed)
          throw new Error(
            'The connection ended before the final result. Received research remains available below.'
          );
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch (cause) {
      controller?.abort();
      error =
        cause instanceof DOMException && cause.name === 'AbortError'
          ? 'Cancelled. Research already received remains available below.'
          : message(cause);
    } finally {
      busy = false;
      controller = undefined;
      if ((result || researchResults.length) && window.matchMedia('(max-width: 720px)').matches) {
        await tick();
        outputHeading?.focus();
        outputHeading?.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }
  }
  async function validateEdit() {
    if (!result || busy || validating) return;
    error = '';
    validating = true;
    startedAt = Date.now();
    elapsedSeconds = 0;
    controller = new AbortController();
    const snapshot = editor;
    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          definition: runDefinition,
          reviewSources: characterResult && connectionAvailable && provider !== 'fixture',
          ...(provider ? { provider } : { mode }),
          candidate: JSON.parse(snapshot),
          original: result
        })
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.message ?? 'Validation failed.');
      result = next;
      checkedEditor = snapshot;
      if (next.sourceReviewError) error = next.sourceReviewError.message;
    } catch (cause) {
      error =
        cause instanceof DOMException && cause.name === 'AbortError'
          ? 'Check cancelled. Your edited draft is still available.'
          : message(cause);
    } finally {
      validating = false;
      controller = undefined;
    }
  }
  function download(value: unknown, filename: string) {
    const url = URL.createObjectURL(new Blob([pretty(value) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportResult() {
    if (!result) return;
    try {
      if (!dirty) {
        download(result, `unit-${exportKind}.json`);
        return;
      }
      const pendingReport: ValidationReport = {
        structure: { status: 'not-completed', checks: [], issues: [] },
        system: { status: 'not-completed', checks: [], issues: [] },
        constraints: { status: 'not-completed', checks: [], issues: [] },
        uncheckedRules: ['Edited content has not been validated.'],
        balance: { status: 'not-tested' }
      };
      download(
        {
          ...result,
          status: 'failed',
          output: undefined,
          candidate: JSON.parse(editor),
          validation: pendingReport,
          qualification: undefined,
          fidelity: undefined,
          fidelityAttempts: undefined,
          sourceReview: undefined,
          sourceReviewRequired: characterResult,
          sourceReviewError: undefined,
          error: {
            code: 'unvalidated-edit',
            stage: 'validation',
            message: 'Edited candidate requires validation.'
          },
          edited: true
        },
        'unit-candidate.json'
      );
    } catch (cause) {
      error = message(cause);
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key === 'Enter' &&
      form?.contains(event.target as Node)
    ) {
      event.preventDefault();
      if (!busy && !validating) form.requestSubmit();
    }
  }}
/>

<svelte:head>
  <title>Unit Lab | Mardwerk</title>
  <link rel="icon" type="image/png" href="/brand/mardwerk.png" />
  <meta
    name="description"
    content="Create game units from characters or original concepts, review their mechanics and sources, and export editable results."
  />
</svelte:head>

<header class="masthead">
  <a href="/" class="brand" aria-label="Mardwerk Unit Lab"
    ><img src="/brand/mardwerk.png" alt="" /><span>Mardwerk</span><span class="brand-divider"
      >/</span
    ><span class="product-name">Unit Lab</span></a
  >
  <ThemeToggle />
</header>
<main>
  <section class="compose-section" aria-label="Generation request">
    <div class="introduction">
      <h1>Unit Lab</h1>
      <p>Turn a character or an idea into a game unit.</p>
    </div>
    <form
      bind:this={form}
      onsubmit={(event) => {
        event.preventDefault();
        void submit('generate');
      }}
    >
      <Composer disabled={busy || validating} expanded={advancedOpen}>
        {#snippet children()}
          {#if usesSubject}
            <label class="mw-label" for="subject">Subject</label>
            <input
              id="subject"
              class="mw-control subject-input"
              bind:value={subject}
              maxlength="512"
              required={!customInput.trim()}
              autocomplete="off"
              placeholder={original ? 'e.g. Clockwork heron' : 'e.g. Monkey D. Luffy'}
            />
            <label for="intent" class="mw-label notes-label"
              >Adaptation notes <span>Optional</span></label
            >
            <textarea
              id="intent"
              class="mw-control notes-input"
              bind:value={intent}
              rows="2"
              maxlength="8000"
              placeholder="How should it play? Give it a strength, a weakness, or a role."
            ></textarea>
            {#if !original}
              <div class="character-source-prompt">
                <BookOpen size={16} aria-hidden="true" />
                <p>
                  Keep the adaptation tied to the character. Add source passages or allow research,
                  and specify the story period if it matters.
                </p>
                <button
                  type="button"
                  class="mw-button secondary"
                  aria-expanded={sourcesOpen}
                  aria-controls="character-sources"
                  onclick={() => (sourcesOpen = !sourcesOpen)}
                  >Sources {sourceText.trim() || sourceUrls.trim() || permitResearch
                    ? 'added'
                    : '& continuity'}</button
                >
              </div>
              {#if sourcesOpen}<div class="character-sources" id="character-sources">
                  {@render sourceFields()}
                </div>{/if}
            {/if}
          {:else}
            <label class="mw-label" for="custom-input">Complete request JSON</label>
            <textarea
              id="custom-input"
              class="mw-control code request-code"
              bind:value={customInput}
              rows="5"
              spellcheck="false"
              placeholder="Enter a request for this definition."
            ></textarea>
          {/if}
        {/snippet}
        {#snippet options()}
          <div class="definition-choice">
            <label class="sr-only" for="definition">Generation definition</label>
            <Select
              id="definition"
              bind:value={definition}
              disabled={busy || validating}
              options={data.definitions.map((item) => ({
                value: item.id,
                label: definitionLabels[item.id] ?? item.title
              }))}
              onchange={() => {
                customInput =
                  definition === 'merge-family-example'
                    ? pretty({ brief: 'A defensive unit family with three ranks' })
                    : '';
                advancedOpen = false;
                jsonOpen = false;
              }}
            />
          </div>
          <div class="model-choice">
            <label class="sr-only" for="mode">Generation quality</label>
            <Select
              id="mode"
              bind:value={mode}
              disabled={busy || validating}
              options={[
                ...data.modes.map((item) => ({
                  value: item.id,
                  label: `${item.label}${item.configured ? '' : ' · setup needed'}`
                })),
                { value: 'fixture', label: 'Demo fixture' },
                ...(provider && provider !== 'fixture'
                  ? [{ value: 'custom', label: 'Custom connection' }]
                  : [])
              ]}
              onchange={() => {
                provider = mode === 'fixture' ? 'fixture' : mode === 'custom' ? provider : '';
              }}
            />
          </div>
          {#if usesSubject}<div class="concept-choice">
              <label class="sr-only" for="concept-kind">Subject type</label>
              <Select
                id="concept-kind"
                bind:value={conceptKind}
                options={[
                  { value: 'original', label: 'Original concept' },
                  { value: 'character', label: 'Existing character' }
                ]}
                onchange={() => {
                  original = conceptKind === 'original';
                }}
              />
            </div>{/if}
        {/snippet}
        {#snippet footer()}
          <button
            type="button"
            class="mw-button settings-button"
            aria-expanded={advancedOpen}
            aria-controls="advanced-settings"
            onclick={() => (advancedOpen = !advancedOpen)}
            ><SlidersHorizontal size={16} strokeWidth={1.6} aria-hidden="true" />Advanced<span
              class="settings-dot"
              class:has-settings={permitResearch ||
                allowUngrounded ||
                !!sourceText.trim() ||
                !!sourceUrls.trim() ||
                !!knowledge.trim() ||
                !!constraints.trim() ||
                !!context.trim() ||
                !!continuity.trim() ||
                (usesSubject && !!customInput.trim())}
            ></span></button
          >
          <button
            type="submit"
            class="mw-button generate"
            data-variant="primary"
            disabled={busy || validating}
            >{busy
              ? currentOperation === 'research'
                ? 'Researching…'
                : 'Generating…'
              : 'Generate'}<ArrowUp size={17} strokeWidth={1.6} aria-hidden="true" /></button
          >
        {/snippet}
        {#snippet settings()}
          <div class="advanced-settings" id="advanced-settings">
            <div class="settings-heading">
              <h2>Generation settings</h2>
              <button
                type="button"
                class="mw-button icon-button"
                aria-label="Close settings"
                onclick={() => (advancedOpen = false)}
                ><X size={16} strokeWidth={1.6} aria-hidden="true" /></button
              >
            </div>
            {#if data.providers.length}<div class="custom-connection">
                <label class="mw-label" for="provider">Model connection override</label>
                <Select
                  id="provider"
                  bind:value={provider}
                  options={[
                    { value: '', label: 'Use selected generation mode' },
                    ...data.providers.map((item) => ({
                      value: item.id,
                      label: item.model ?? item.id
                    }))
                  ]}
                  onchange={() => {
                    mode = provider ? 'custom' : 'default';
                  }}
                />
                <p class="field-hint">
                  For a local command or a custom model. Default and Quality use the configured
                  shared endpoint.
                </p>
              </div>{/if}
            {#if usesSubject}
              {#if original}{@render sourceFields()}{/if}
              <div class="grounding-option">
                <Checkbox bind:checked={allowUngrounded}>Allow an ungrounded draft</Checkbox>
                <p class="field-hint">
                  Character source review still requires evidence before acceptance.
                </p>
              </div>
              <details bind:open={jsonOpen}>
                <summary
                  ><ChevronRight
                    class="disclosure-icon"
                    size={14}
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />JSON input</summary
                >
                <div class="json-fields">
                  <div>
                    <label class="mw-label" for="knowledge">Reusable research JSON</label><textarea
                      class="mw-control code"
                      id="knowledge"
                      bind:value={knowledge}
                      rows="3"
                      placeholder="Paste an exported research result."
                    ></textarea>
                  </div>
                  <div>
                    <label class="mw-label" for="constraints">Hard constraints JSON</label><textarea
                      class="mw-control code"
                      id="constraints"
                      bind:value={constraints}
                      rows="3"
                      placeholder={'{"noManualAbilities": true}'}
                    ></textarea>
                  </div>
                  <div>
                    <label class="mw-label" for="context">Game context JSON</label><textarea
                      class="mw-control code"
                      id="context"
                      bind:value={context}
                      rows="3"
                    ></textarea>
                  </div>
                  <div>
                    <label class="mw-label" for="custom-input">Complete request JSON</label
                    ><textarea
                      class="mw-control code"
                      id="custom-input"
                      bind:value={customInput}
                      rows="3"
                      placeholder="Replaces the subject and other request fields."
                    ></textarea>
                  </div>
                </div>
              </details>
              <button
                type="button"
                class="mw-button secondary"
                onclick={() => submit('research')}
                disabled={busy || validating || provider === 'fixture' || !connectionAvailable}
                ><BookOpen size={16} strokeWidth={1.6} aria-hidden="true" />Research only</button
              >
            {/if}
            <details>
              <summary
                ><ChevronRight
                  class="disclosure-icon"
                  size={14}
                  strokeWidth={1.6}
                  aria-hidden="true"
                />Selected input schema</summary
              >
              <pre>{pretty(data.definitions.find((d) => d.id === definition)?.inputSchema)}</pre>
            </details>
          </div>
        {/snippet}
      </Composer>
    </form>
    <div class="composer-caption">
      <p>
        {provider === 'fixture'
          ? 'Demo fixture returns a synthetic example.'
          : provider
            ? 'Using a custom model connection.'
            : `${selectedMode?.model ?? mode} · ${selectedMode?.reasoningEffort ?? ''} reasoning`}
      </p>
      {#if busy || validating}<button
          type="button"
          class="mw-button cancel-button"
          onclick={() => controller?.abort()}>Cancel</button
        >{:else}<span>⌘ / Ctrl + Enter</span>{/if}
    </div>
    <p class="definition-hint">
      {definitionHints[definition] ?? 'Custom definition. Review its input schema in Advanced.'}
    </p>
    {#if !connectionAvailable || data.setupError}
      <div class="setup-notice">
        <p>
          {data.setupError ||
            'Connect a model for creative generation. You can explore the editor with a synthetic demo now.'}
        </p>
        <div class="setup-actions">
          <button
            type="button"
            class="mw-button secondary"
            onclick={() => (setupOpen = !setupOpen)}
            aria-expanded={setupOpen}
            aria-controls="model-setup">Model setup</button
          >
          <button
            type="button"
            class="mw-button secondary"
            onclick={() => {
              mode = 'fixture';
              provider = 'fixture';
              original = true;
              conceptKind = 'original';
            }}>Try demo</button
          >
        </div>
        {#if setupOpen}<div id="model-setup">
            <p>
              Add your model endpoint and credentials to <code>.env</code> in the project root, then restart
              Unit Lab. Default uses Luna with high reasoning; Quality uses Astra with low reasoning.
              Model names can be changed to match your endpoint.
            </p>
            <pre>UNIT_OPENAI_ENDPOINT=https://your-provider.example/v1/chat/completions
UNIT_OPENAI_API_KEY=your-key
UNIT_DEFAULT_MODEL=gpt-5.6-luna
UNIT_QUALITY_MODEL=gpt-6-astra</pre>
            <p>
              For setup steps and local command connections, see <a
                href="https://github.com/mardwerk/unit-generator/blob/main/docs/getting-started.md"
                target="_blank"
                rel="noreferrer">getting started</a
              >.
            </p>
          </div>{/if}
      </div>
    {/if}
    {#if usesSubject && customInput.trim()}<p class="notice">
        Using the complete request from JSON input instead of the fields above.
      </p>
    {:else if usesSubject && !original && provider === 'fixture'}<p class="notice">
        Demo fixtures support original concepts only. Choose Default or Quality with a configured
        model for a character adaptation.
      </p>
    {:else if usesSubject && !original && !permitResearch && !knowledge.trim() && !sourceText.trim() && !sourceUrls.trim()}<p
        class="notice"
      >
        Add source material with Sources & continuity before generating, or allow source research
        there.
      </p>{/if}
    {#if !result && !busy && usesSubject && original && !customInput.trim()}
      <div class="suggestions">
        <span>Try an idea</span>{#each examples as example}<button
            class="mw-button"
            type="button"
            onclick={() => useExample(example)}
            title={example.intent}
            ><Plus size={13} strokeWidth={1.6} aria-hidden="true" />{example.name}</button
          >{/each}
      </div>
    {/if}
  </section>

  {#if result || busy || error || researchResults.length}
    <section class="results" aria-label="Current result">
      <div class="output-heading">
        <h2 bind:this={outputHeading} tabindex="-1">
          {result
            ? 'Unit output'
            : busy
              ? currentOperation === 'research'
                ? 'Researching character'
                : 'Generating unit'
              : 'Run output'}
        </h2>
        <span>Current session</span>
      </div>
      {#if error}<div class="error" role="alert">{error}</div>{/if}
      {#if (busy || progress.length) && !result}<div class="progress" aria-live="polite">
          {#if busy}<div class="busy-line">
              <span class="activity-dot"></span>
              <p>
                {progress.at(-1) ?? 'Connecting to the model…'}
                <span class="elapsed">{elapsedSeconds}s</span>
              </p>
            </div>{/if}
          {@render runLog()}
        </div>{/if}
      {#if result}
        <div class="result-shell">
          <div class="result-header">
            <div class="unit-name">
              <div class="unit-symbol"><Box size={23} strokeWidth={1.6} aria-hidden="true" /></div>
              <div>
                <h3>{typeof content?.name === 'string' ? content.name : 'Generation result'}</h3>
                <span
                  class="acceptance"
                  class:needs-attention={dirty || result.status !== 'success'}
                  data-testid="acceptance"
                  >{dirty
                    ? 'Unvalidated edit'
                    : result.status === 'success'
                      ? sourceReviewRequired
                        ? 'Valid draft · source review needed'
                        : 'Checks passed · review required'
                      : editor
                        ? 'Candidate needs changes'
                        : 'No unit produced'}</span
                >
              </div>
            </div>
            <button type="button" class="mw-button secondary export-button" onclick={exportResult}
              ><Download size={16} strokeWidth={1.6} aria-hidden="true" />Export {exportKind}</button
            >
          </div>
          <ViewSwitcher
            bind:value={outputView}
            items={[
              { value: 'design', label: 'Design', icon: Box },
              { value: 'json', label: 'JSON', icon: Code },
              { value: 'checks', label: 'Checks', icon: ShieldCheck },
              {
                value: 'research',
                label: 'Research',
                icon: BookOpen,
                count: researchResults.length
              }
            ]}
          />
          <div class="result-body">
            {#if outputView === 'design'}
              <p class="result-context">
                {definitionLabels[runDefinition] ?? runDefinition} · {result.metadata.calls.some(
                  (call) => call.mode === 'fixture'
                )
                  ? 'Synthetic demo'
                  : 'Generated draft'} · {Math.round(result.metadata.elapsedMs / 1000)}s
              </p>
              {#if !editor}<p class="notice">
                  No editable unit was produced. Review the error and captured research, then adjust
                  the request and generate again.
                </p>{/if}
              {#if typeof content?.summary === 'string'}<p class="unit-summary">
                  {content.summary}
                </p>{/if}
              {#if typeof content?.description === 'string'}<p class="unit-summary">
                  {content.description}
                </p>{/if}
              {#if typeof content?.brief === 'string'}<p class="unit-summary">
                  {content.brief}
                </p>{/if}
              {#if typeof content?.placementCost === 'number' || typeof content?.cost === 'number'}<p
                  class="unit-summary"
                >
                  Placement cost: {content.placementCost ?? content.cost} credits.
                </p>{/if}
              {#if content?.base}{@render modelMechanics(
                  record(content.base),
                  'Base mechanics'
                )}{:else if content?.resolution === 'captured-endpoints'}<p class="notice">
                  The captured base model is unresolved. Review the missing references in Checks
                  before using this candidate.
                </p>{/if}
              {#if content?.mechanics}{@render modelMechanics(
                  record(content.mechanics),
                  'Additional mechanics'
                )}{/if}
              {#if content?.heroProgression}{@render exactMechanic(
                  content.heroProgression,
                  'Hero progression and unlocks'
                )}{/if}
              {#if content?.fusionPolicy}{@render exactMechanic(
                  { policy: content.fusionPolicy, models: content.fusionModels },
                  'Fusion policy and resulting models'
                )}{/if}
              {#if content?.support}<h3 class="section-title">Support</h3>
                <p class="unit-summary">
                  {record(content.support).name}: restores {record(content.support).heal} health to up
                  to {record(content.support).cap} allies within {record(content.support).radius} range
                  every {record(content.support).interval}s.
                </p>{/if}
              {#if content?.stamina}<details class="mechanics-detail">
                  <summary
                    ><ChevronRight class="disclosure-icon" size={14} aria-hidden="true" />Stamina
                    and Technique costs</summary
                  >
                  <pre>{pretty(content.stamina)}</pre>
                </details>{/if}
              {#if records(content?.actions).length}<h3 class="section-title">Actions</h3>
                <div class="actions">
                  {#each records(content?.actions) as action}<article>
                      <h4>{action.name}</h4>
                      <p>{action.summary}</p>
                    </article>{/each}
                </div>{/if}
              {#if records(content?.units).length}<h3 class="section-title">Unit family</h3>
                <div class="actions">
                  {#each records(content?.units) as unit}<article>
                      <span class="rank">Rank {unit.rank}</span>
                      <h4>{unit.name ?? unit.id}</h4>
                      <p>{unit.role ?? ''}</p>
                    </article>{/each}
                </div>{/if}
              {#if records(content?.forms).length}<h3 class="section-title">Combat forms</h3>
                <div class="actions">
                  {#each records(content?.forms) as combatForm}<article>
                      {#if combatForm.id === content?.baseForm || typeof combatForm.unlockTier === 'number'}<span
                          class="rank"
                          >{combatForm.id === content?.baseForm
                            ? 'Base form'
                            : `Unlock tier ${combatForm.unlockTier}`}</span
                        >{/if}
                      <h4>{combatForm.name}</h4>
                      {#if typeof combatForm.summary === 'string'}<p>{combatForm.summary}</p>{/if}
                      {#if combatForm.primary}<p>
                          {record(combatForm.primary).name}: {record(combatForm.primary).damage} damage
                          every {record(combatForm.primary).period}s. Reach {record(
                            combatForm.primary
                          ).reach}.
                        </p>
                        <p>
                          {record(combatForm.primary).delivery === 'projectile'
                            ? 'Projectile attack'
                            : 'Direct contact'}{typeof combatForm.drainPerSecond === 'number' &&
                          combatForm.drainPerSecond > 0
                            ? ` · ${combatForm.drainPerSecond} stamina/s`
                            : ''}
                        </p>
                      {/if}
                      {#if records(record(combatForm.primary).onHit).length}<ul
                          class="mechanic-notes"
                        >
                          {#each records(record(combatForm.primary).onHit) as effect}<li>
                              {effectSummary(effect)}
                            </li>{/each}
                        </ul>{/if}
                      {#if records(combatForm.techniques).length}<details>
                          <summary
                            ><ChevronRight
                              class="disclosure-icon"
                              size={14}
                              aria-hidden="true"
                            />Techniques · {records(combatForm.techniques).length}</summary
                          >
                          {#each records(combatForm.techniques) as technique}<div class="technique">
                              <h5>{technique.name}</h5>
                              <p>
                                {technique.hits} hit(s) × {technique.damage} damage. Windup {technique.windup}s,
                                recovery {technique.recovery}s.
                              </p>
                            </div>{/each}
                          <pre>{pretty(combatForm.techniques)}</pre>
                        </details>{/if}
                    </article>{/each}
                </div>{/if}
              {#if unitPaths.length}<section class="upgrade-section" aria-label="Upgrade paths">
                  <h3 class="section-title">Upgrade paths</h3>
                  <div class="upgrade-paths">
                    {#each unitPaths as path, i}<article
                        class="upgrade-path"
                        style={`--path-color: ${['var(--mw-color-series-1)', 'var(--mw-color-series-2)', 'var(--mw-color-series-3)'][i % 3]}`}
                      >
                        <div class="path-heading">
                          <span class="path-dot"></span>
                          <h4>{path.name}</h4>
                        </div>
                        {#if path.summary || path.description}<p>
                            {path.summary ?? path.description}
                          </p>{/if}
                        <ol>
                          {#each records(path.upgrades).length ? records(path.upgrades) : records(record(content?.upgradeGraph).nodes).filter((node) => node.path === path.id) as node, tier}<li
                            >
                              <details>
                                <summary
                                  ><ChevronRight
                                    class="disclosure-icon"
                                    size={14}
                                    strokeWidth={1.6}
                                    aria-hidden="true"
                                  /><span class="tier">{tier + 1}</span><span
                                    >{node.name}<small
                                      >{node.costCredits ?? node.cost} credits</small
                                    ></span
                                  ><Plus class="expand-icon" size={14} aria-hidden="true" /><Minus
                                    class="collapse-icon"
                                    size={14}
                                    aria-hidden="true"
                                  /></summary
                                >
                                <p>
                                  {node.summary ??
                                    node.description ??
                                    'Inspect the complete effect in JSON.'}
                                </p>
                                {#if node.operations || node.modifiers || node.effects}<pre
                                    class="upgrade-mechanics">{pretty(
                                      node.operations ?? node.modifiers ?? node.effects
                                    )}</pre>{/if}
                              </details>
                            </li>{/each}
                        </ol>
                      </article>{/each}
                  </div>
                </section>{/if}
              {#if records(content?.endpoints).length}<section class="captured-builds">
                  <h3 class="section-title">Captured builds</h3>
                  <p class="field-hint">
                    Each build contains the mechanics available for its captured upgrade
                    combination.
                  </p>
                  {#each records(content?.endpoints) as endpoint}<details>
                      <summary
                        ><ChevronRight class="disclosure-icon" size={14} aria-hidden="true" />Build {Array.isArray(
                          endpoint.tiers
                        )
                          ? endpoint.tiers.join(' / ')
                          : 'unknown'}{!endpoint.model ? ' · unresolved' : ''}</summary
                      >{#if endpoint.model}{@render modelMechanics(
                          record(endpoint.model),
                          'Build mechanics'
                        )}{:else}<p class="notice">
                          This captured build has unresolved references. It cannot be treated as an
                          accepted playable unit.
                        </p>{/if}{#if strings(endpoint.unsupported).length}<ul
                          class="mechanic-notes"
                        >
                          {#each strings(endpoint.unsupported) as gap}<li>{gap}</li>{/each}
                        </ul>{/if}
                    </details>{/each}
                </section>{/if}
              {#if strings(content?.adaptations).length}<section class="adaptation-review">
                  <h3 class="section-title">Adaptation choices</h3>
                  <ul>
                    {#each strings(content?.adaptations) as adaptation}<li>{adaptation}</li>{/each}
                  </ul>
                  <p>
                    These are the generated design's own explanations. Compare them with the
                    captured sources in Research.
                  </p>
                </section>{/if}
              {#if strings(content?.unsupported).length}<section class="adaptation-review">
                  <h3 class="section-title">Declared mechanic gaps</h3>
                  <ul>
                    {#each strings(content?.unsupported) as gap}<li>{gap}</li>{/each}
                  </ul>
                </section>{/if}
              {#if result.design}<details>
                  <summary
                    ><ChevronRight class="disclosure-icon" size={14} aria-hidden="true" />{record(
                      result
                    ).edited
                      ? 'Original design plan'
                      : 'Design plan and adaptation rationale'}</summary
                  >
                  <pre>{pretty(result.design)}</pre>
                </details>{/if}
              {#if !content && editor}<p class="notice">
                  The edited JSON cannot be displayed. Open JSON to correct it.
                </p>{/if}
            {:else if outputView === 'json'}
              <div class="editor-heading">
                <div>
                  <h3>Content JSON</h3>
                  <p>
                    {characterResult
                      ? 'Check rules and source fidelity using retained evidence. The edited unit stays exactly as written.'
                      : 'Edit the unit, then check its mechanics.'}
                  </p>
                  {#if characterResult}<p>
                      {connectionAvailable && provider !== 'fixture'
                        ? `Source review uses ${provider || selectedMode?.label || 'the selected model'} and may incur model charges.`
                        : 'Connect a model for source review. You can still check rules and export a draft.'}
                    </p>{/if}
                </div>
                <button
                  type="button"
                  class="mw-button secondary"
                  onclick={validateEdit}
                  disabled={busy || validating}
                  ><Check size={16} strokeWidth={1.6} aria-hidden="true" />{validating
                    ? 'Checking…'
                    : 'Check changes'}</button
                >
              </div>
              {#if validating}<button
                  type="button"
                  class="mw-button secondary"
                  onclick={() => controller?.abort()}>Cancel check</button
                >
                <p class="field-hint" role="status">
                  Checking rules{characterResult && connectionAvailable && provider !== 'fixture'
                    ? ' and retained source evidence'
                    : ''} · {elapsedSeconds}s
                </p>{/if}
              <label class="sr-only" for="editor">Content JSON</label><textarea
                class="mw-control code editor"
                id="editor"
                bind:value={editor}
                rows="22"
                spellcheck="false"
              ></textarea>
            {:else if outputView === 'checks'}
              <h3 class="validation-title">Validation and review</h3>
              <p class="field-hint">
                Passing checks establish the implemented rules only. Review character fidelity and
                playtest the unit before using it in a game.
              </p>
              {#if report}<dl class="validation-list">
                  <div>
                    <dt>Unit format</dt>
                    <dd
                      class:check-failed={report.structure.status === 'failed'}
                      class:unchecked={report.structure.status !== 'passed' &&
                        report.structure.status !== 'failed'}
                    >
                      {checkStatusLabels[report.structure.status] ?? report.structure.status}
                    </dd>
                  </div>
                  <div>
                    <dt>Game rules</dt>
                    <dd
                      class:check-failed={report.system.status === 'failed'}
                      class:unchecked={report.system.status !== 'passed' &&
                        report.system.status !== 'failed'}
                    >
                      {checkStatusLabels[report.system.status] ?? report.system.status}
                    </dd>
                  </div>
                  <div>
                    <dt>Request constraints</dt>
                    <dd
                      class:check-failed={report.constraints.status === 'failed'}
                      class:unchecked={report.constraints.status !== 'passed' &&
                        report.constraints.status !== 'failed'}
                    >
                      {report.constraints.status === 'not-provided'
                        ? 'No extra constraints'
                        : (checkStatusLabels[report.constraints.status] ??
                          report.constraints.status)}
                    </dd>
                  </div>
                  <div>
                    <dt>Gameplay balance</dt>
                    <dd class="unchecked">Not tested</dd>
                  </div>
                </dl>
                {#each [report.structure, report.system, report.constraints].flatMap((r) => r.issues) as issue}<p
                    class="error"
                  >
                    {issue.path}: {issue.message}
                  </p>{/each}
                {#if report.uncheckedRules.length}<div class="adaptation-review">
                    <h4>Unchecked rules</h4>
                    <ul>
                      {#each report.uncheckedRules as rule}<li>{rule}</li>{/each}
                    </ul>
                  </div>{/if}
                <details>
                  <summary
                    ><ChevronRight
                      class="disclosure-icon"
                      size={14}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />Complete validation report</summary
                  >
                  <pre>{pretty(report)}</pre>
                </details>
              {:else}<p class="notice">
                  Edited content needs validation. Open JSON and select Check changes.
                </p>{/if}
              {#if qualification}
                <section class="qualification" aria-label="Gameplay checks">
                  <h3 class="validation-title">
                    {qualification.readiness === 'blocked'
                      ? 'Mechanic changes required'
                      : 'Review required'}
                  </h3>
                  <p class="field-hint">
                    {#if qualification.coverage.legalBuilds > 0}
                      {qualification.coverage.evaluatedBuilds} of {qualification.coverage
                        .legalBuilds} upgrade combinations checked · {qualification.coverage
                        .purchaseEdges} upgrade comparisons · {qualification.coverage.probes} mechanic
                      checks
                    {:else}
                      No upgrade combinations were evaluated. See the limits below.
                    {/if}
                  </p>
                  {#each qualification.findings
                    .filter((finding) => finding.severity !== 'info')
                    .sort((a, b) => Number(b.severity === 'blocker') - Number(a.severity === 'blocker')) as finding}<article
                      class="finding"
                      class:blocker={finding.severity === 'blocker'}
                    >
                      <div class="finding-heading">
                        <h4>{findingLabels[finding.dimension] ?? finding.dimension}</h4>
                        <span
                          >{finding.severity === 'blocker'
                            ? 'Needs changes'
                            : finding.severity === 'warning'
                              ? 'Needs review'
                              : 'Information'}</span
                        >
                      </div>
                      <p>{finding.message}</p>
                      {#if finding.location}<code>{finding.location}</code
                        >{/if}{#if finding.evidence}<details>
                          <summary>Check evidence</summary>
                          <pre>{pretty(finding.evidence)}</pre>
                        </details>{/if}
                    </article>{/each}
                  {#if qualification.findings.some((finding) => finding.severity === 'info')}<details
                    >
                      <summary
                        ><ChevronRight
                          class="disclosure-icon"
                          size={14}
                          aria-hidden="true"
                        />Detailed check results</summary
                      >
                      <pre>{pretty(
                          qualification.findings.filter((finding) => finding.severity === 'info')
                        )}</pre>
                    </details>{/if}
                  {#if qualification.coverage.unassessed.length}<div class="adaptation-review">
                      <h4>Not checked</h4>
                      <ul>
                        {#each qualification.coverage.unassessed as gap}<li>{gap}</li>{/each}
                      </ul>
                    </div>{/if}
                </section>
              {/if}
              {#if progress.length}<div class="progress completed-log">{@render runLog()}</div>{/if}
            {:else}{@render researchContent()}{/if}
          </div>
        </div>
      {:else if researchResults.length}<div class="research-shell">
          {@render researchContent()}
        </div>{/if}
    </section>
  {/if}
  <footer class="page-footer">
    <span>Your session stays in this tab.</span><span>Export a result before refreshing.</span>
  </footer>
</main>

{#snippet exactMechanic(value: unknown, title: string)}
  <details class="mechanics-detail">
    <summary><ChevronRight class="disclosure-icon" size={14} aria-hidden="true" />{title}</summary>
    <pre>{pretty(value)}</pre>
  </details>
{/snippet}

{#snippet modelMechanics(model: Record<string, unknown>, title: string)}
  {#if records(model.attacks).length || records(model.abilities).length || records(model.actors).length || records(model.income).length || records(model.support ?? model.rangeSupport).length || records(model.triggers).length || records(model.zones).length || records(model.modifiers).length}
    <section class="model-mechanics" aria-label={title}>
      <h3 class="section-title">{title}</h3>
      {#if records(model.attacks).length}<div class="mechanic-group">
          <h4 class="section-title">Attacks</h4>
          <div class="actions">
            {#each records(model.attacks) as attack}<article>
                {@render attackMechanics(attack)}
              </article>{/each}
          </div>
        </div>{/if}
      {#if records(model.abilities).length}<div class="mechanic-group">
          <h4 class="section-title">Activated abilities</h4>
          <div class="actions">
            {#each records(model.abilities) as ability}<article>
                <h4>{ability.name ?? ability.id}</h4>
                <p>
                  Cooldown {ability.cooldownSeconds}s{typeof ability.durationSeconds === 'number'
                    ? ` · active for ${ability.durationSeconds}s`
                    : ''}.
                </p>
                {#if record(ability.effect).kind === 'summon'}<p>
                    Summons {record(ability.effect).actorId}{record(ability.effect)
                      .suppressParentAttacks
                      ? ' and pauses the parent unit’s attacks'
                      : ''}.
                  </p>{:else if record(ability.effect).kind === 'transform'}<p>
                    Temporarily replaces the unit's attacks.
                  </p>{:else}<p>
                    Releases {records(record(ability.effect).attacks).length} attack pattern(s).
                  </p>{/if}
                <details>
                  <summary
                    ><ChevronRight class="disclosure-icon" size={14} aria-hidden="true" />Ability
                    mechanics</summary
                  >{#each records(record(ability.effect).attacks) as attack}<div
                      class="nested-mechanic"
                    >
                      {@render attackMechanics(attack)}
                    </div>{/each}
                  <pre>{pretty(ability)}</pre>
                </details>
              </article>{/each}
          </div>
        </div>{/if}
      {#if records(model.actors).length}<div class="mechanic-group">
          <h4 class="section-title">Summoned units</h4>
          <div class="actions">
            {#each records(model.actors) as actor}<article>
                <h4>{actor.id}</h4>
                <p>{records(actor.attacks).length} attack pattern(s).</p>
                {#if actor.motion}<p>Movement: {record(actor.motion).kind}.</p>
                  {@render exactMechanic(actor.motion, 'Movement rules')}{/if}
                {#each records(model.passiveSummons).filter((summon) => summon.actorId === actor.id) as summon}<p
                  >
                    Appears after {summon.startDelaySeconds}s{Number(summon.lifetimeSeconds) > 0
                      ? ` for ${summon.lifetimeSeconds}s`
                      : ''}.
                  </p>{/each}
                <details>
                  <summary
                    ><ChevronRight class="disclosure-icon" size={14} aria-hidden="true" />Summon
                    attacks</summary
                  >{#each records(actor.attacks) as attack}<div class="nested-mechanic">
                      {@render attackMechanics(attack)}
                    </div>{/each}
                </details>
              </article>{/each}
          </div>
        </div>{/if}
      {#if records(model.income).length}<div class="mechanic-group">
          <h4 class="section-title">Income</h4>
          <div class="actions">
            {#each records(model.income) as income}<article>
                <h4>{income.id}</h4>
                <p>
                  {income.amount} credits every {income.intervalSeconds}s, up to {income.emissionsPerRound}
                  time(s) each round.
                </p>
                <p>
                  {income.autoCollect
                    ? 'Collected automatically.'
                    : `Collect pickups within ${income.pickupLifetimeSeconds}s.`}
                </p>
              </article>{/each}
          </div>
        </div>{/if}
      {#if records(model.support ?? model.rangeSupport).length}<div class="mechanic-group">
          <h4 class="section-title">Range support</h4>
          <div class="actions">
            {#each records(model.support ?? model.rangeSupport) as support}<article>
                <h4>{support.id}</h4>
                <p>
                  {support.global
                    ? 'Global range'
                    : `Within ${support.radius} range`}{support.includesOwner
                    ? ', including this unit'
                    : ', other units only'}. Adds {support.rangeAdditive} range and {Math.round(
                    Number(support.rangeMultiplier) * 100
                  )}%.
                </p>
                <p>Does not stack within group {support.stackGroup}.</p>
              </article>{/each}
          </div>
        </div>{/if}
      {#if records(model.triggers).length}{@render exactMechanic(
          model.triggers,
          `Event triggers · ${records(model.triggers).length}`
        )}{/if}
      {#if records(model.zones).length}{@render exactMechanic(
          model.zones,
          `Persistent zones · ${records(model.zones).length}`
        )}{/if}
      {#if records(model.modifiers).length}{@render exactMechanic(
          model.modifiers,
          `Stat modifiers · ${records(model.modifiers).length}`
        )}{/if}
    </section>
  {/if}
{/snippet}

{#snippet attackMechanics(attack: Record<string, unknown>)}
  <h4>{attack.name ?? attack.id}</h4>
  <p>
    {attack.damage} damage every {attack.intervalSeconds ?? attack.period}s. {attack.projectiles ??
      1} projectile(s){typeof attack.pierce === 'number' ? `, ${attack.pierce} pierce` : ''}.
  </p>
  <p>
    {attack.delivery === 'direct-contact'
      ? 'Direct contact'
      : (attack.delivery ?? 'Attack')}{typeof attack.range === 'number'
      ? ` · range ${attack.range}`
      : typeof record(attack.reach).radius === 'number'
        ? ` · range ${record(attack.reach).radius}`
        : ''} · {attack.detectsCamo || attack.detectConcealed
      ? 'Detects concealed targets'
      : 'Cannot detect concealed targets'}
  </p>
  {#if strings(attack.immuneTo).length}<p>
      Cannot damage {strings(attack.immuneTo).join(', ')} targets.
    </p>{/if}
  {#if record(attack.shape).kind === 'area'}<p>
      Area impact: radius {record(attack.shape).radius}, up to {record(attack.shape).cap} targets.
    </p>{:else if record(attack.shape).kind === 'sweep'}<p>
      Sweep: width {record(attack.shape).width}, up to {record(attack.shape).cap} targets.
    </p>{/if}
  {#if [...records(attack.statuses), ...records(attack.onHit)].length}<ul class="mechanic-notes">
      {#each [...records(attack.statuses), ...records(attack.onHit)] as effect}<li>
          {effectSummary(effect)}
        </li>{/each}
    </ul>{/if}
  {#if attack.projectile}<p>
      Projectile behavior: {record(record(attack.projectile).flight).kind ?? 'unspecified'}{records(
        record(attack.projectile).children
      ).length
        ? `, ${records(record(attack.projectile).children).length} follow-up pattern(s)`
        : ''}.
    </p>{/if}
  <details>
    <summary
      ><ChevronRight class="disclosure-icon" size={14} aria-hidden="true" />Exact attack rules</summary
    >
    <pre>{pretty(attack)}</pre>
  </details>
{/snippet}

{#snippet sourceFields()}
  <div class="source-settings">
    <div>
      <label class="mw-label" for="continuity">Continuity or story period</label><input
        class="mw-control"
        id="continuity"
        bind:value={continuity}
        maxlength="8000"
        placeholder="e.g. Before the time skip"
      />
    </div>
    <div class="research-options">
      <Checkbox bind:checked={permitResearch}>Allow web research and source page reads</Checkbox>
    </div>
    <div>
      <label class="mw-label" for="sources">Source material</label><textarea
        class="mw-control"
        id="sources"
        bind:value={sourceText}
        rows="4"
        maxlength="262144"
        placeholder="Paste character details or source passages."
      ></textarea>
    </div>
    <div>
      <label class="mw-label" for="urls">Source URLs, one per line</label><textarea
        class="mw-control"
        id="urls"
        bind:value={sourceUrls}
        rows="4"
        placeholder="https://…"
      ></textarea>
    </div>
  </div>
{/snippet}

{#snippet runLog()}
  <details>
    <summary
      ><ChevronRight class="disclosure-icon" size={14} strokeWidth={1.6} aria-hidden="true" />{busy
        ? 'Run steps'
        : 'Run progress'}</summary
    >
    <ol>
      {#each progress as step}<li>{step}</li>{/each}
    </ol>
  </details>
{/snippet}

{#snippet researchContent()}
  {#if sourceReviewRequired}<p class="notice">
      Edited content needs a new source review. Open JSON and select Check changes with a configured
      model. Until then, export it as a draft.
    </p>
  {/if}
  {#if !dirty && result?.fidelity}<section
      class="fidelity-review"
      aria-label="Source fidelity review"
    >
      <h3>
        {result.fidelity.status === 'checked'
          ? 'Source review completed'
          : result.fidelity.status === 'original-concept'
            ? 'Original concept'
            : 'More source evidence needed'}
      </h3>
      <p class="field-hint">
        {result.fidelity.status === 'original-concept'
          ? 'This unit is an original concept. No external character claims were checked.'
          : 'This model review compares the draft with captured passages. It is not independent canon verification.'}
      </p>
      {#if result.fidelity.claims.some((claim) => claim.status === 'adapted')}
        <p class="field-hint">
          Gameplay adaptations change how a sourced ability works in the game. Review the
          explanation and source passage for each change.
        </p>
      {/if}
      {#each result.fidelity.claims as claim}<details
          class="finding fidelity-claim"
          open={claim.status === 'contradicted' || claim.status === 'unresolved'}
          class:blocker={claim.status === 'contradicted' || claim.status === 'unresolved'}
        >
          <summary class="finding-heading"
            ><ChevronRight class="disclosure-icon" size={14} aria-hidden="true" /><span
              class="claim-title">{claim.claim}</span
            ><span>{sourceClaimLabels[claim.status] ?? claim.status}</span></summary
          >
          <p>{claim.explanation}</p>
          {#if claim.sourceMechanic}<p class="field-hint">
              Source ability: {claim.sourceMechanic} · {sourceRelationshipLabels[
                claim.relationship
              ] ?? claim.relationship}
            </p>{/if}
          {#if claim.candidateQuote}<p class="candidate-quote">
              In the draft: {claim.candidateQuote}
            </p>{/if}
          <code>{claim.path}</code>{#if claim.quote}<blockquote>{claim.quote}</blockquote>
            <p class="field-hint">
              {researchResults
                .flatMap((item) => item.sources)
                .find((source) => source.id === claim.sourceId)?.title ?? claim.sourceId}
            </p>{/if}
        </details>{/each}{#if result.fidelity.gaps.length}<ul>
          {#each result.fidelity.gaps as gap}<li>{gap}</li>{/each}
        </ul>{/if}
    </section>{/if}
  {#if !researchResults.length}<p class="notice">This run has no captured research.</p>{/if}
  {#each researchResults as research, i}<article class="research-item">
      <div class="research-heading">
        <h3>{research.subject}</h3>
        <span class="grounding"
          >{research.grounding === 'grounded'
            ? 'Sources captured · review fidelity'
            : research.grounding === 'original-concept'
              ? 'Original concept'
              : 'Ungrounded'}</span
        >
      </div>
      <p>{research.knowledge?.identity.continuity ?? 'Continuity unresolved'}</p>
      {#if research.knowledge}<p>{research.knowledge.identity.explanation}</p>{/if}
      {#if research.error}<p class="notice">{research.error.message}</p>{/if}
      {#if research.knowledge}<ul>
          {#each research.knowledge.claims as claim}<li>
              {claim.text}<small class="claim-evidence"
                >{claim.kind === 'evidence'
                  ? 'Source reference'
                  : claim.kind === 'original-concept'
                    ? 'Original concept'
                    : 'Unverified claim'}{claim.sourceIds.length
                  ? `: ${claim.sourceIds.map((id) => research.sources.find((source) => source.id === id)?.title ?? id).join(', ')}`
                  : ''}</small
              >
            </li>{/each}
        </ul>{/if}
      {#if research.gaps.length}<h4>Coverage gaps</h4>
        <ul>
          {#each research.gaps as gap}<li>{gap}</li>{/each}
        </ul>{/if}
      {#each research.sources as source}<details>
          <summary
            ><ChevronRight
              class="disclosure-icon"
              size={14}
              strokeWidth={1.6}
              aria-hidden="true"
            />{source.title}<span class="source-status"
              >{source.status}{source.truncated ? ', incomplete' : ''}</span
            ></summary
          >
          <p>{source.url ?? 'Supplied document'}</p>
          {#if source.error}<p>{source.error}</p>{/if}
          {#each research.sourceVisibility?.filter((item) => item.sourceId === source.id) ?? [] as visibility}<p
            >
              The research model received {visibility.visibleCharacters.toLocaleString()} of {visibility.sourceCharacters.toLocaleString()}
              captured characters{visibility.complete
                ? '.'
                : '. Some captured text was outside the model context.'}
            </p>{/each}
          {#each source.omissions as omission}<p>{omission}</p>{/each}
          <pre>{source.content}</pre>
        </details>{/each}
      <button
        type="button"
        class="mw-button secondary"
        onclick={() => download(research, `research-${i + 1}.json`)}
        ><Download size={16} strokeWidth={1.6} aria-hidden="true" />Export research</button
      >
    </article>{/each}
{/snippet}

<style>
  @font-face {
    font-family: Geist;
    src: url('/fonts/geist-regular.ttf') format('truetype');
    font-weight: 400;
    font-display: swap;
  }
  @font-face {
    font-family: Geist;
    src: url('/fonts/geist-medium.ttf') format('truetype');
    font-weight: 500;
    font-display: swap;
  }
  @font-face {
    font-family: Geist;
    src: url('/fonts/geist-semibold.ttf') format('truetype');
    font-weight: 600 800;
    font-display: swap;
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    font-family:
      Geist,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    color: var(--mw-color-text);
    background: var(--mw-color-canvas);
    font-size: 14px;
    -webkit-font-smoothing: antialiased;
  }
  :global(button),
  :global(input),
  :global(textarea) {
    font: inherit;
  }
  :global(:focus-visible) {
    outline: 2px solid var(--mw-color-focus);
    outline-offset: 3px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .masthead {
    width: min(1080px, calc(100% - 64px));
    height: 80px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 13px;
    text-decoration: none;
    font-weight: 500;
    color: var(--mw-color-text);
  }
  .brand img {
    width: 25px;
    height: 32px;
    object-fit: contain;
    margin-right: 2px;
  }
  .brand-divider {
    margin: 0 4px;
    color: var(--mw-color-border);
    font-weight: 400;
  }
  .product-name {
    color: var(--mw-color-text-muted);
    font-weight: 400;
  }
  main {
    padding: 54px 24px 30px;
  }
  .compose-section {
    max-width: 740px;
    margin: 0 auto;
  }
  .introduction {
    margin-bottom: 27px;
  }
  h1 {
    font-size: 28px;
    line-height: 1.25;
    font-weight: 500;
    letter-spacing: -0.04em;
    margin: 0 0 10px;
  }
  .introduction p {
    color: var(--mw-color-text-muted);
    font-size: 14px;
    margin: 0;
    line-height: 1.6;
  }
  form {
    margin: 0;
  }
  .subject-input {
    font-size: 22px;
    letter-spacing: -0.035em;
    padding: 11px 13px;
    border: 1px solid var(--mw-color-border-strong);
    border-radius: 8px;
    background: var(--mw-color-inset);
    line-height: 1.5;
  }
  .notes-label {
    margin-top: 23px;
    margin-bottom: 5px;
  }
  .notes-input {
    padding: 11px 13px;
    border: 1px solid var(--mw-color-border-strong);
    border-radius: 8px;
    background: var(--mw-color-inset);
    resize: vertical;
    field-sizing: content;
    max-height: 240px;
    font-size: 14px;
    line-height: 1.75;
    min-height: 53px;
  }
  .definition-choice {
    width: 175px;
  }
  .model-choice {
    width: 165px;
  }
  .settings-button {
    border-color: transparent;
    background: transparent;
    font-weight: 400;
    padding-left: 7px;
  }
  .settings-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: transparent;
  }
  .settings-dot.has-settings {
    background: var(--mw-color-warning);
  }
  .generate {
    min-width: 114px;
    padding: 8px 12px 8px 15px;
    justify-content: space-between;
    font-size: 12px;
  }
  .composer-caption {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: center;
    margin: 13px 4px 0;
    color: var(--mw-color-text-subtle);
    font-size: 11px;
  }
  .composer-caption p {
    margin: 0;
    line-height: 1.5;
  }
  .composer-caption > span {
    white-space: nowrap;
    color: var(--mw-color-text-subtle);
    font-size: 10px;
  }
  .cancel-button {
    min-height: 28px;
    padding: 3px 8px;
    color: var(--mw-color-error);
  }
  .suggestions {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    margin: 27px 0 0;
  }
  .suggestions > span {
    font-size: 11px;
    color: var(--mw-color-text-subtle);
    margin-right: 4px;
  }
  .suggestions button {
    background: transparent;
    border-color: var(--mw-color-border);
    color: var(--mw-color-text-muted);
    font-size: 11px;
    min-height: 30px;
    border-radius: 6px;
    padding: 5px 8px;
    font-weight: 400;
  }
  .suggestions button:hover {
    color: var(--mw-color-text);
    background: var(--mw-color-surface);
    border-color: var(--mw-color-border);
  }
  .advanced-settings {
    padding: 23px 26px;
    border-top: 1px solid var(--mw-color-border-subtle);
  }
  .settings-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 22px;
  }
  .settings-heading h2 {
    font-size: 14px;
    font-weight: 500;
    margin: 0;
  }
  .icon-button {
    width: 28px;
    height: 28px;
    min-height: 28px;
    padding: 5px;
    border-color: transparent;
    color: var(--mw-color-text-muted);
  }
  .source-settings,
  .json-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .research-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .json-fields {
    margin-top: 18px;
  }
  .advanced-settings .secondary {
    margin-top: 18px;
  }
  details {
    margin: 20px 0 0;
    border-top: 1px solid var(--mw-color-border-subtle);
    padding-top: 16px;
  }
  summary {
    list-style: none;
    display: flex;
    gap: 9px;
    align-items: center;
    font-size: 12px;
    line-height: 1.5;
    font-weight: 500;
    cursor: pointer;
    color: var(--mw-color-text-muted);
    min-height: 25px;
  }
  summary :global(.disclosure-icon) {
    flex-shrink: 0;
  }
  details[open] > summary :global(.disclosure-icon) {
    transform: rotate(90deg);
  }
  .upgrade-path summary :global(.disclosure-icon) {
    display: none;
  }
  .upgrade-path summary :global(.expand-icon),
  .upgrade-path summary :global(.collapse-icon) {
    margin-left: auto;
    flex-shrink: 0;
  }
  .upgrade-path summary :global(.collapse-icon) {
    display: none;
  }
  .upgrade-path details[open] summary :global(.expand-icon) {
    display: none;
  }
  .upgrade-path details[open] summary :global(.collapse-icon) {
    display: block;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  pre,
  .code {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
    font-size: 12px;
    line-height: 1.65;
  }
  pre {
    max-height: 430px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    padding: 16px;
    border-radius: 8px;
    background: var(--mw-color-inset);
    color: var(--mw-color-text-muted);
  }
  .request-code {
    background: var(--mw-color-surface-muted);
  }
  .notice {
    font-size: 12px;
    color: var(--mw-color-warning);
    background: var(--mw-color-warning-bg);
    border: 1px solid var(--mw-color-warning-border);
    border-radius: 7px;
    padding: 12px 14px;
    line-height: 1.6;
  }
  .results {
    width: min(1040px, 100%);
    margin: 64px auto 0;
  }
  .output-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 2px 15px;
    gap: 20px;
  }
  .output-heading h2 {
    font-size: 13px;
    font-weight: 500;
    color: var(--mw-color-text-muted);
    margin: 0;
    scroll-margin-top: 20px;
  }
  .output-heading > span {
    font-size: 11px;
    color: var(--mw-color-text-subtle);
  }
  .error {
    background: var(--mw-color-error-bg);
    border: 1px solid var(--mw-color-error-border);
    color: var(--mw-color-error);
    padding: 15px 18px;
    border-radius: 9px;
    line-height: 1.6;
    font-size: 13px;
    margin-bottom: 18px;
    overflow-wrap: anywhere;
  }
  .progress {
    margin-bottom: 18px;
    padding: 0 2px;
  }
  .completed-log {
    margin-top: 26px;
  }
  .progress details {
    margin: 0;
    padding: 0;
    border: 0;
  }
  .progress summary {
    font-size: 11px;
    font-weight: 400;
    color: var(--mw-color-text-subtle);
  }
  .progress li {
    font-size: 12px;
    line-height: 1.7;
    color: var(--mw-color-text-muted);
    overflow-wrap: anywhere;
  }
  .busy-line {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 10px;
  }
  .busy-line p {
    font-size: 12px;
    line-height: 1.6;
    color: var(--mw-color-text-muted);
  }
  .activity-dot {
    width: 6px;
    height: 6px;
    flex-shrink: 0;
    background: var(--mw-color-warning);
    border-radius: 50%;
    box-shadow: 0 0 0 4px var(--mw-color-warning-bg);
  }
  .result-shell,
  .research-shell {
    background: var(--mw-color-surface);
    border: 1px solid var(--mw-color-border);
    border-radius: 14px;
    box-shadow: var(--mw-shadow-control);
    min-width: 0;
  }
  .research-shell {
    padding: 28px;
  }
  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 26px 28px 22px;
  }
  .unit-name {
    display: flex;
    align-items: center;
    gap: 13px;
    min-width: 0;
  }
  .unit-symbol {
    width: 43px;
    height: 43px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--mw-color-warning-border);
    background: var(--mw-color-warning-bg);
    border-radius: 11px;
    color: var(--mw-color-warning);
  }
  .unit-name h3 {
    font-size: 20px;
    font-weight: 500;
    letter-spacing: -0.03em;
    margin: 0 0 5px;
    overflow-wrap: anywhere;
  }
  .acceptance {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--mw-color-success);
  }
  .acceptance::before {
    content: '';
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
  }
  .acceptance.needs-attention {
    color: var(--mw-color-warning);
  }
  .export-button {
    flex-shrink: 0;
  }
  .result-body {
    padding: 27px 28px 30px;
    min-height: 240px;
  }
  .unit-summary {
    margin: 0 0 28px;
    max-width: 78ch;
    color: var(--mw-color-text-muted);
    font-size: 13px;
    line-height: 1.8;
  }
  .section-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--mw-color-text-muted);
    margin: 0 0 16px;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 22px;
    margin-bottom: 34px;
  }
  .actions h4 {
    font-size: 14px;
    font-weight: 500;
    margin: 0 0 7px;
    color: var(--mw-color-text);
  }
  .actions p {
    font-size: 13px;
    line-height: 1.8;
    margin: 0;
    color: var(--mw-color-text-muted);
  }
  .rank {
    font-size: 10px;
    color: var(--mw-color-text-subtle);
    display: block;
    margin-bottom: 6px;
  }
  .upgrade-section {
    border-top: 1px solid var(--mw-color-border-subtle);
    padding-top: 25px;
  }
  .upgrade-paths {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 22px;
  }
  .upgrade-path {
    min-width: 0;
  }
  .path-heading {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .path-heading h4 {
    color: var(--mw-color-text);
    font-size: 13px;
    font-weight: 500;
    margin: 0;
  }
  .path-dot {
    width: 6px;
    height: 6px;
    background: var(--path-color);
    border-radius: 50%;
    flex-shrink: 0;
  }
  .upgrade-path > p {
    font-size: 13px;
    line-height: 1.75;
    color: var(--mw-color-text-muted);
    min-height: 64px;
    margin: 9px 0 18px;
  }
  .upgrade-path ol {
    padding: 0;
    list-style: none;
    margin: 0;
  }
  .upgrade-path li {
    position: relative;
  }
  .upgrade-path li:not(:last-child)::before {
    content: '';
    position: absolute;
    width: 1px;
    background: var(--mw-color-border-subtle);
    top: 26px;
    bottom: -11px;
    left: 12px;
  }
  .upgrade-path details {
    border: 0;
    margin: 0 0 13px;
    padding: 0;
  }
  .upgrade-path summary {
    gap: 9px;
    align-items: start;
    color: var(--mw-color-text);
    font-size: 12px;
    font-weight: 400;
  }
  .tier {
    width: 25px;
    height: 25px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--mw-color-border);
    background: var(--mw-color-inset);
    border-radius: 7px;
    color: var(--mw-color-text-muted);
    font-size: 10px;
  }
  .upgrade-path small {
    display: block;
    font-size: 11px;
    color: var(--mw-color-text-subtle);
    margin-top: 3px;
  }
  .upgrade-path details p {
    margin: 10px 0 15px 34px;
    font-size: 12px;
    line-height: 1.8;
    color: var(--mw-color-text-subtle);
  }
  .editor-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    margin-bottom: 20px;
  }
  .editor-heading h3,
  .validation-title,
  .research-item h3 {
    font-size: 14px;
    font-weight: 500;
    margin: 0;
  }
  .editor-heading p {
    font-size: 12px;
    color: var(--mw-color-text-muted);
    margin: 7px 0 0;
  }
  .editor {
    white-space: pre;
    background: var(--mw-color-inset);
    padding: 18px;
    color: var(--mw-color-text-muted);
    font-size: 12px;
    tab-size: 2;
  }
  .validation-list {
    margin: 20px 0 28px;
  }
  .validation-list > div {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    padding: 15px 0;
    border-bottom: 1px solid var(--mw-color-border-subtle);
    font-size: 13px;
  }
  .validation-list dt {
    color: var(--mw-color-text-muted);
  }
  .validation-list dd {
    margin: 0;
    color: var(--mw-color-success);
  }
  .validation-list .unchecked {
    color: var(--mw-color-text-subtle);
  }
  .research-item + .research-item {
    border-top: 1px solid var(--mw-color-border-subtle);
    padding-top: 26px;
    margin-top: 26px;
  }
  .research-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .grounding {
    font-size: 11px;
    color: var(--mw-color-text-muted);
  }
  .research-item p,
  .research-item li {
    font-size: 13px;
    line-height: 1.8;
    color: var(--mw-color-text-subtle);
  }
  .research-item h4 {
    font-size: 12px;
    font-weight: 500;
  }
  .research-item .secondary {
    margin-top: 20px;
  }
  .source-status {
    margin-left: auto;
    color: var(--mw-color-text-subtle);
    font-size: 10px;
  }
  .page-footer {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 5px;
    color: var(--mw-color-text-subtle);
    font-size: 10px;
    padding-top: 65px;
  }

  .concept-choice {
    width: 175px;
    margin-left: auto;
  }
  .definition-hint,
  .field-hint,
  .result-context {
    color: var(--mw-color-text-muted);
    font-size: 11px;
    line-height: 1.6;
  }
  .definition-hint {
    margin: 12px 4px 0;
  }
  .result-context {
    margin: 0 0 18px;
  }
  .character-source-prompt {
    display: flex;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--mw-color-border);
    padding-top: 18px;
    margin-top: 20px;
  }
  .character-source-prompt :global(svg) {
    flex-shrink: 0;
    color: var(--mw-color-text-muted);
  }
  .character-source-prompt p {
    margin: 0;
    color: var(--mw-color-text-muted);
    font-size: 12px;
    line-height: 1.6;
  }
  .character-source-prompt button {
    flex-shrink: 0;
  }
  .character-sources {
    margin-top: 22px;
  }
  .setup-notice {
    padding: 16px 18px;
    margin-top: 20px;
    border: 1px solid var(--mw-color-border);
    border-radius: 10px;
    background: var(--mw-color-surface);
  }
  .setup-notice p {
    margin: 0 0 12px;
    color: var(--mw-color-text-muted);
    font-size: 12px;
    line-height: 1.7;
  }
  .setup-notice a {
    color: var(--mw-color-text);
  }
  .setup-actions {
    display: flex;
    gap: 8px;
  }
  #model-setup {
    margin-top: 18px;
  }
  .grounding-option {
    margin-top: 22px;
  }
  .custom-connection {
    margin-bottom: 24px;
  }
  .elapsed {
    color: var(--mw-color-text-subtle);
    white-space: nowrap;
  }
  .mechanics-detail {
    margin: 0 0 28px;
  }
  .technique {
    margin-top: 14px;
  }
  .technique h5 {
    font-size: 12px;
    font-weight: 500;
    margin: 0 0 5px;
  }
  .adaptation-review {
    margin-top: 28px;
    color: var(--mw-color-text-muted);
    font-size: 12px;
    line-height: 1.8;
  }
  .adaptation-review ul {
    padding-left: 20px;
  }
  .claim-evidence {
    display: block;
    color: var(--mw-color-text-muted);
    font-size: 11px;
  }
  .validation-list .check-failed {
    color: var(--mw-color-error);
  }
  .upgrade-mechanics {
    font-size: 10px;
    padding: 10px;
  }

  .fidelity-claim {
    margin-top: 0;
    border-top: 0;
  }
  .fidelity-claim .claim-title {
    flex: 1;
    color: var(--mw-color-text);
    font-size: 12px;
  }
  .fidelity-review {
    margin-bottom: 30px;
  }
  .fidelity-review h3 {
    font-size: 14px;
    font-weight: 500;
  }
  .fidelity-review blockquote {
    border-left: 2px solid var(--mw-color-border-strong);
    margin: 15px 0;
    padding-left: 14px;
    font-size: 12px;
    line-height: 1.8;
    color: var(--mw-color-text-muted);
  }
  .model-mechanics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
    margin-bottom: 28px;
  }
  .model-mechanics > h3,
  .model-mechanics > .mechanics-detail {
    grid-column: 1 / -1;
    margin: 0;
  }
  .mechanic-group {
    min-width: 0;
  }
  .mechanic-group .actions {
    grid-template-columns: 1fr;
    margin-bottom: 0;
  }
  .nested-mechanic {
    margin-top: 18px;
  }
  .mechanic-notes {
    color: var(--mw-color-text-muted);
    font-size: 12px;
    line-height: 1.8;
    padding-left: 18px;
  }
  .captured-builds {
    margin-top: 28px;
  }
  .captured-builds .model-mechanics {
    margin-top: 20px;
  }
  .qualification {
    margin-top: 28px;
  }
  .finding {
    padding: 16px 0;
    border-bottom: 1px solid var(--mw-color-border-subtle);
  }
  .finding-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }
  .finding h4 {
    font-size: 12px;
    font-weight: 500;
    margin: 0;
  }
  .finding-heading span {
    font-size: 10px;
    color: var(--mw-color-text-muted);
  }
  .finding.blocker .finding-heading span {
    color: var(--mw-color-error);
  }
  .finding p {
    font-size: 12px;
    line-height: 1.7;
    color: var(--mw-color-text-muted);
  }
  .finding code {
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  .finding details {
    margin-top: 8px;
    padding-top: 0;
    border: 0;
  }

  @media (max-width: 760px) {
    .concept-choice {
      width: 100%;
      margin: 0;
    }
    .character-source-prompt {
      flex-wrap: wrap;
    }
    .character-source-prompt p {
      flex: 1;
      min-width: 160px;
    }
    .character-source-prompt button {
      margin-left: 28px;
    }

    .masthead {
      width: calc(100% - 36px);
      height: 65px;
    }
    .brand {
      font-size: 12px;
    }
    .product-name,
    .brand-divider {
      display: none;
    }
    main {
      padding: 34px 18px 24px;
    }
    h1 {
      font-size: 25px;
    }
    .introduction {
      margin-bottom: 22px;
    }
    .introduction p {
      font-size: 13px;
    }
    .subject-input {
      font-size: 19px;
    }
    .notes-input {
      font-size: 16px;
      min-height: 72px;
    }
    .definition-choice,
    .model-choice {
      width: calc(50% - 4px);
    }
    .icon-button,
    .secondary,
    .icon-button {
      min-width: 44px;
    }
    .composer-caption {
      gap: 12px;
      font-size: 10px;
    }
    .composer-caption > span {
      display: none;
    }
    .suggestions {
      gap: 7px;
      margin-top: 22px;
    }
    .suggestions > span {
      flex-basis: 100%;
      margin-bottom: 2px;
    }
    .suggestions button {
      min-height: 44px;
    }
    .advanced-settings {
      padding: 22px 20px;
    }
    .source-settings,
    .json-fields {
      grid-template-columns: 1fr;
    }
    .advanced-settings input:not([type='checkbox']),
    .advanced-settings textarea {
      font-size: 16px;
    }
    .results {
      margin-top: 42px;
    }
    .result-header {
      padding: 20px 18px 17px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .unit-name h3 {
      font-size: 18px;
    }
    .result-body {
      padding: 23px 20px;
    }
    .actions,
    .model-mechanics,
    .upgrade-paths {
      grid-template-columns: 1fr;
      gap: 24px;
    }
    .upgrade-path > p {
      min-height: 0;
    }
    .actions p,
    .upgrade-path > p,
    .upgrade-path details p {
      font-size: 13px;
    }
    .upgrade-path summary {
      min-height: 38px;
      font-size: 13px;
    }
    .upgrade-path small {
      font-size: 11px;
    }
    .editor-heading {
      flex-wrap: wrap;
    }
    .editor {
      font-size: 12px;
    }
    .validation-list > div {
      font-size: 12px;
    }
    .page-footer {
      padding-top: 42px;
      font-size: 10px;
    }
  }
</style>
