/* Registers the service worker and keeps the app current.

   Two problems this solves. First, an installed app caches its own code,
   so a deploy does not reach anyone until they hard-refresh — and nobody
   knows to. Second, a phone left open for days holds a stale page.

   So: check for a new version every five minutes and whenever the app is
   brought back to the foreground. When one is found, say so and let the
   person choose the moment — reloading underneath someone mid-sentence in
   the Ask tab would lose what they were typing.

   This lives in its own file rather than inline in the HTML because the
   page's Content-Security-Policy allows scripts only from 'self'. */

if ('serviceWorker' in navigator) {
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {

      const check = () => { reg.update().catch(() => {}); };

      // Every five minutes, and the moment someone comes back to the tab.
      setInterval(check, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('online', check);

      reg.addEventListener('updatefound', () => {
        const fresh = reg.installing;
        if (!fresh) return;
        fresh.addEventListener('statechange', () => {
          // installed + an existing controller means this is an update,
          // not the very first install.
          if (fresh.state === 'installed' && navigator.serviceWorker.controller) {
            offer(() => fresh.postMessage({ type: 'SKIP_WAITING' }));
          }
        });
      });

      // A worker may already be waiting from a previous visit.
      if (reg.waiting && navigator.serviceWorker.controller) {
        offer(() => reg.waiting.postMessage({ type: 'SKIP_WAITING' }));
      }
    }).catch(() => {
      // No service worker means no install prompt and no auto-update, but
      // the console itself works perfectly in a browser tab.
    });
  });

  function offer(apply) {
    if (document.getElementById('newver')) return;
    const bar = document.createElement('div');
    bar.id = 'newver';
    const label = document.createElement('span');
    label.textContent = 'A new version is ready.';
    const btn = document.createElement('button');
    btn.textContent = 'Reload';
    btn.addEventListener('click', () => { btn.textContent = 'Reloading\u2026'; apply(); });
    bar.appendChild(label);
    bar.appendChild(btn);
    document.body.appendChild(bar);
    // If it is ignored, take it on the next natural reload rather than nagging.
  }
}
