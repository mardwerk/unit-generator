import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { body, revalidate } from '$lib/server/playground';
export const POST: RequestHandler = async ({ request }) =>
  json(await revalidate(await body(request)));
