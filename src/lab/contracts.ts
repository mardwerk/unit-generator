import type { z } from 'zod';
import type {
  AuthorResult,
  CheckedArtifact,
  DraftArtifact,
  PreparedRequest,
  ResolvedDocument,
} from '../core/index.js';
import type { requestFileSchema } from '../node/request-file.js';

/** Browser and server exchange core artifacts, never CLI output. */
type RequestFile = z.infer<typeof requestFileSchema>;
export type LabDocument = ResolvedDocument | RequestFile['documents'][number];
export type LabRequest = Omit<RequestFile, 'documents'> & { documents: LabDocument[] };
export type LabArtifact = PreparedRequest | DraftArtifact | CheckedArtifact | AuthorResult;
export type LabStage = 'prepare' | 'draft' | 'check' | 'review';

export type InspectedInput =
  | { kind: 'request'; artifact: LabRequest }
  | { kind: 'prepared'; artifact: PreparedRequest }
  | { kind: 'draft'; artifact: DraftArtifact }
  | { kind: 'checked'; artifact: CheckedArtifact }
  | { kind: 'result'; artifact: AuthorResult };

export interface LabError {
  error: { code: string; message: string };
}
