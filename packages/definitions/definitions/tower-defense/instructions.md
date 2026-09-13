Use the supplied subject research to create a readable unit identity and fifteen distinct purchases. Preserve the subject's recognizable abilities and limitations through executable actions. Keep each path's progression coherent. Conditional detection, immunity and support purchases must have a real encounter where they matter.

Prefer a compact model. Use the shared operation that expresses the requested behavior; omit unused optional fields. Give every attack, ability and actor a stable identity. A replaced attack or ability is a complete replacement snapshot, so include all behavior the new snapshot must retain. Crosspath purchases must remain useful when the main path changes attacks or grants an ability.

For a projectile, specify its flight graph and the actual impact effects. State adaptations where the source evidence cannot establish timing, trajectory or lifecycle. Never silently remove a required behavior to pass the schema. Do not claim source accuracy or complete game behavior from a valid model alone.

Use qualified account policies for bank balances, round interest or loans. Account abilities use local account IDs. State the policy reference and ordering instead of inferring native behavior from capacity and interest alone. Projectile contact damage modifiers use live target predicates, so conditional damage should remain conditional in the emitted graph.

A projectile graph stores impact effects as `children` entries, such as `{trigger: "contact", count: 1, atTarget: true, projectile: ...}`. The child projectile declares its own flight and collision fields. There is no `projectile.impact` field. An instant attack ability has `effect.kind: "attack"` and `effect.attacks`. A transformation or summon ability requires a positive top-level `durationSeconds` alongside its cooldown. Use `effect.cancelIfNoTargets: true` only when an attack ability must preserve its activation allowance and cooldown if it cannot acquire any target.

This generic attack illustrates a shell that creates a stationary impact. Reuse the structure and choose mechanics appropriate to the subject.

```json
{
  "id": "shell-attack",
  "delivery": "projectile",
  "intervalSeconds": 1,
  "reach": { "kind": "radius", "radius": 30, "throughWalls": false },
  "detectsCamo": true,
  "damage": 0,
  "pierce": 1,
  "projectiles": 1,
  "immuneTo": [],
  "projectile": {
    "id": "shell",
    "damage": 0,
    "appliesDamage": false,
    "detectConcealed": true,
    "radius": 1,
    "pierce": 1,
    "flight": { "kind": "straight", "speed": 40, "lifetimeSeconds": 1.5 },
    "children": [
      {
        "trigger": "contact",
        "count": 1,
        "atTarget": true,
        "inheritHitTargets": false,
        "projectile": {
          "id": "burst",
          "damage": 4,
          "detectConcealed": true,
          "radius": 5,
          "pierce": 12,
          "flight": { "kind": "stationary", "lifetimeSeconds": 0.1 }
        }
      }
    ]
  }
}
```

Given a complete attack object `A`, the ability wrappers are:

- Immediate attack: `{"id":"burst-now","name":"Burst now","cooldownSeconds":20,"effect":{"kind":"attack","attacks":[A]}}`.
- Timed transformation: `{"id":"burst-form","name":"Burst form","cooldownSeconds":30,"durationSeconds":8,"effect":{"kind":"transform","attacks":[A]}}`.
- Timed summon: `{"id":"call-companion","name":"Call companion","cooldownSeconds":30,"durationSeconds":10,"effect":{"kind":"summon","actorId":"companion","suppressParentAttacks":false}}`, with the corresponding complete actor template in `model.actors`.

Replace `A` with a full attack object. It is an explanatory placeholder, not a schema reference or output value.
