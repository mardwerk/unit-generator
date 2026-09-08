import type { RequestHandler } from './$types';
import { body, run } from '$lib/server/playground';
export const POST: RequestHandler = async ({ request }) => run(request, await body(request));
