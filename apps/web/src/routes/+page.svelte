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
  let definition = $state('classic-three-path');
  let provider = $state(untrack(() => data.defaultProvider));
  let original = $state(untrack(() => data.defaultProvider === 'fixture'));
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
  let report = $derived(dirty ? undefined : result?.validation);
  let content = $derived.by(() => {
    try {
      return JSON.parse(editor) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  });
  const pretty = (value: unknown) => JSON.stringify(value, null, 2);
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const records = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
      ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      : [];
  const message = (cause: unknown) =>
    cause instanceof Error ? cause.message : 'The request failed.';
  onMount(() => {
    const cancel = () => controller?.abort();
    window.addEventListener('pagehide', cancel);
    return () => {
      cancel();
      window.removeEventListener('pagehide', cancel);
    };
  });
  function requestInput(): unknown {
    if (customInput.trim()) return JSON.parse(customInput);
    if (definition !== 'classic-three-path') throw new Error('Enter a complete request as JSON.');
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
      const input = requestInput();
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
          provider,
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
    const snapshot = editor;
    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          definition: runDefinition,
          candidate: JSON.parse(snapshot),
          original: result
        })
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.message ?? 'Validation failed.');
      result = next;
      checkedEditor = snapshot;
    } catch (cause) {
      error = message(cause);
    } finally {
      validating = false;
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
        download(result, 'unit-result.json');
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
  <title>Unit playground | Mardwerk</title>
  <link rel="icon" type="image/png" href="/brand/mardwerk.png" />
  <meta
    name="description"
    content="A local playground for generating, editing, and checking game units."
  />
</svelte:head>

<header class="masthead">
  <a href="/" class="brand" aria-label="Mardwerk unit generator"
    ><img src="/brand/mardwerk.png" alt="" /><span>Mardwerk</span><span class="brand-divider"
      >/</span
    ><span class="product-name">Unit generator</span></a
  >
  <ThemeToggle />
</header>
<main>
  <section class="compose-section" aria-label="Generation request">
    <div class="introduction">
      <h1>Unit playground</h1>
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
          {#if definition === 'classic-three-path'}
            <label class="mw-label" for="subject">Subject</label>
            <input
              id="subject"
              class="mw-control subject-input"
              bind:value={subject}
              maxlength="512"
              required={!customInput.trim()}
              autocomplete="off"
              placeholder="e.g. Clockwork heron"
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
                label:
                  item.id === 'classic-three-path'
                    ? 'Classic three-path'
                    : item.id === 'merge-family-example'
                      ? 'Merge unit family'
                      : item.title
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
            <label class="sr-only" for="provider">Model connection</label>
            <Select
              id="provider"
              bind:value={provider}
              disabled={busy || validating}
              options={data.providers.map((item) => ({
                value: item.id,
                label: item.id === 'fixture' ? 'Demo fixture' : (item.model ?? item.id)
              }))}
            />
          </div>
          {#if definition === 'classic-three-path'}<div class="concept-check">
              <Checkbox bind:checked={original}>Original concept</Checkbox>
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
                (definition === 'classic-three-path' && !!customInput.trim())}
            ></span></button
          >
          <button
            type="submit"
            class="mw-button generate"
            data-variant="primary"
            disabled={busy || validating}
            >{busy ? 'Generating…' : 'Generate'}<ArrowUp
              size={17}
              strokeWidth={1.6}
              aria-hidden="true"
            /></button
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
            {#if definition === 'classic-three-path'}
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
                  <Checkbox bind:checked={permitResearch}
                    >Allow source discovery and public page reads</Checkbox
                  ><Checkbox bind:checked={allowUngrounded}
                    >Allow generation without source grounding</Checkbox
                  >
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
                disabled={busy || validating || provider === 'fixture'}
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
          : 'Generated content needs review and playtesting.'}
      </p>
      {#if busy}<button
          type="button"
          class="mw-button cancel-button"
          onclick={() => controller?.abort()}>Cancel</button
        >{:else}<span>⌘ / Ctrl + Enter</span>{/if}
    </div>
    {#if definition === 'classic-three-path' && customInput.trim()}<p class="notice">
        Using the complete request from JSON input instead of the fields above.
      </p>{:else if definition === 'classic-three-path' && !original && !permitResearch && !knowledge.trim() && !sourceText.trim() && !sourceUrls.trim()}<p
        class="notice"
      >
        For an existing character, add source material or enable research in Advanced.
      </p>{/if}
    {#if !result && !busy && definition === 'classic-three-path' && !customInput.trim()}
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
          {result ? 'Unit output' : busy ? 'Generating unit' : 'Run output'}
        </h2>
        <span>Current session</span>
      </div>
      {#if error}<div class="error" role="alert">{error}</div>{/if}
      {#if progress.length && !result}<div class="progress" aria-live="polite">
          {#if busy}<div class="busy-line">
              <span class="activity-dot"></span>
              <p>{progress.at(-1)}</p>
            </div>{/if}
          {@render runLog()}
        </div>{/if}
      {#if result}
        <div class="result-shell">
          <div class="result-header">
            <div class="unit-name">
              <div class="unit-symbol"><Box size={23} strokeWidth={1.6} aria-hidden="true" /></div>
              <div>
                <h3>{typeof content?.name === 'string' ? content.name : 'Generated unit'}</h3>
                <span
                  class="acceptance"
                  class:needs-attention={dirty || result.status !== 'success'}
                  data-testid="acceptance"
                  >{dirty
                    ? 'Unvalidated edit'
                    : result.status === 'success'
                      ? 'Checks passed'
                      : 'Candidate failed'}</span
                >
              </div>
            </div>
            <button type="button" class="mw-button secondary export-button" onclick={exportResult}
              ><Download size={16} strokeWidth={1.6} aria-hidden="true" />Export {dirty
                ? 'candidate'
                : 'result'}</button
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
              {#if typeof content?.summary === 'string'}<p class="unit-summary">
                  {content.summary}
                </p>{/if}
              {#if typeof content?.brief === 'string'}<p class="unit-summary">
                  {content.brief}
                </p>{/if}
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
              {#if records(record(content?.upgradeGraph).paths).length}<section
                  class="upgrade-section"
                  aria-label="Upgrade paths"
                >
                  <h3 class="section-title">Upgrade paths</h3>
                  <div class="upgrade-paths">
                    {#each records(record(content?.upgradeGraph).paths) as path, i}<article
                        class="upgrade-path"
                        style={`--path-color: ${['var(--mw-color-series-1)', 'var(--mw-color-series-2)', 'var(--mw-color-series-3)'][i % 3]}`}
                      >
                        <div class="path-heading">
                          <span class="path-dot"></span>
                          <h4>{path.name}</h4>
                        </div>
                        <p>{path.summary}</p>
                        <ol>
                          {#each records(record(content?.upgradeGraph).nodes).filter((node) => node.path === path.id) as node, tier}<li
                            >
                              <details>
                                <summary
                                  ><ChevronRight
                                    class="disclosure-icon"
                                    size={14}
                                    strokeWidth={1.6}
                                    aria-hidden="true"
                                  /><span class="tier">{tier + 1}</span><span
                                    >{node.name}<small>{node.costCredits} credits</small></span
                                  ><Plus class="expand-icon" size={14} aria-hidden="true" /><Minus
                                    class="collapse-icon"
                                    size={14}
                                    aria-hidden="true"
                                  /></summary
                                >
                                <p>{node.summary}</p>
                              </details>
                            </li>{/each}
                        </ol>
                      </article>{/each}
                  </div>
                </section>{/if}
              {#if !content}<p class="notice">
                  The edited JSON cannot be displayed. Open JSON to correct it.
                </p>{/if}
            {:else if outputView === 'json'}
              <div class="editor-heading">
                <div>
                  <h3>Content JSON</h3>
                  <p>Edit the unit, then validate your changes.</p>
                </div>
                <button
                  type="button"
                  class="mw-button secondary"
                  onclick={validateEdit}
                  disabled={busy || validating}
                  ><Check size={16} strokeWidth={1.6} aria-hidden="true" />{validating
                    ? 'Validating…'
                    : 'Validate edit'}</button
                >
              </div>
              <label class="sr-only" for="editor">Content JSON</label><textarea
                class="mw-control code editor"
                id="editor"
                bind:value={editor}
                rows="22"
                spellcheck="false"
              ></textarea>
            {:else if outputView === 'checks'}
              <h3 class="validation-title">Validation</h3>
              {#if report}<dl class="validation-list">
                  <div>
                    <dt>Structure</dt>
                    <dd>{report.structure.status}</dd>
                  </div>
                  <div>
                    <dt>Implemented system checks</dt>
                    <dd>{report.system.status}</dd>
                  </div>
                  <div>
                    <dt>Request constraints</dt>
                    <dd>{report.constraints.status}</dd>
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
                <details>
                  <summary
                    ><ChevronRight
                      class="disclosure-icon"
                      size={14}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />Coverage and unchecked rules</summary
                  >
                  <pre>{pretty(report)}</pre>
                </details>
              {:else}<p class="notice">
                  Edited content needs validation. Open JSON and select Validate edit.
                </p>{/if}
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
  {#if !researchResults.length}<p class="notice">This run has no captured research.</p>{/if}
  {#each researchResults as research, i}<article class="research-item">
      <div class="research-heading">
        <h3>{research.subject}</h3>
        <span class="grounding">{research.grounding}</span>
      </div>
      <p>{research.knowledge?.identity.continuity ?? 'Continuity unresolved'}</p>
      {#if research.knowledge}<ul>
          {#each research.knowledge.claims as claim}<li>{claim.text}</li>{/each}
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
  .concept-check {
    margin-left: auto;
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
  @media (max-width: 760px) {
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
    .concept-check {
      margin: 2px 0 0;
      min-height: 34px;
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
