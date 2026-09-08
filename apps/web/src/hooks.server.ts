import type { Handle } from '@sveltejs/kit';
import { THEME_COOKIE, resolveTheme } from '@mardwerk/ui';
import { guard } from '$lib/server/playground';
export const handle: Handle = async ({ event, resolve }) => {
  guard(event.request, event.url);
  const theme = resolveTheme(event.cookies.get(THEME_COOKIE));
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%mardwerk.theme%', theme)
  });
  response.headers.set('cache-control', 'no-store');
  return response;
};
