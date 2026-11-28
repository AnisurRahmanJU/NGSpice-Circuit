/* link.js — clean directory links for the NGSpice site.
   Upload the SAME file to: the public (root) folder AND the simulator folder.
   Add this line to every page (index.html, docs.html, manual.html and simulator/index.html):
       <script src="link.js"></script>
   (put it just before </body>; the same line works in both folders because each folder has its own copy)

   What it does (only on http/https; on a double-clicked file:// page it does nothing so local testing still works):
   1. Every link to  .../index.html  becomes  .../   (for example simulator/index.html -> simulator/, ../index.html -> ../)
   2. Every link to  simulator.html  becomes  simulator/
   3. If someone opens  .../index.html  the address bar is changed to the directory  (.../simulator/index.html -> .../simulator/)
   4. In the full simulator the  ?topic=..&ex=..  part is removed from the address bar after the page has used it
      (not inside the docs circuit windows, which need ?embed=1)
*/
(function () {
  if (!/^https?:$/.test(location.protocol)) return;

  /* ---------- 1 + 2: clean link text ---------- */
  function clean(h) {
    if (!h || /^(https?:|mailto:|tel:|javascript:|data:|#)/i.test(h)) {
      /* absolute links to this same site are cleaned too */
      if (!/^https?:/i.test(h || '')) return h;
      try { var u = new URL(h); if (u.origin !== location.origin) return h; } catch (e) { return h; }
    }
    var n = h.replace(/(^|\/)index\.html(?=$|[?#])/i, '$1')
             .replace(/(^|\/)simulator\.html(?=$|[?#])/i, '$1simulator/');
    if (n === '' || n.charAt(0) === '?' || n.charAt(0) === '#') n = './' + n;
    return n;
  }
  function fixLinks(root) {
    var list = (root.querySelectorAll ? root.querySelectorAll('a[href]') : []);
    for (var i = 0; i < list.length; i++) {
      var a = list[i], h = a.getAttribute('href'), n = clean(h);
      if (n !== h) a.setAttribute('href', n);
    }
  }
  fixLinks(document);
  /* links added later by scripts (site.js builds the menu, docs.html changes the Open button) */
  try {
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === 'attributes') { var h = m.target.getAttribute('href'), n = clean(h); if (n !== h) m.target.setAttribute('href', n); }
        else m.addedNodes.forEach(function (x) { if (x.nodeType === 1) { if (x.matches && x.matches('a[href]')) { var h = x.getAttribute('href'), n = clean(h); if (n !== h) x.setAttribute('href', n); } fixLinks(x); } });
      });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  } catch (e) {}

  /* ---------- 3: clean the address bar ---------- */
  var embedded = /[?&]embed=1/.test(location.search);
  function setAddress(path, keepQuery) {
    try { history.replaceState(history.state, '', path + (keepQuery ? location.search : '') + location.hash); } catch (e) {}
  }
  if (/\/index\.html$/i.test(location.pathname)) {
    setAddress(location.pathname.replace(/index\.html$/i, ''), true);
  }

  /* ---------- 4: hide ?topic=&ex= in the full simulator once the page has read it ---------- */
  if (!embedded && /[?&](topic|ex)=/.test(location.search)) {
    window.addEventListener('load', function () {
      setTimeout(function () { setAddress(location.pathname, false); }, 1500);
    });
  }
})();
