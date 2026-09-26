import { useState } from 'react';
import { ImagePlus } from 'lucide-react';
import type { UnitCandidate, VisualReference } from '../../api/contract.js';
import { KitIcon, type UnitIcons } from './icon-prompts.js';
import { safeUrl } from '../../ui/legacy.js';
import { rankedPortraits } from './portraits.js';

export function UnitPortrait({
  candidate,
  references,
  icons,
}: {
  candidate: UnitCandidate;
  references: VisualReference[];
  icons?: UnitIcons;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const preferred = icons?.response?.portrait;
  const reference = [...(preferred ? [preferred] : []), ...rankedPortraits(references)].find(
    (image) => !failed.includes(image.url),
  );
  if (reference)
    return (
      <a
        className="unit-portrait"
        href={safeUrl(reference.sourceUrl)}
        target="_blank"
        rel="noreferrer"
        title={reference.attribution ?? reference.caption}
        aria-label={`Image source for ${candidate.character.name}`}
      >
        <img
          src={safeUrl(reference.url)}
          alt={candidate.character.name}
          referrerPolicy="no-referrer"
          onError={() => setFailed((urls) => [...urls, reference.url])}
        />
      </a>
    );
  return icons ? (
    <KitIcon iconKey="unit-portrait" label={candidate.character.name} icons={icons} />
  ) : (
    <span className="unit-portrait" aria-label="No character image">
      <ImagePlus size={24} />
    </span>
  );
}
