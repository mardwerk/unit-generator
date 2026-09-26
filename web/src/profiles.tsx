import { useEffect, useState } from 'react';
import { Copy, FolderOpen, Pencil, Play, Trash2 } from 'lucide-react';
import { bundledProfiles, profileProgression, type UnitProfile } from '../../core/index.js';
import type { ProfileEntry, ProfilesState } from '../contracts.js';
import { api } from './api.js';
import { Disclosure, Field } from './ui.js';

const bundled: ProfileEntry[] = bundledProfiles.map((profile) => ({ profile, builtIn: true }));

/** Bundled Profiles are always available; saved ones are read from the library folder. */
export function useProfiles(directory: string) {
  const [state, setState] = useState<ProfilesState>({ directory: '', profiles: bundled });
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
  }, [directory]);
  return {
    ...state,
    error,
    async save(profile: UnitProfile) {
      setState(await api<ProfilesState>('profiles/save', { profile }));
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

export function ProgressionGrid({ profile }: { profile: UnitProfile }) {
  const progression = profileProgression(profile);
  const tiers = Math.max(...progression.paths.map((path) => Math.max(...path.tiers)));
  return (
    <figure className="progression-figure">
      <table className="progression-grid" aria-label="Paths and tiers">
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
      <figcaption className="muted small">
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
    <dl className="profile-facts">
      {facts.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
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
    const profile = {
      schemaVersion: '1',
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
      className="profile-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={saving}>
        <Field label="ID">
          <input value={id} readOnly={!isNew} onChange={(e) => setId(e.target.value)} required />
        </Field>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Task">
          <textarea rows={4} value={task} onChange={(e) => setTask(e.target.value)} required />
        </Field>
        <Field label="Rules text">
          <textarea rows={10} value={rules} onChange={(e) => setRules(e.target.value)} required />
        </Field>
        <Field label="Mechanics Definition (JSON)">
          <textarea
            rows={12}
            spellCheck={false}
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
          />
        </Field>
        <p className="muted small">
          Saving runs the same checks as preparing a request. The numerical Engine supports three
          paths of five tiers only.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="primary">
            Save Profile
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
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
  onUse: (profile: UnitProfile) => void;
  onSave: (profile: UnitProfile) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [shownId, setShownId] = useState(selectedId ?? profiles[0]!.profile.id);
  const [editing, setEditing] = useState<{ profile: UnitProfile; isNew: boolean } | null>(null);
  const [actionError, setActionError] = useState('');
  const shown = profiles.find(({ profile }) => profile.id === shownId) ?? profiles[0]!;
  const isDefault = shown.builtIn && shown.profile.id === profiles[0]!.profile.id;
  function duplicate() {
    const id = unusedId(shown.profile.id, profiles);
    setEditing({
      isNew: true,
      profile: {
        ...structuredClone(shown.profile),
        id,
        name: `${shown.profile.name} (copy)`,
        rules: savedRules(id, shown.profile.rules.text),
      },
    });
  }
  return (
    <main className="library-view profiles-view">
      <div className="library-heading">
        <div>
          <h2>Profiles</h2>
          <p className="muted">
            A Profile holds the rules a unit is generated under. The default is read-only; copy it
            to make your own.
          </p>
        </div>
      </div>
      {directory && (
        <p className="library-directory">
          <FolderOpen size={14} />
          {directory}/profiles
        </p>
      )}
      {(error || actionError) && (
        <p className="error" role="alert">
          {actionError || error}
        </p>
      )}
      <div className="profiles-layout">
        <nav className="profile-list" aria-label="Profiles">
          {profiles.map(({ profile, builtIn }, index) => (
            <button
              type="button"
              key={profile.id}
              aria-current={profile.id === shown.profile.id ? 'true' : undefined}
              onClick={() => {
                setShownId(profile.id);
                setEditing(null);
                setActionError('');
              }}
            >
              <strong>{profile.name}</strong>
              <span className="muted small">
                {builtIn ? (index === 0 ? 'Default, read-only' : 'Built in, read-only') : 'Saved'}
                {profile.id === selectedId ? ' · used for new units' : ''}
              </span>
            </button>
          ))}
        </nav>
        <section className="profile-detail" aria-label={shown.profile.name}>
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
              <h3>
                {shown.profile.name} {isDefault && <span className="badge confirmed">Default</span>}
              </h3>
              <p className="muted small">Prices and stats are checked by the Engine.</p>
              <ProgressionGrid profile={shown.profile} />
              <Facts profile={shown.profile} />
              <Disclosure title="Task">
                <p>{shown.profile.task}</p>
              </Disclosure>
              <Disclosure title="Rules text">
                {shown.profile.rules.text.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </Disclosure>
              <div className="button-row">
                <button
                  type="button"
                  className="primary"
                  disabled={shown.profile.id === selectedId}
                  onClick={() => onUse(shown.profile)}
                >
                  <Play size={15} /> Use for new units
                </button>
                <button type="button" onClick={duplicate}>
                  <Copy size={15} /> Duplicate
                </button>
                {!shown.builtIn && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing({ profile: shown.profile, isNew: false })}
                    >
                      <Pencil size={15} /> Edit
                    </button>
                    <button
                      type="button"
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
                      <Trash2 size={15} /> Delete
                    </button>
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
