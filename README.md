# mardwerk-unit

Unit Generator turns a character into a Tower Defense unit: one automatic attack, three upgrade paths of five purchases, and every legal combination of two paths, all with exact numbers. You give it a character (a name to research, or your own source text) and a Profile with the game's rules. A model plans and drafts the unit, code checks every build against the rules, a second model call reviews it, and you get a readable unit sheet with its evidence kept alongside.

Checks show that a unit follows its Profile's rules. They do not show that it is balanced or fun to play.

## What a unit looks like

This excerpt is from a real run, not a mock-up. Profile: the bundled Default Profile as of commit `0eb43da` (rules `default-td-profile-v12`, Definition `btd6-combat-v1`); later versions also require a behavior at every third purchase. Input: the Dart Monkey brief in [data/reference](data/reference/dart-monkey.request.json), written from the pinned btd6-atlas capture. Model: a relay, not a live provider. The Engine's prompts went through the Codex adapter to a stand-in executable, and Claude subagents answered them ([evaluation](docs/PROFILE-EVALUATION.md)). The full sheet has all 15 purchases and 48 crosspaths: [dart-monkey.result.md](data/reference/captures/dart-monkey.result.md).

> **Dart Monkey**
>
> **0-0-0 Dart Throw.** Placement costs 200 Gold. Dart Throw is an automatic projectile attack. Every 0.95 s it fires 1 projectile at its target; each deals 1 Sharp damage with pierce 2, hitting up to 2 enemies, at range 32. Sharp damage cannot hurt Lead and Frozen enemies.
>
> *Top path: Spiked Ball*
>
> **3-x-x Spike-o-pult** (320 Gold). Raises damage from 1 to 2 (+1). Raises pierce from 5 to 18 (+13). Raises range from 32 to 36.8 (+4.8). Lengthens the attack interval from 0.95 s to 1.15 s (+0.2).
>
> **5-x-x Ultra-Juggernaut** (15,000 Gold). Raises damage from 2 to 5 (+3). Raises pierce from 60 to 210 (+150). Adds Split Balls: after each volley hits, up to 12 other detected enemies within 12 of the primary impact take 0.4 times the hit damage (2) once each; it applies no statuses, never recurses and inherits no pierce, splash or volley count.
>
> *Middle path: Quick Shots*
>
> **x-4-x Super Monkey Fan Club** (6,000 Gold). Shortens the attack interval from 0.4784 s to 0.2392 s (×0.5). Adds Super Monkey Surge, this Unit's Active Ability: for 15 s it multiplies its interval by 0.0625, so the attack deals 1 damage every 0.015 s at range 32. It is ready on purchase, recharges 50 s after activation and cannot reactivate while active; it grants no separate attack.
>
> *Bottom path: Crossbow*
>
> **x-x-2 Enhanced Eyesight** (200 Gold). Raises range from 40 to 48 (+8). Adds Camo detection to this Unit's attack.
>
> *Crosspaths: 12 early and 36 advanced builds, for example*
>
> **1-4-0** (7,080 Gold). Added by the other path: 1-x-x: pierce 2 → 3, during Super Monkey Surge: pierce 2 → 3. Resulting attack: 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 3, range 32. Active Ability: Super Monkey Surge for 15 s every 50 s: 3 projectiles every 0.015 s, 1 Sharp damage, pierce 3, range 32.

Every number comes from resolving the typed mechanics, and the crosspath lines are computed, not written by the model. In the same run the model review reported three concerns, all on the middle path: the fifth purchase's pierce applies outside the boost, the boost borrows a factor the source gives to allied towers, and one x-5-x does not beat several x-4-x copies. Three prices also differ from the source (x-4-x 7,200, x-5-x 45,000, x-x-5 21,500 Gold). A [revision](data/reference/captures/dart-monkey.revision.md) restored them and x-x-5's pierce 8 without touching the other purchases or crosspaths; because that run's Definition allowed four changes per purchase, x-x-5 lost its +2 damage in exchange; the Default Profile now allows five. What the Definition cannot express (rebounds, knockback, critical shots, allied transformations) is reported as unsupported mechanics in the diagnostics (`render --details`), not granted by any build.

## Quick start

Requires Go 1.24 or newer. The web client is built into the binary.

```sh
go build -o mardwerk-unit ./src/cli
./mardwerk-unit serve
```

Open `http://127.0.0.1:4317`, enter a character name and select Generate.

A model provider is needed for drafting and review:

- **OpenRouter** (default): put `OPENROUTER_API_KEY` in a `.env` file in the working directory (see [.env.example](.env.example)), set it in the environment, or enter it in Settings. The default model is `openrouter/free`, free models only with no paid fallback; `--model` picks another.
- **Codex**: with a logged-in `codex` CLI, run `./mardwerk-unit serve --provider codex`.

The same from the terminal, starting from the Dart Monkey brief (no research step):

```sh
./mardwerk-unit author data/reference/dart-monkey.request.json \
  --profile default -o data/runs/dart.json
./mardwerk-unit render data/runs/dart.json -o data/runs/dart.md
./mardwerk-unit build data/runs/dart.json --tiers 0,4,2
```

Or from a character name: `research` finds sources (Wikipedia, Wikidata, Fandom) without a model call, and `generate` prepares, drafts and checks them.

```sh
./mardwerk-unit research "Monkey D. Luffy" -o data/runs/luffy.sources.json
./mardwerk-unit generate data/runs/luffy.sources.json -o data/runs/luffy.json
```

If `go build` stops with `error obtaining VCS status`, Git could not read the checkout, for example because another user owns it. Build with `go build -buildvcs=false -o mardwerk-unit ./src/cli`.

More in [CLI.md](docs/CLI.md) (commands and request files), [LAB.md](docs/LAB.md) (the web app) and [MECHANICS.md](docs/MECHANICS.md) (what the Engine can resolve and check).

## Profiles and the BTD6 reference

A Profile holds the task, the rules document and the mechanics Definition: currency, starter scale, limits, and the status effects, damage types, targeting and detection a unit may use.

- **Default Profile.** Bundled and selected unless you pick another. It follows Bloons TD 6 closely: three paths of five, the BTD6 crosspath rule, Medium prices, damage types that cannot hurt some enemies, and Camo detection. Only the middle path may have an Active Ability, first at `x-4-x`. Its scale references come from real towers in [btd6-atlas](https://github.com/KyleDerZweite/btd6-atlas) capture 56.3 (Steam build 24829026, revision `a380413`), cited by file. [BTD6-REFERENCE.md](docs/BTD6-REFERENCE.md) lists the files, how values were read, and the deliberate departures from BTD6. Atlas data is CC BY-NC 4.0.
- **Other Profiles.** Saved Profiles live in `data/profiles` and are selected with `--profile ID` or in the web app. They can rename the currency and define their own status effects, damage types, targeting and detection. The MangaMayhem Profile ships separately and is selected the same way. Its special forms and status effects on placed Units are not implemented in this Engine yet.

## Where saved work goes

The library (`data/runs/library` by default, ignored by Git) is arranged by source and character:

```text
bloons-td-6/
  dart-monkey/
    character.json
    dart-monkey.sources.1a2b3c4d5e6f.json
    dart-monkey.result.0eb43da91c2f.json
    dart-monkey.result.0eb43da91c2f.md
    assets/
```

Each stage and revision gets its own file, named by the start of its SHA-256. Records from earlier versions stay readable; `mardwerk-unit library migrate` moves them into this layout. See [LAB.md](docs/LAB.md#library).

## Development

```sh
gofmt -l src
go vet ./...
go test ./...
```

The tests need no account or network. A scripted model plays each Engine stage, and OpenRouter, Codex, Wikipedia and Fandom are local fakes. They check software behavior, not the quality of generated units.

The web client needs Node.js 22 or newer and pnpm only when you change it:

```sh
pnpm install
pnpm typecheck
pnpm format:check
pnpm build        # rewrites src/web/dist, which the binary embeds; commit it
```

| Path | Content |
| --- | --- |
| `src/cli/` | The Go program: the `mardwerk-unit` command and its internal packages |
| `src/web/` | The web client (React) and its embedded build (`dist/`) |
| `data/` | Reference requests and captures, saved Profiles and local runs |
| `docs/` | Contributor and user documentation |

## Tested, and not yet tested live

Tested without network access:

- **Engine stages.** A scripted Dart Monkey runs through plan, mechanics, targeted repair, check, review, render and the library. Native tests cover schemas, all 64 legal builds, crosspath arithmetic, design-policy gates and version 1 and version 2 equivalence.
- **Adapters.** OpenRouter, Codex, images, research, documents, evidence, library, Profiles, the HTTP API and the CLI, against a fake OpenRouter server, a fake `codex` executable and fixture HTTP.
- **Web app.** In Chromium against the Go server with a scripted model ([browser_test.go](src/cli/internal/server/browser_test.go), opt-in with `UNIT_BROWSER_PORT`).
- **Relayed generations.** The Dart Monkey brief under this Default Profile, one revision of it, and the same brief under the previous Profile, through the Codex adapter with Claude subagents answering ([evaluation](docs/PROFILE-EVALUATION.md)).

Not yet tested live from the development container:

- **OpenRouter** text and image generation with a real key and the models in [OPENROUTER.md](docs/OPENROUTER.md): request shape, usage and cost, error classification, PNG conversion.
- **Codex** with a real `codex` CLI and login, including MCP-server disabling against a real `config.toml`.
- **Character research** against live Wikipedia, Wikidata and Fandom; the rules are tested on fixtures only.
- **Windows.** Codex process cleanup uses process groups on Unix only.
- **Unit quality.** An owner-run generation of Monkey D. Luffy under the previous Profile showed repetitive paths ([#22](https://github.com/mardwerk/unit-generator/issues/22)); its cause is not isolated. The relayed Dart Monkey comparison is one sample, not a quality measurement.

## Documentation

| Document | Answers |
| --- | --- |
| [CONTEXT.md](CONTEXT.md) | What do the terms mean, and who owns what? |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How is the Tool structured? |
| [docs/CLI.md](docs/CLI.md) | How do I use the CLI? |
| [docs/LAB.md](docs/LAB.md) | How do I use the web app? |
| [docs/MECHANICS.md](docs/MECHANICS.md) | What can the Engine resolve and check? |
| [docs/PROFILE-EVALUATION.md](docs/PROFILE-EVALUATION.md) | How did the Default Profile do on real references? |
| [docs/OPENROUTER.md](docs/OPENROUTER.md) | Which models may agents call? |
| [docs/BTD6-REFERENCE.md](docs/BTD6-REFERENCE.md) | Which BTD6 values are used, from which atlas files? |
| [data/README.md](data/README.md) | Reference requests, captures and Profiles |
| [AGENTS.md](AGENTS.md) | Rules for contributors and agents |

Related repositories: [Map Generator](https://github.com/mardwerk/map-generator) and [organization metadata](https://github.com/mardwerk/.github).
