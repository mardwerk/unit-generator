import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { body, revalidate, VALIDATION_BODY_LIMIT } from '$lib/server/playground';
export const POST: RequestHandler = async ({ request }) =>
  json(await revalidate(request, await body(request, VALIDATION_BODY_LIMIT)));
