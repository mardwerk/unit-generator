import { useState } from 'react';
import { ImagePlus } from 'lucide-react';
import type { UnitCandidate, VisualReference } from '../../api/contract.js';
import { KitIcon, type UnitIcons } from './icon-prompts.js';
import { safeUrl } from '../../ui/utils.js';
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
        className="flex size-24 shrink-0 items-center justify-center"
        href={safeUrl(reference.sourceUrl)}
        target="_blank"
        rel="noreferrer"
        title={reference.attribution ?? reference.caption}
        aria-label={`Image source for ${candidate.character.name}`}
      >
        <img
          className="size-full rounded-lg object-cover object-[center_20%]"
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
    <span
      className="flex size-24 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
      aria-label="No character image"
    >
      <ImagePlus className="size-6" />
    </span>
  );
}
