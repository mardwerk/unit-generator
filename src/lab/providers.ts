import { z } from 'zod';
import { DEFAULT_IMAGE_MODEL, OpenRouterImageClient } from '../node/image-generation.js';
import { createRoleRankingClient } from '../node/role-ranking.js';
import type { ModelClient } from '../core/index.js';
import { CodexModelClient } from '../node/codex.js';
import { OpenRouterModelClient, OPENROUTER_FREE_MODEL } from '../node/openrouter.js';
import type { ProviderState } from './contracts.js';

const roleModeSchema = z.enum(['auto', 'typesafe', 'openrouter', 'off']);
const settingsSchema = z.strictObject({
  provider: z.enum(['openrouter', 'codex']),
  apiKey: z.string().trim().min(1).max(4096).optional(),
  model: z.string().trim().min(1).max(200).optional(),
  roleMode: roleModeSchema.optional(),
  imageModel: z.string().trim().min(1).max(200).optional(),
});

export type ProviderSettings = z.infer<typeof settingsSchema>;

/** One local server's connection. Secrets are never part of authoring artifacts. */
export class LabProvider {
  #key: string;
  #provider: ProviderSettings['provider'] = 'openrouter';
  #model = OPENROUTER_FREE_MODEL;
  #client!: ModelClient;
  #imageModel = process.env.OPENROUTER_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  #roleMode = roleModeSchema.catch('auto').parse(process.env.UNIT_ROLE_PROVIDER ?? 'auto');
  #roleEnv = {
    TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
    TYPESAFE_MODEL: process.env.TYPESAFE_MODEL,
    OPENROUTER_JEV_MODEL: process.env.OPENROUTER_JEV_MODEL,
  };

  constructor(settings: ProviderSettings = { provider: 'openrouter' }) {
    this.#key = process.env.OPENROUTER_API_KEY?.trim() ?? '';
    this.configure(settings);
  }

  get client(): ModelClient {
    return this.#client;
  }

  get roleClient() {
    return createRoleRankingClient({
      env: {
        ...this.#roleEnv,
        OPENROUTER_API_KEY: this.#key,
        UNIT_ROLE_PROVIDER: this.#roleMode,
      },
    });
  }

  get imageClient() {
    return new OpenRouterImageClient({ apiKey: this.#key, model: this.#imageModel });
  }

  get state(): ProviderState {
    const ready = this.#provider === 'codex' || Boolean(this.#key);
    return {
      provider: this.#provider,
      model: this.#model,
      ready,
      ranking: { mode: this.#roleMode, connection: this.roleClient?.id ?? null },
      images: { model: this.#imageModel, ready: Boolean(this.#key) },
      message:
        this.#provider === 'codex'
          ? 'Uses your existing local Codex configuration and login.'
          : ready
            ? `Using ${this.#model}. The API key stays on this local server.`
            : 'Add an OpenRouter API key to use free models, or select Local Codex.',
    };
  }

  configure(input: unknown): ProviderState {
    const settings = settingsSchema.parse(input);
    const key = settings.apiKey ?? this.#key;
    const model =
      settings.model ??
      (settings.provider === 'openrouter'
        ? process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_FREE_MODEL
        : '');
    if (key && model.includes(key)) throw new Error('The model name must not contain an API key.');
    const imageModel = settings.imageModel ?? this.#imageModel;
    // Validate a configured image model without contacting the provider or generating an image.
    new OpenRouterImageClient({ apiKey: key, model: imageModel });
    const client =
      settings.provider === 'openrouter'
        ? new OpenRouterModelClient({ apiKey: key, model })
        : new CodexModelClient(model ? { model } : {});
    this.#key = key;
    this.#provider = settings.provider;
    this.#model = model;
    this.#client = client;
    this.#imageModel = imageModel;
    this.#roleMode = settings.roleMode ?? this.#roleMode;
    return this.state;
  }
}
