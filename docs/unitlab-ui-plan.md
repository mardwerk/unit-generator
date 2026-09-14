# UnitLab UI plan

UnitLab is a localhost web interface for people who want to create and inspect units without assembling a technical request. The generator remains the canonical execution engine, but that implementation detail stays out of ordinary UnitLab language. Agents and TowerRight call the generator directly. MapLab is a separate human interface with the same boundary.

## Current cleanup

The previous `apps/web` application has been removed. It was coupled to the deleted workspace packages and to Foundation, so keeping it would preserve a product surface that is being replaced. No new web application exists yet. The existing package deletion set is intentional and remains outside this UI rewrite.

The preferred design references are `experiments/ChatGPT Image 13. Sept. 2026, 21_06_27 (6).png` for the overall hierarchy, `experiments/unitlab-design-v1/generated/01-home/image.png` for density and grouping, `experiments/ChatGPT Image 13. Sept. 2026, 21_06_26 (2).png` for the right activity surface, and `experiments/ChatGPT Image 13. Sept. 2026, 21_06_27 (5).png` for calmer metadata and validation treatment. The first build should test the structure with fixture data and neutral image placeholders.

## Visual direction

Use a two-surface composition. The left navigation and top navbar form one quiet navigation surface. The main workspace is a separate content surface with a clear boundary. Diagnostics is a temporary right pop-over above the workspace, opened from the navbar or a run status affordance; it is not a permanent third column.

The base screen is intentionally simple. It contains a left rail, a top bar, and an empty home workspace. The default definition is visible as context, but there is no selected character, recent result, prefilled source, or fake run. The primary action is to begin a new unit. A small definition indicator sits beside that action so the user knows which rules will be used.

Carry forward the legible rail and workspace hierarchy from `(6)`, the compact grouped panels from `01-home` without its gold action treatment, the transient activity panel from `(2)`, and the calmer two-color contrast and metadata rows from `(5)`. Do not carry forward a generated banner, populated example unit, permanent activity rail, footer, browser controls, CLI transcript, or gold generation button. Yellow may remain in the mark or a small status accent. Avoid decorative gradients, neon accents, excessive cards, and generic analytics widgets.

## First launch state

When UnitLab opens, the user sees a left rail with only Home, New unit, Library, and Settings; a separate top navbar with the default definition, compact search, and `Open diagnostics`; an empty home workspace with a short welcome statement and one `Create unit` action; and an empty activity area explaining where completed units will appear later. No unit, image, run, source, or result is loaded by default.

Navigation can be clickable in the first fixture, but generation and persistence are mocked or no-ops. The interface must not imply that a run completed.

## User flow

1. Open UnitLab into the empty Home state.
2. Confirm or change the default definition from the navbar.
3. Choose New unit.
4. Enter an anime or original character name and optional intent.
5. Review the compact request summary and source choices.
6. Submit the mocked generation action and see an explicit mocked progress state.
7. Return to a mocked unit overview only after choosing to preview it.
8. Open the diagnostic pop-over from the navbar or run state to inspect fixture events.
9. Later, save or export a real result when the generator bridge exists.

The base UI stops before real generation, provider settings, source retrieval, persistence, or result editing. Those are later slices.

## Diagnostic pop-over

Diagnostics opens over the right edge with a scrim or clear elevation boundary and can be dismissed without changing the page. The fixture contains a run header, status, event timeline, and collapsed sections for request, definition, sources, validation, and artifacts. Technical execution details belong inside this view.

## Stack decision

Evaluate from a clean slate. Foundation and all `@mardwerk/*` UI packages are excluded. Tauri and other desktop packaging are excluded because this project will only ship as a localhost web app.

React + Vite + TypeScript + Tailwind is the leading option for the eventual interactive UI because the workspace needs explicit state, overlays, keyboard access, and fixture-driven screens. Use small local components and add Radix primitives only for concrete needs such as a dialog, tabs, or pop-over. Do not adopt the full shadcn catalog or a card-heavy design system.

Svelte + Vite + TypeScript remains a credible alternative if its smaller component syntax makes iteration faster. SvelteKit is unnecessary while the app is static and browser-hosted; add a localhost server only when the generator bridge needs it. Vue + Vite is viable but has no clear advantage. Plain HTML/CSS is useful for a throwaway visual test, but is a poor base for the diagnostic overlay and later form state.

The next implementation decision is React/Vite versus Svelte/Vite, made after the base screen is built in the smallest fixture-driven slice. No framework dependency should be added until that choice is made.

## Build slices

1. Build the empty Home shell: two surfaces, left rail, navbar, definition indicator, empty content, and diagnostic pop-over.
2. Add clickable New unit and a compact mocked request form.
3. Add fixture preview states for progress and a unit overview.
4. Add settings as a local-only visual surface, without provider wiring.
5. Add the localhost bridge to invoke the canonical generator and stream events.

The bridge must remain thin and typed. It may start runs, read events, cancel runs, read results, and export files. It must not reimplement generation logic.
