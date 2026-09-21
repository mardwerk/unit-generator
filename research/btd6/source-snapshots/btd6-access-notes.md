# BTD6 baseline research access

Research date: September 20, 2026. Worker owns docs/BTD6-UNIT-DESIGN.md only.

Direct urllib requests to bloons.fandom.com/wiki/Upgrades, Bloons_TD_6, Activated_Abilities and Crosspathing returned HTTP 403. Direct attempts against www.bloonswiki.com and bloonswiki.com also returned 403. No claims were sourced from those failed requests.

The preview browser successfully opened and exposed article text for Upgrades, Crosspathing, Special_Abilities, Activated_Abilities_(BTD6), Towers, Banana_Farm_(BTD6), Beast_Handler and Dark_Knight. Saved extracts record the inspected text. The Dark Knight navigation initially timed out, but subsequent page inspection verified the intended URL and article text. Some very long page evaluations failed; shorter article extracts succeeded.

Official Ninja Kiwi and Steam product pages were fetched directly with urllib. Saved HTML and text are in this directory. Ninja Kiwi product counts are old. Steam is publisher product copy, not a mechanics specification. Wiki aggregate upgrade tables explicitly state version 43.0; ability and crosspath indexes display incomplete or outdated notices. Avoided importing exact current stats from these mixed-version sources.

Companion worker btd6_examples inspected the Wizard and Engineer tier tables and reported T1 Fireball, T2 Wall of Fire and T1 Sentry Gun as automatic behavior additions. Those findings are attributed to the companion research in the document source register.

Recommendations about capability budgets, output review and generator integration are derived design decisions, not asserted BTD6 hard rules. No source code was changed by this worker.
