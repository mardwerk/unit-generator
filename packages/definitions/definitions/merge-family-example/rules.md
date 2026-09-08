# Merge-family example rules

This small contract produces a family of units, not an upgrade tree. It illustrates replacing both the input and output schema. Ability text remains a design proposal; the consuming game implements it.

When the player explicitly selects three field copies with identical identity and rank, consume exactly those copies and create one unit at rank + 1 using their declared `next` destination. Use the selected primary copy's legal board cell. The other two cells become empty. The new copy starts with its destination's default state; temporary effects, cooldowns, health changes and accumulated resources do not transfer. If the destination or placement is unavailable, reject the whole merge without consuming anything. A terminal rank has next=null and cannot automatically merge. This shared rule is not repeated in every unit.

The destination must exist in this generated family or the supplied roster, preserve identity, and increase rank by one. There is one definition per identity/rank. Every unit ID is unique across generated and supplied content. Costs express acquisition credits for a copy; they do not prove that three copies can be obtained at a particular rate.

Optional mixed-unit recipes list exactly the consumed unit IDs, including repeated IDs when multiple copies are required. Every ingredient and destination must exist in the generated or supplied roster. The player selects a primary consumed copy's cell for the result. Apply the same atomic consumption, placement rejection and state-reset rule. Automatic matching uses identity/rank; explicit mixed recipes use unit IDs. A mixed recipe takes precedence only when the player explicitly selects that recipe.

The validator checks IDs, ranks, destinations and recipe references. It does not simulate board occupancy, implement descriptive abilities, or prove balance. Supply relevant roster context instead of inventing nonexistent recipe members.
