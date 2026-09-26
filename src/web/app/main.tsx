// The nonce must be registered before any component injects a <style>.
import '../ui/nonce.js';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../ui/tooltip.js';
import { App } from './app.js';

// Compatibility with earlier bookmarked launch links. The page supplies a fresh session.
if (new URLSearchParams(location.hash.slice(1)).has('token')) {
  history.replaceState(null, '', location.pathname + location.search);
}
createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <App />
  </TooltipProvider>,
);
