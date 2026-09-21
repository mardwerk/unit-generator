import type { z } from 'zod';
import type {
  AuthorResult,
  CheckedArtifact,
  DraftArtifact,
  PreparedRequest,
  ResolvedDocument,
  ModelUsage,
  ModelFailure,
  VisualReference,
} from '../core/index.js';
import type { requestFileSchema } from '../node/request-file.js';

/** Browser and server exchange core artifacts, never CLI output. */
type RequestFile = z.infer<typeof requestFileSchema>;
export type LabDocument = ResolvedDocument | RequestFile['documents'][number];
/** Editable inputs may be incomplete. Prepare validates their executable form. */
export type LabRequest = Omit<RequestFile, 'documents' | 'constraints' | 'progression'> & {
  documents: LabDocument[];
  constraints: unknown;
  progression: unknown;
};
export type LabArtifact = PreparedRequest | DraftArtifact | CheckedArtifact | AuthorResult;
export type LabStage = 'prepare' | 'draft' | 'check' | 'review';

/** Local library metadata. Provider settings never belong in a saved artifact. */
export interface LibraryEntry {
  id: string;
  savedAt: string;
  kind: LabArtifact['kind'];
  character: PreparedRequest['request']['character'];
  artifactId: string;
  portrait?: { url: string; caption: string; sourceUrl?: string };
}

export interface LibraryState {
  directory: string;
  entries: LibraryEntry[];
}

export interface LibrarySaveRequest {
  artifact: LabArtifact;
}

export interface LibraryLoadRequest {
  id: string;
}

export interface LibraryLoadResponse {
  artifact: LabArtifact;
}

export interface LibraryDeleteRequest {
  ids: string[];
}

export interface LibraryConfigureRequest {
  directory: string;
}

export interface LibraryIconsRequest {
  artifact: LabArtifact;
}

export interface LibraryIcon {
  key: string;
  path: string;
  dataUrl?: string;
  note?: string;
}

export interface LibraryIconsResponse {
  directory: string;
  icons: LibraryIcon[];
  portrait?: VisualReference;
}

export type InspectedInput =
  | { kind: 'request'; artifact: LabRequest }
  | { kind: 'prepared'; artifact: PreparedRequest }
  | { kind: 'draft'; artifact: DraftArtifact }
  | { kind: 'checked'; artifact: CheckedArtifact }
  | { kind: 'result'; artifact: AuthorResult };

export interface LabError {
  error: { code: string; message: string; usage?: ModelUsage; details?: ModelFailure };
}

export interface ProviderState {
  provider: 'openrouter' | 'codex';
  model: string;
  ready: boolean;
  images: { model: string; ready: boolean };
  ranking: { mode: 'auto' | 'typesafe' | 'openrouter' | 'off'; connection: string | null };
  message: string;
}

export interface IconGenerationResponse {
  icons: LibraryIconsResponse;
  model: string;
  usage?: ModelUsage;
}
