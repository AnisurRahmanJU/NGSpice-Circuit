/* link.js — clean links for the NGSpice site (no index.html, and no .html where the host allows it).
   Upload the SAME file to the public (root) folder AND to the simulator folder.
   Each page must load it with:   <script src="link.js"></script>
   (index.html, docs.html and manual.html get it from the updated site.js; simulator/index.html needs the line above before </body>)

   Works only on http/https (a double-clicked file:// page is left alone).
   1. Links to  .../index.html  -> .../      simulator.html -> simulator/
   2. The address bar  /simulator/index.html -> /simulator/
   3. In the full simulator ?topic=..&ex=.. is removed from the address bar after it has been used
   4. If the host serves pages without .html (GitHub Pages does; Vercel does with cleanUrls), it is detected
      automatically and  docs.html -> docs,  manual.html -> manual  in links and in the address bar.
      If the host does not support it, .html is kept so nothing breaks.
*/
(function () {
  if (!/^https?:$/.test(location.protocol)) return;
  if (window.__linkjs) return; window.__linkjs = 1;

  var stripHtml = false;   /* switched on after the host test in step 4 */

  function sameSite(h) {
    if (!h) return false;
    if (/^(mailto:|tel:|javascript:|data:|#)/i.test(h)) return false;
    if (/^(https?:)?\/\//i.test(h)) { try { return new URL(h, location.href).origin === location.origin; } catch (e) { return false; } }
    return true;
  }
  function clean(h) {
    if (!sameSite(h)) return h;
    var n = h.replace(/(^|\/)index\.html(?=$|[?#])/i, '$1')
             .replace(/(^|\/)simulator\.html(?=$|[?#])/i, '$1simulator/');
    if (stripHtml) n = n.replace(/\.html(?=$|[?#])/i, '');
    if (n === '' || n.charAt(0) === '?' || n.charAt(0) === '#') n = './' + n;
    return n;
  }
  function fixOne(a) { var h = a.getAttribute('href'), n = clean(h); if (n !== h) a.setAttribute('href', n); }
  function fixLinks(root) { var l = root.querySelectorAll ? root.querySelectorAll('a[href]') : []; for (var i = 0; i < l.length; i++) fixOne(l[i]); }
  fixLinks(document);
  try {   /* links added later by scripts (the menu from site.js, the Open button in docs) */
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === 'attributes') fixOne(m.target);
        else m.addedNodes.forEach(function (x) { if (x.nodeType === 1) { if (x.matches && x.matches('a[href]')) fixOne(x); fixLinks(x); } });
      });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  } catch (e) {}

  /* address bar */
  var embedded = /[?&]embed=1/.test(location.search);
  function setAddress(path, keepQuery) { try { history.replaceState(history.state, '', path + (keepQuery ? location.search : '') + location.hash); } catch (e) {} }
  function cleanAddress() {
    var p = location.pathname;
    if (/\/index\.html$/i.test(p)) p = p.replace(/index\.html$/i, '');
    else if (stripHtml && /\.html$/i.test(p)) p = p.replace(/\.html$/i, '');
    if (p !== location.pathname) setAddress(p, true);
  }
  cleanAddress();

  /* hide ?topic=&ex= in the full simulator once it has read them */
  if (!embedded && /[?&](topic|ex)=/.test(location.search)) {
    window.addEventListener('load', function () { setTimeout(function () { setAddress(location.pathname, false); }, 1500); });
  }

  /* 4: does this host serve /docs for docs.html ?  (tested once, result remembered for the session) */
  function applyStrip() { stripHtml = true; fixLinks(document); cleanAddress(); }
  try { var saved = sessionStorage.getItem('linkjs_nohtml'); if (saved === '1') { applyStrip(); return; } if (saved === '0') return; } catch (e) {}
  var root = /\/simulator(\/|$)/i.test(location.pathname) ? '../' : './';
  try {
    fetch(new URL(root + 'docs', location.href), { method: 'GET', cache: 'no-store', redirect: 'manual' })
      .then(function (r) {
        var ok = r.status === 200 && /text\/html/i.test(r.headers.get('content-type') || '');
        return ok ? r.text() : '';
      })
      .then(function (t) {
        var ok = /<title>[^<]*Docs/i.test(t);   /* it really is the docs page, not a 404 / fallback page */
        try { sessionStorage.setItem('linkjs_nohtml', ok ? '1' : '0'); } catch (e) {}
        if (ok) applyStrip();
      }).catch(function () {});
  } catch (e) {}
})();
