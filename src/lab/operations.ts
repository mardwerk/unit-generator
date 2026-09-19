import { z } from 'zod';
import {
  checkDraft,
  checkedArtifactSchema,
  draftArtifactSchema,
  draftUnit,
  prepareRequest,
  preparedSchema,
  requestSchema,
  resolvedDocumentSchema,
  resultSchema,
  reviewDraft,
  type ModelClient,
} from '../core/index.js';
import { verifyPrepared } from '../core/prepare.js';
import { requestFileSchema } from '../node/request-file.js';
import { loadDocument } from '../node/sources.js';
import { renderArtifact } from '../presentation/markdown.js';
import type { InspectedInput } from './contracts.js';

const inputSchema = requestFileSchema.extend({
  documents: z
    .array(z.union([resolvedDocumentSchema, requestFileSchema.shape.documents.element]))
    .min(1),
});

const payloadSchema = z.record(z.string(), z.unknown());

export async function inspectInput(input: unknown): Promise<InspectedInput> {
  const kind = payloadSchema.parse(input).kind;
  if (kind === 'prepared') {
    const artifact = preparedSchema.parse(input);
    await verifyPrepared(artifact);
    return { kind, artifact };
  }
  if (kind === 'draft') {
    const artifact = draftArtifactSchema.parse(input);
    await verifyPrepared(artifact.prepared);
    return { kind, artifact };
  }
  if (kind === 'checked') {
    const artifact = checkedArtifactSchema.parse(input);
    await verifyPrepared(artifact.draft.prepared);
    return { kind, artifact };
  }
  if (kind === 'result') {
    const artifact = resultSchema.parse(input);
    await verifyPrepared(artifact.prepared);
    return { kind, artifact };
  }
  return { kind: 'request', artifact: inputSchema.parse(input) };
}

async function prepareInput(input: unknown, signal: AbortSignal) {
  const request = inputSchema.parse(input);
  if (request.previousResultFile) {
    throw new Error('Import the previous Result in UnitLab instead of using previousResultFile.');
  }
  for (const document of request.documents) {
    if ('file' in document && document.file !== undefined) {
      throw new Error(
        `Upload or paste the text for ${document.id}. UnitLab cannot read a filesystem reference.`,
      );
    }
  }
  const documents = await Promise.all(
    request.documents.map((document) =>
      'origin' in document ? document : loadDocument(document, '.', { signal }),
    ),
  );
  signal.throwIfAborted();
  const { previousResultFile: _file, ...fields } = request;
  return prepareRequest(requestSchema.parse({ ...fields, documents }));
}

/** Each HTTP operation delegates directly to the same core used by the CLI. */
export async function executeLabOperation(
  operation: string,
  input: unknown,
  model: ModelClient,
  signal: AbortSignal,
): Promise<unknown> {
  const payload = payloadSchema.parse(input);
  signal.throwIfAborted();
  switch (operation) {
    case 'prepare':
      return prepareInput(payload.request, signal);
    case 'draft':
      return draftUnit(preparedSchema.parse(payload.prepared), model, { signal });
    case 'check':
      return checkDraft(draftArtifactSchema.parse(payload.draft));
    case 'review':
      return reviewDraft(checkedArtifactSchema.parse(payload.checked), model, { signal });
    case 'inspect':
      return inspectInput(payload.artifact);
    case 'render': {
      const request = z.strictObject({ artifact: z.unknown(), details: z.boolean().optional() });
      const { artifact, details } = request.parse(payload);
      return { markdown: renderArtifact(artifact, { details }) };
    }
    default:
      throw new Error('Unknown UnitLab operation.');
  }
}
