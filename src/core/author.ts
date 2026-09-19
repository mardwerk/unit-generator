import type { ModelClient } from './model.js';
import { prepareRequest } from './prepare.js';
import { draftUnit, type OperationOptions } from './draft.js';
import { checkDraft } from './check.js';
import { reviewDraft } from './review.js';
import type { AuthorResult } from './schemas.js';
/** One revision and a fresh semantic review. Further correction is an explicit request. */
export async function authorUnit(
  request: unknown,
  model: ModelClient,
  options: OperationOptions = {},
): Promise<AuthorResult> {
  const prepared = await prepareRequest(request);
  const draft = await draftUnit(prepared, model, options);
  const checked = await checkDraft(draft);
  return reviewDraft(checked, model, options);
}
