import { setNonce } from 'get-nonce';

/**
 * The page's style nonce. The server allows only its own stylesheet and
 * <style> elements carrying this nonce; component libraries that inject
 * styles (scroll locking, select viewports) must use it.
 */
export const styleNonce =
  document.querySelector<HTMLMetaElement>('meta[name="unitlab-style-nonce"]')?.content || undefined;
if (styleNonce) setNonce(styleNonce);
