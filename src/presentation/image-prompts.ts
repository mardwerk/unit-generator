import type { UnitCandidate } from '../core/index.js';

export type IconKind = 'ability' | 'attack' | 'upgrade' | 'portrait';

export function imagePrompt(
  candidate: UnitCandidate,
  label: string,
  description: string,
  kind: IconKind = 'ability',
  pixels = 512,
) {
  return [
    kind === 'portrait'
      ? `Create one character portrait of ${candidate.character.name} from ${candidate.character.work} for a Tower Defense Unit.`
      : `Create one square game UI icon for ${label}, ${kind === 'attack' ? 'the basic attack of' : kind === 'upgrade' ? 'an upgrade of' : 'an ability of'} ${candidate.character.name} from ${candidate.character.work}.`,
    `Character scope: ${candidate.character.scope}`,
    `Unit role: ${candidate.role}`,
    kind === 'portrait'
      ? `Character design direction: ${description}`
      : `Represent this specific effect: ${description}`,
    ...(kind === 'portrait'
      ? []
      : [
          kind === 'attack'
            ? 'Show the signature attack in action: its projectile, weapon, striking limb or impact effect. Include only the minimum body or silhouette needed to explain the attack.'
            : kind === 'upgrade'
              ? 'Show the changed mechanic of this upgrade as a distinctive projectile, weapon detail, effect or transformation feature. Give it a visual identity distinct from the basic attack and neighboring upgrades, grounded in its stated benefit.'
              : 'Show the specific ability through its defining projectile, object or effect. Include a character fragment only when it is needed to explain the mechanic.',
          'Keep the attack or effect as the focal subject. Do not use a generic character portrait or whole-character pose as the icon. Use character-specific visual motifs only where they help identify this mechanic.',
        ]),
    kind === 'portrait'
      ? `Show the character, with a recognizable face, outfit and silhouette consistent with the supplied scope and design direction. For an original character, create an original appearance from that brief. Use crisp anime-inspired cel shading and a centered pose that reads clearly as a small portrait on a dark interface. No text, lettering, numbers, wordmark, watermark, border or UI chrome. Deliver one ${pixels} by ${pixels} PNG with a transparent background.`
      : `Use a clear anime-inspired silhouette, crisp cel shading, a restrained palette and strong contrast against a dark UI. Make the ability identifiable at 48 pixels. Keep the focal subject centered with space around it. No text, lettering, numbers, wordmark, border, watermark or UI chrome. Deliver one ${pixels} by ${pixels} PNG with a transparent background.`,
  ].join('\n\n');
}
export function iconPrompt(
  candidate: UnitCandidate,
  label: string,
  description: string,
  destination: string,
  kind: IconKind = 'ability',
) {
  return `${imagePrompt(candidate, label, description, kind)}\n\nSave the finished PNG directly to ${JSON.stringify(destination)}. Create the parent folder if needed. The filename is already chosen; do not ask for a name or destination. Do not modify application code.`;
}
