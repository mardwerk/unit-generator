import { useEffect, useState } from 'react';
import { Copy, FolderOpen, Pencil, Play, Trash2 } from 'lucide-react';
import type {
  ProfileEntry,
  ProfilesState,
  Progression,
  StatusEffect,
  Term,
  UnitProfile,
  Vocabulary,
} from '../../api/contract.js';
import { api } from '../../api/client.js';
import { Alert } from '../../ui/alert.js';
import { Badge } from '../../ui/badge.js';
import { Button } from '../../ui/button.js';
import { Disclosure } from '../../ui/disclosure.js';
import { Field } from '../../ui/field.js';
import { Input, Textarea } from '../../ui/input.js';
import { cn } from '../../ui/utils.js';

/** The server lists the bundled Profiles first, then the saved ones from its Profiles folder. */
export function useProfiles() {
  const [state, setState] = useState<ProfilesState>({ directory: '', profiles: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<ProfilesState>('profiles')
      .then((next) => {
        if (active) {
          setState(next);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, []);
  return {
    ...state,
    error,
    async save(profile: UnitProfile) {
      const next = await api<ProfilesState>('profiles/save', { profile });
      setState(next);
      return next;
    },
    async remove(id: string) {
      setState(await api<ProfilesState>('profiles/delete', { id }));
    },
  };
}

function unusedId(base: string, profiles: ProfileEntry[]): string {
  const stem = `${base.replace(/-copy(-[0-9]+)?$/, '')}-copy`.slice(0, 56);
  let id = stem;
  for (let n = 2; profiles.some(({ profile }) => profile.id === id); n++) id = `${stem}-${n}`;
  return id;
}

/** A saved Profile owns its rules document, named after the Profile. */
function savedRules(id: string, text: string): UnitProfile['rules'] {
  return {
    id: `profile:${id}`,
    kind: 'rules',
    text,
    origin: {
      location: `mardwerk-unit:profile:${id}`,
      access: 'supplied',
      note: 'Saved Profile rules.',
    },
  };
}

export function ProgressionGrid({ progression }: { progression: Progression }) {
  const tiers = Math.max(...progression.paths.map((path) => Math.max(...path.tiers)));
  return (
    <figure className="my-3">
      <table
        className="border-collapse text-[13px] [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1 [&_td]:text-center [&_td]:text-primary [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1 [&_th]:font-medium [&_th]:text-muted-foreground"
        aria-label="Paths and tiers"
      >
        <thead>
          <tr>
            <th scope="col">Tier</th>
            {progression.paths.map((path, index) => (
              <th scope="col" key={path.id}>
                Path {index + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: tiers }, (_, index) => index + 1).map((tier) => (
            <tr key={tier}>
              <th scope="row">T{tier}</th>
              {progression.paths.map((path) => (
                <td key={path.id}>{path.tiers.includes(tier) ? '●' : ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="mt-2 text-xs text-muted-foreground">
        Buy up to {progression.maxActivePaths} of {progression.paths.length} paths
        {progression.maxPathsAboveTier
          ? `; at most ${progression.maxPathsAboveTier.count} above T${progression.maxPathsAboveTier.tier}`
          : ''}
        .
      </figcaption>
    </figure>
  );
}

function Facts({ profile }: { profile: UnitProfile }) {
  const facts: [string, string][] = [];
  const mechanics = profile.mechanicsDefinition;
  const scale = mechanics.profile.referenceScale;
  const policy = mechanics.profile.designPolicy;
  facts.push(['Currency', mechanics.profile.currency]);
  if (scale) {
    facts.push([scale.healthResource, `${scale.startingHealth} to start`]);
    facts.push(['Base unit', `${scale.baseCost} ${mechanics.profile.currency}`]);
    facts.push([
      'Base attack',
      `${scale.baseDamage} damage, every ${scale.baseIntervalSeconds} s, range ${scale.baseRange}, ${scale.basePierce} pierce`,
    ]);
    facts.push(['Upgrade prices', scale.incrementalUpgradeCosts.join(', ')]);
  }
  facts.push([
    'Changes per upgrade',
    `${mechanics.profile.earlyTierMaxChanges} early, ${mechanics.profile.maxChangesPerTier} later`,
  ]);
  if (policy)
    facts.push([
      'Manual boost',
      policy.manualAbilityPath ? `${policy.manualAbilityPath} only` : 'not allowed',
    ]);
  return (
    <dl className="my-4 grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-[max-content_1fr]">
      {facts.map(([term, value]) => (
        <div className="contents" key={term}>
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="[overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const effectKinds: Record<StatusEffect['kind'], string> = {
  moveSpeed: 'Movement speed',
  damageOverTime: 'Damage over time',
  disable: 'Disable',
  damageTaken: 'Damage taken',
  custom: 'Custom',
};

const refreshModes: Record<StatusEffect['stacking']['refresh'], string> = {
  reset: 'each hit resets every stack',
  extend: 'each hit extends the duration',
  independent: 'each stack keeps its own duration',
};

const number = (value: number) => Number(value.toFixed(4)).toString();

function names(ids: string[], terms: Term[]): string {
  return ids.map((id) => terms.find((term) => term.id === id)?.name || id).join(', ');
}

/** Bounds at the Definition's stat ceiling are shown as no limit. */
function effectBounds(effect: StatusEffect, ceiling: number): string {
  const magnitude = effect.magnitude;
  let strength = 'No magnitude';
  if (magnitude) {
    const unit = magnitude.unit === 'percent' ? '%' : ` ${magnitude.unit}`;
    strength =
      magnitude.max >= ceiling
        ? `Any positive ${magnitude.unit === 'percent' ? 'percent' : magnitude.unit}`
        : `${number(magnitude.min)} to ${number(magnitude.max)}${unit}`;
  }
  const duration =
    effect.maxSeconds >= ceiling ? 'no duration limit' : `up to ${number(effect.maxSeconds)} s`;
  return `${strength}; ${duration}`;
}

function effectStacking(effect: StatusEffect): string {
  const { maxStacks, refresh, maxMagnitude } = effect.stacking;
  let text =
    maxStacks === 1 ? 'Does not stack' : `Up to ${maxStacks} stacks; ${refreshModes[refresh]}`;
  if (maxMagnitude !== null) text += `; at most ${number(maxMagnitude)} combined`;
  return text;
}

/** A version 2 Definition's status effects, damage types, targeting and detection. */
function VocabularyFacts({ vocabulary, ceiling }: { vocabulary: Vocabulary; ceiling: number }) {
  const properties = vocabulary.enemyProperties;
  const damageTypes = vocabulary.damageTypes.map((type) =>
    type.ineffectiveAgainst.length
      ? `${type.name} (not against ${names(type.ineffectiveAgainst, properties)})`
      : type.name,
  );
  return (
    <section aria-labelledby="profile-effects" className="my-4">
      <h3 id="profile-effects" className="mb-2 text-sm font-semibold">
        Status effects
      </h3>
      {vocabulary.statusEffects.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">This Profile defines no status effects.</p>
      ) : (
        <ul className="grid gap-2.5 text-[13px]">
          {vocabulary.statusEffects.map((effect) => (
            <li key={effect.id} className="rounded-md border border-border px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{effect.name}</span>
                <Badge variant="outline">{effectKinds[effect.kind]}</Badge>
                {effect.aliases.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    also {effect.aliases.join(', ')}
                  </span>
                )}
              </div>
              {effect.description && <p className="my-1">{effect.description}</p>}
              <p className="text-xs text-muted-foreground">
                {effectBounds(effect, ceiling)}. {effectStacking(effect)}.
                {effect.immune.length > 0 && ` Immune: ${names(effect.immune, properties)}.`}
              </p>
            </li>
          ))}
        </ul>
      )}
      <dl className="my-4 grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-[max-content_1fr]">
        {(
          [
            ['Damage types', damageTypes.join('; ')],
            ['Targeting', vocabulary.targeting.map((term) => term.name).join(', ')],
            ['Detection', vocabulary.detection.map((term) => term.name).join(', ') || 'none'],
            ['Enemy properties', properties.map((term) => term.name).join(', ') || 'none'],
          ] as const
        ).map(([term, value]) => (
          <div className="contents" key={term}>
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="[overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProfileEditor({
  initial,
  isNew,
  onSave,
  onCancel,
}: {
  initial: UnitProfile;
  isNew: boolean;
  onSave: (profile: UnitProfile) => Promise<void>;
  onCancel: () => void;
}) {
  const [id, setId] = useState(initial.id);
  const [name, setName] = useState(initial.name);
  const [task, setTask] = useState(initial.task);
  const [rules, setRules] = useState(initial.rules.text);
  const [definition, setDefinition] = useState(
    JSON.stringify(initial.mechanicsDefinition, null, 2),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    setError('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(definition);
    } catch {
      setError('The mechanics Definition must be valid JSON.');
      return;
    }
    // A Profile's contract version follows its Definition's version.
    const version = (parsed as { version?: unknown } | null)?.version === '2' ? '2' : '1';
    const profile = {
      schemaVersion: version,
      kind: 'profile',
      id: id.trim(),
      name,
      task,
      rules: savedRules(id.trim(), rules),
      mechanicsDefinition: parsed,
    } as UnitProfile;
    setSaving(true);
    try {
      await onSave(profile);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      id="profile-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset className="min-w-0" disabled={saving}>
        <Field label="ID">
          <Input value={id} readOnly={!isNew} onChange={(e) => setId(e.target.value)} required />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Task">
          <Textarea rows={4} value={task} onChange={(e) => setTask(e.target.value)} required />
        </Field>
        <Field label="Rules text">
          <Textarea rows={10} value={rules} onChange={(e) => setRules(e.target.value)} required />
        </Field>
        <Field label="Mechanics Definition (JSON)">
          <Textarea
            className="font-mono text-xs"
            rows={12}
            spellCheck={false}
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          Saving runs the same checks as preparing a request. The numerical Engine supports three
          paths of five tiers only.
        </p>
        {error && <Alert>{error}</Alert>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary">
            Save Profile
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      </fieldset>
    </form>
  );
}

export function ProfilesView({
  profiles,
  directory,
  error,
  selectedId,
  onUse,
  onSave,
  onDelete,
}: {
  profiles: ProfileEntry[];
  directory: string;
  error: string;
  selectedId: string | null;
  onUse: (entry: ProfileEntry) => void;
  onSave: (profile: UnitProfile) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [shownId, setShownId] = useState(selectedId ?? profiles[0]?.profile.id ?? '');
  const [editing, setEditing] = useState<{ profile: UnitProfile; isNew: boolean } | null>(null);
  const [actionError, setActionError] = useState('');
  const shown = profiles.find(({ profile }) => profile.id === shownId) ?? profiles[0];
  if (!shown)
    return (
      <main className="mx-auto max-w-[1400px] px-[18px] py-6 sm:px-8 sm:py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Profiles</h2>
        {error ? (
          <Alert>{error}</Alert>
        ) : (
          <p className="text-muted-foreground">Loading Profiles...</p>
        )}
      </main>
    );
  const isDefault = shown.builtIn && shown.profile.id === profiles[0]!.profile.id;
  const source = shown.profile;
  const duplicate = () => {
    const id = unusedId(source.id, profiles);
    setEditing({
      isNew: true,
      profile: {
        ...structuredClone(source),
        id,
        name: `${source.name} (copy)`,
        rules: savedRules(id, source.rules.text),
      },
    });
  };
  return (
    <main className="mx-auto max-w-[1400px] px-[18px] py-6 sm:px-8 sm:py-10">
      <h2 className="text-2xl font-semibold tracking-tight">Profiles</h2>
      <p className="mt-1 text-muted-foreground">
        A Profile holds the rules a unit is generated under. Built-in Profiles are read-only; copy
        one to make your own.
      </p>
      {directory && (
        <p className="mt-4 mb-6 flex items-center gap-2 font-mono text-xs [overflow-wrap:anywhere] text-muted-foreground">
          <FolderOpen className="size-3.5" />
          {directory}
        </p>
      )}
      {(error || actionError) && <Alert>{actionError || error}</Alert>}
      <div className="grid items-start gap-5 md:grid-cols-[minmax(180px,260px)_1fr]">
        <nav className="flex flex-col gap-1.5" aria-label="Profiles">
          {profiles.map(({ profile, builtIn }, index) => (
            <button
              type="button"
              key={profile.id}
              aria-current={profile.id === shown.profile.id ? 'true' : undefined}
              className={cn(
                'flex cursor-pointer flex-col items-start gap-0.5 rounded-lg border border-border px-3 py-2.5 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60',
                profile.id === shown.profile.id && 'border-primary bg-accent',
              )}
              onClick={() => {
                setShownId(profile.id);
                setEditing(null);
                setActionError('');
              }}
            >
              <strong className="text-[13px] font-semibold">{profile.name}</strong>
              <span className="text-xs text-muted-foreground">
                {builtIn ? (index === 0 ? 'Default, read-only' : 'Built in, read-only') : 'Saved'}
                {profile.id === selectedId ? ' · used for new units' : ''}
              </span>
            </button>
          ))}
        </nav>
        <section
          className="min-w-0 rounded-xl border border-border bg-card p-5"
          aria-label={shown.profile.name}
        >
          {editing ? (
            <ProfileEditor
              key={editing.profile.id}
              initial={editing.profile}
              isNew={editing.isNew}
              onCancel={() => setEditing(null)}
              onSave={async (profile) => {
                await onSave(profile);
                setShownId(profile.id);
                setEditing(null);
              }}
            />
          ) : (
            <>
              <h3 className="flex items-center gap-2 text-base font-semibold">
                {shown.profile.name} {isDefault && <Badge variant="success">Default</Badge>}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Prices and stats are checked by the Engine.
              </p>
              <ProgressionGrid progression={shown.progression} />
              <Facts profile={shown.profile} />
              {shown.profile.mechanicsDefinition.vocabulary && (
                <VocabularyFacts
                  vocabulary={shown.profile.mechanicsDefinition.vocabulary}
                  ceiling={shown.profile.mechanicsDefinition.profile.maxStatValue}
                />
              )}
              <Disclosure title="Task">
                <p>{shown.profile.task}</p>
              </Disclosure>
              <Disclosure title="Rules text">
                {shown.profile.rules.text.split(/\n{2,}/).map((paragraph, index) => (
                  <p className="my-2" key={index}>
                    {paragraph}
                  </p>
                ))}
              </Disclosure>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  disabled={shown.profile.id === selectedId}
                  onClick={() => onUse(shown)}
                >
                  <Play className="size-[15px]" /> Use for new units
                </Button>
                <Button onClick={duplicate}>
                  <Copy className="size-[15px]" /> Duplicate
                </Button>
                {!shown.builtIn && (
                  <>
                    <Button onClick={() => setEditing({ profile: shown.profile, isNew: false })}>
                      <Pencil className="size-[15px]" /> Edit
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (!window.confirm(`Delete the Profile "${shown.profile.name}"?`)) return;
                        setActionError('');
                        void onDelete(shown.profile.id)
                          .then(() => setShownId(profiles[0]!.profile.id))
                          .catch((reason: unknown) =>
                            setActionError(
                              reason instanceof Error ? reason.message : String(reason),
                            ),
                          );
                      }}
                    >
                      <Trash2 className="size-[15px]" /> Delete
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
