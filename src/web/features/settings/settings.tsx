import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { KeyState, ProviderState } from '../../api/contract.js';
import type { GenerationLibrary } from '../library/library.js';
import { api } from '../../api/client.js';
import { Field, Disclosure, Modal } from '../../ui/legacy.js';

const keySources: Record<KeyState['source'], string> = {
  'env-file': 'from .env',
  env: 'from the OPENROUTER_API_KEY environment variable',
  settings: 'entered in Settings',
  none: '',
};

/** The provider state the server reports, refreshed whenever Settings closes. */
export function useProvider(settingsOpen: boolean): ProviderState | null {
  const [state, setState] = useState<ProviderState | null>(null);
  useEffect(() => {
    if (settingsOpen) return;
    let active = true;
    void api<ProviderState>('provider')
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [settingsOpen]);
  return state;
}

/** The masked key in use, visible without opening Settings. */
export function KeyStatus({ state, onOpen }: { state: ProviderState | null; onOpen: () => void }) {
  if (!state) return null;
  const { key } = state;
  const missing = !key.configured && state.provider === 'openrouter';
  return (
    <button
      id="key-status"
      type="button"
      className={`text-button key-status${missing ? ' missing' : ''}`}
      title={`${state.model || 'Codex configuration'} via ${
        state.provider === 'openrouter' ? 'OpenRouter' : 'Local Codex'
      }. ${
        key.configured
          ? `OpenRouter key ${keySources[key.source]}.`
          : 'No OpenRouter key configured.'
      } Open Settings to change them.`}
      onClick={onOpen}
    >
      <KeyRound size={13} aria-hidden="true" />
      <span className="sr-only">OpenRouter key: </span>
      <span className="key-status-text">{key.configured ? (key.hint ?? 'set') : 'No API key'}</span>
    </button>
  );
}

/** Keys are submitted to the local server and never included in saved authoring work. */
export function Settings({
  disabled,
  library,
  onClose,
}: {
  disabled: boolean;
  library: GenerationLibrary;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<ProviderState['provider']>('openrouter');
  const [model, setModel] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [key, setKey] = useState('');
  const [keyState, setKeyState] = useState<ProviderState['key'] | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Loading provider...');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(true);
  const [directory, setDirectory] = useState(library.directory);
  const [folderMessage, setFolderMessage] = useState('');
  useEffect(() => {
    let active = true;
    void api<ProviderState>('provider')
      .then((state) => {
        if (active) {
          setProvider(state.provider);
          setModel(state.model);
          setImageModel(state.images.model);
          setKeyState(state.key);
          setReady(state.ready);
          setMessage(state.message);
        }
      })
      .catch((error) => {
        if (active) setError(String(error));
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => setDirectory(library.directory), [library.directory]);
  async function saveProvider() {
    setPending(true);
    setError('');
    try {
      const state = await api<ProviderState>('provider', {
        provider,
        ...(imageModel.trim() ? { imageModel: imageModel.trim() } : {}),
        ...(key.trim() ? { apiKey: key.trim() } : {}),
        ...(model.trim() ? { model: model.trim() } : {}),
      });
      setKey('');
      setKeyState(state.key);
      setReady(state.ready);
      setMessage(state.message);
      setModel(state.model);
      setImageModel(state.images.model);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }
  async function saveFolder() {
    setPending(true);
    setError('');
    try {
      await library.configure(directory);
      setFolderMessage('Library folder changed. Existing files stay in their original folder.');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal title="Settings" id="settings-dialog" onClose={onClose}>
      <fieldset disabled={disabled || pending} id="provider-settings">
        <h3>Model provider</h3>
        <Field label="Connection">
          <select
            value={provider}
            onChange={(e) => {
              const value = e.target.value as ProviderState['provider'];
              setProvider(value);
              setModel(value === 'openrouter' ? 'openrouter/free' : '');
              setKey('');
              setReady(false);
              setMessage(
                value === 'openrouter'
                  ? 'Free models still require an API key.'
                  : 'Uses your existing local Codex login.',
              );
            }}
          >
            <option value="openrouter">OpenRouter</option>
            <option value="codex">Local Codex</option>
          </select>
        </Field>
        {
          <>
            <p id="current-key" className="muted small">
              {keyState?.configured
                ? `Current key: ${keyState.hint ?? 'set (too short to show a fragment)'} (${
                    keySources[keyState.source]
                  })`
                : 'No OpenRouter key configured.'}
            </p>
            <Field label="OpenRouter API key">
              <input
                type="password"
                autoComplete="off"
                value={key}
                placeholder={
                  keyState?.configured ? 'Enter a new key to replace it' : 'Enter an API key'
                }
                onChange={(e) => setKey(e.target.value)}
              />
            </Field>
          </>
        }
        <Disclosure title="Model">
          <Field label="Model name (optional)">
            <input
              value={model}
              placeholder={
                provider === 'openrouter' ? 'openrouter/free' : 'Use Codex configuration'
              }
              onChange={(e) => setModel(e.target.value)}
            />
          </Field>
        </Disclosure>
        <Disclosure title="Image generation">
          <Field label="OpenRouter image model">
            <input
              value={imageModel}
              onChange={(e) => setImageModel(e.target.value)}
              placeholder="meta/muse-image"
            />
          </Field>
          <p className="muted small">
            Muse Image is the default, listed at about $0.01 per image. Images use your OpenRouter
            key even when Unit drafting uses Codex. Every image requires confirmation from its icon
            dialog.
          </p>
        </Disclosure>
        <button type="button" onClick={() => void saveProvider()}>
          Save provider
        </button>
        <p className="muted small" role="status">
          {message}
        </p>
      </fieldset>
      <fieldset disabled={disabled || pending} className="folder-settings">
        <h3>Local library</h3>
        <Field label="Library folder">
          <input
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            spellCheck={false}
          />
        </Field>
        <p className="muted small">
          Completed generations are saved here automatically. Changing this folder does not move
          existing files.
        </p>
        <button type="button" onClick={() => void saveFolder()}>
          Use folder
        </button>
        <p className="muted small" role="status">
          {folderMessage}
        </p>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
