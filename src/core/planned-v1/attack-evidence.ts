import type { AuthorRequest } from '../schemas.js';
import { authorEvidence } from './evidence.js';

export type AttackModality =
  'physical-impact' | 'sharp-projectile' | 'nonburn-energy' | 'fire' | 'area-control';

export interface AttackEvidenceCandidate {
  id: string;
  sourceId: string;
  documentId: string;
  text: string;
  modality: AttackModality;
}

/**
 * A conservative English retrieval filter, not semantic verification.
 * Actor attribution, negation, source period and attack fit still need review.
 * ponytail: lexical cues can miss supported attacks; extend only for demonstrated gaps.
 */
export function attackEvidenceCandidates(request: AuthorRequest): AttackEvidenceCandidate[] {
  return authorEvidence(request).flatMap((span) => {
    if (span.text.length < 15) return [];
    const text = span.text.toLowerCase();
    // Credits and skill inventories can contain attack-like names without behavior.
    if (/\b(?:voiced by|voice actor|voice actress|voice credits)\b/.test(text)) return [];
    const projected =
      /\b(?:launch(?:es|ed|ing)?|fir(?:e|es|ed|ing)|expel(?:s|led|ling)?|spray(?:s|ed|ing)?|shoot(?:s|ing)?|shot|project(?:s|ed|ing)?|releas(?:e|es|ed|ing)|emit(?:s|ted|ting)?|throw(?:s|ing)?|thrown)\b/.test(
        text,
      );
    const behavior =
      /\b(?:us(?:e|es|ed|ing)|deliver(?:s|ed|ing)?|strik(?:e|es|ing)|struck|attack(?:s|ed|ing)?|hit(?:s|ting)?|punch(?:es|ed|ing)|kick(?:s|ed|ing)|fight(?:s|ing)?|fought|combat|inflict(?:s|ed|ing)?|incapacitat(?:e|es|ed|ing))\b/.test(
        text,
      );
    // "Fire a beam" uses fire as a verb, not an elemental claim.
    const flame =
      /\b(?:flame|flames|burn(?:s|ed|ing)?|fire (?:attack|magic))\b/.test(text) ||
      /\b(?:project\w*|emit\w*|produc\w*|creat\w*|releas\w*|expel\w*|spray\w*)\s+(?:a |the )?fire\b/.test(
        text,
      );
    const modalities: AttackModality[] = [];
    if (
      behavior &&
      /\b(?:punch(?:es|ed|ing)?|kick(?:s|ed|ing)?|physical (?:strike|strikes|blow|blows)|powerful hits|debilitating precision)\b/.test(
        text,
      )
    )
      modalities.push('physical-impact');
    if (
      projected &&
      /\b(?:cutting blade|piercing (?:object|projectile)|water.{0,60}(?:blade|cutting)|arrows?|darts?|kunai|shuriken|knives)\b/.test(
        text,
      )
    )
      modalities.push('sharp-projectile');
    if (
      !flame &&
      (projected || /\bconcentrat(?:e|es|ed|ing)\b/.test(text)) &&
      /\b(?:beam|beams|rays|lightning|concussive energy)\b/.test(text)
    )
      modalities.push('nonburn-energy');
    if (
      flame &&
      (projected ||
        /\b(?:produc(?:e|es|ed|ing)|creat(?:e|es|ed|ing)|burn(?:s|ed|ing))\b/.test(text) ||
        /\bflames? from (?:the |his |her |their )?body\b/.test(text))
    )
      modalities.push('fire');
    if (
      (/\b(?:freeze|freezes|froze|freezing)\b/.test(text) &&
        /\b(?:enem(?:y|ies)|opponents?|targets?|people|person|consciousness|vibrations|area)\b/.test(
          text,
        )) ||
      (/\b(?:incapacitat(?:e|es|ed|ing)|render.{0,60}unconscious)\b/.test(text) &&
        /\b(?:area|surrounding|nearby|near him|near her)\b/.test(text))
    )
      modalities.push('area-control');
    return modalities.map((modality) => ({
      id: `${span.id}/${modality}`,
      sourceId: span.id,
      documentId: span.documentId,
      text: span.text,
      modality,
    }));
  });
}
