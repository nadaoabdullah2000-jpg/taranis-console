/* Registers the service worker. This lives in its own file rather than inline
   in the HTML because the page's Content-Security-Policy allows scripts only
   from 'self' — an inline <script> block would be refused. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // No service worker means no install prompt, but the console itself
      // still works perfectly in a browser tab. Not worth an error message.
    });
  });
}
