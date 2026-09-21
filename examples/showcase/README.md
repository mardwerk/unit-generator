# Showcase units

Four units generated with the default offline route. No model calls ran.
Each pair holds the checked artifact and its compact Markdown sheet.

| Unit | Recipe | Base attack |
| --- | --- | --- |
| Monkey D. Luffy | kinetic striker | stretching punch |
| Goku | energy impact | energy beam |
| Natsu Dragneel | energy pressure | burning attack |
| Roronoa Zoro | piercing projectile | sword slash |

To open one in UnitLab, run `pnpm dev`, open the local address,
and import the JSON file. To re-render, run
`pnpm cli render examples/showcase/<name>.json`.
To regenerate, run `pnpm cli generate "<name>" -o .runs/<name>.json`.
Every sheet passed 19 of 20 deterministic checks; the remaining
check is not applicable offline. Values are proposed, not balanced.
