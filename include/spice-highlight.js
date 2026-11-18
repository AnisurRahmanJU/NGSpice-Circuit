/* ============================================================
   SPICE SYNTAX HIGHLIGHTING — Netlist tab + Draw CirSpice editor.
   Load AFTER analysis.js:  <script src="spice-highlight.js"></script>
   Colors follow the existing theme (html[data-theme="dark|light"]),
   so no theme hook is needed. No other file is modified.
============================================================ */
(function(){
  if (window.__spiceHlLoaded) return; window.__spiceHlLoaded = true;

  /* ---------- tokenizer ---------- */
  const esc  = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const span = (c, s) => s ? '<span class="hl-' + c + '">' + esc(s) + '</span>' : '';
  const NUM  = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?[a-zµμ]*$/i;
  const KW   = /^(dc|ac|sin|pulse|pwl|on|off|ic|vf|wiper|red|green|blue|yellow|orange|amber|white)$/i;
  const WS   = /^\s+$/, PUN = /^[(),=]$/;

  function elKind(name){
    if (/^LED/i.test(name)) return 'd';
    switch (name[0].toUpperCase()){
      case 'R': case 'C': case 'L': return 'p';   // passives
      case 'V': case 'I':           return 's';   // sources
      case 'D':                     return 'd';   // diodes / LEDs
      default:                      return 'x';   // switch, other
    }
  }
  function nextWord(parts, k){
    for (let j = k + 1; j < parts.length; j++) if (parts[j] && !WS.test(parts[j])) return parts[j];
    return '';
  }

  function hlLine(line){
    if (/^\s*\*/.test(line)) return span('c', line);                 // full-line comment
    let code = line, cm = '';
    const si = line.indexOf(';');
    if (si >= 0){ code = line.slice(0, si); cm = line.slice(si); }   // inline comment

    const parts = code.split(/(\s+|[(),=])/);
    const words = parts.filter(p => p && !WS.test(p) && !PUN.test(p));
    const first = words[0] || '';
    const isDir = first[0] === '.';
    const isCont = first[0] === '+';
    const diodeLike = /^(D|LED)/i.test(first);
    const isRV = /^RV/i.test(first) && words.length >= 5;
    let wi = 0, gotModel = false, out = '';

    for (let k = 0; k < parts.length; k++){
      let p = parts[k];
      if (!p) continue;
      if (WS.test(p)){ out += p; continue; }
      if (p === '=') { out += span('op', p); continue; }
      if (PUN.test(p)){ out += span('pun', p); continue; }

      if (wi === 0 && isCont){                                        // "+" continuation marker
        out += span('op', '+'); p = p.slice(1);
        if (!p){ wi++; continue; }
      }
      const next = nextWord(parts, k);
      let cls;
      if (wi === 0 && !isCont)                  cls = isDir ? 'dir' : 'el-' + elKind(p);
      else if (isDir && wi === 1 && /^\.model$/i.test(first)) cls = 'mdl';
      else if (isDir && wi === 2 && /^\.model$/i.test(first)) cls = 'kw';
      else if (!isDir && !isCont && (wi === 1 || wi === 2 || (isRV && wi === 3)))
                                                cls = /^(0|gnd)$/i.test(p) ? 'gnd' : 'node';
      else if (next === '=')                    cls = 'key';
      else if (NUM.test(p))                     cls = 'num';
      else if (KW.test(p))                      cls = 'kw';
      else if (diodeLike && !gotModel)          { cls = 'mdl'; gotModel = true; }
      else                                      cls = 'id';
      out += cls === 'id' ? esc(p) : span(cls, p);
      wi++;
    }
    return out + span('c', cm);
  }
  const highlight = text => text.replace(/\r/g, '').split('\n').map(hlLine).join('\n');

  /* ---------- CSS (colors per theme) ---------- */
  const css = document.createElement('style');
  css.textContent = `
    :root{
      --hl-c:#6f7b91; --hl-dir:#c792ea; --hl-el-p:#35d0c0; --hl-el-s:#59c97a; --hl-el-d:#f08a3c; --hl-el-x:#4a9ce0;
      --hl-node:#8ab4ff; --hl-gnd:#e2555a; --hl-num:#eab24d; --hl-kw:#c792ea; --hl-key:#9aa4b8;
      --hl-mdl:#f5e663; --hl-pun:#7d889f; --hl-op:#9aa4b8;
    }
    html[data-theme="light"]{
      --hl-c:#7a8497; --hl-dir:#8e3fc0; --hl-el-p:#0b8a7d; --hl-el-s:#2b8a46; --hl-el-d:#c25a0e; --hl-el-x:#1f6fc0;
      --hl-node:#2457b8; --hl-gnd:#c0262c; --hl-num:#a06a00; --hl-kw:#8e3fc0; --hl-key:#55607a;
      --hl-mdl:#8a6d00; --hl-pun:#7a8497; --hl-op:#55607a;
    }
    .hl-c{color:var(--hl-c); font-style:italic;}
    .hl-dir{color:var(--hl-dir); font-weight:600;}
    .hl-el-p{color:var(--hl-el-p); font-weight:600;}
    .hl-el-s{color:var(--hl-el-s); font-weight:600;}
    .hl-el-d{color:var(--hl-el-d); font-weight:600;}
    .hl-el-x{color:var(--hl-el-x); font-weight:600;}
    .hl-node{color:var(--hl-node);}
    .hl-gnd{color:var(--hl-gnd); font-weight:600;}
    .hl-num{color:var(--hl-num);}
    .hl-kw{color:var(--hl-kw);}
    .hl-key{color:var(--hl-key);}
    .hl-mdl{color:var(--hl-mdl);}
    .hl-pun{color:var(--hl-pun);}
    .hl-op{color:var(--hl-op);}

    #netlist-out{white-space:pre-wrap; tab-size:4;}

    /* Draw CirSpice: transparent textarea on top of a highlighted layer */
    #pane-spice .hl-wrap{position:relative; flex:1 1 auto; min-height:220px; background:var(--bg-3); border-radius:var(--radius);}
    #pane-spice .hl-wrap #spice-in{
      position:absolute !important; inset:0; width:100% !important; height:100% !important; min-height:0 !important;
      flex:none !important; margin:0; box-sizing:border-box; z-index:2;
      background:transparent !important; color:transparent !important; caret-color:var(--text-0);
      font-family:var(--mono) !important; font-size:11px !important; line-height:1.7 !important;
      padding:12px !important; white-space:pre !important; tab-size:4; letter-spacing:normal; overflow:auto;
    }
    #pane-spice .hl-wrap #spice-in::selection{background:rgba(53,208,192,.3); color:transparent;}
    #pane-spice .hl-layer{
      position:absolute; inset:1px; z-index:1; margin:0; box-sizing:border-box; padding:12px;
      overflow:hidden; pointer-events:none; border-radius:calc(var(--radius) - 1px);
      font-family:var(--mono); font-size:11px; line-height:1.7; white-space:pre; tab-size:4; letter-spacing:normal;
      color:var(--text-1);
    }
    #pane-spice .hl-inner{display:block; will-change:transform;}
  `;
  document.head.appendChild(css);

  /* ---------- Netlist tab ---------- */
  const nl = document.getElementById('netlist-out');
  if (nl){
    let busy = false;
    const textOf = el => {
      const c = el.cloneNode(true);
      c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
      return c.textContent;
    };
    const apply = () => {
      if (busy) return;
      const txt = textOf(nl);
      if (nl.dataset.hlsrc === txt && nl.firstElementChild) return;
      busy = true;
      nl.innerHTML = highlight(txt);
      nl.dataset.hlsrc = txt;
      mo.takeRecords();                    // ignore our own mutation
      busy = false;
    };
    const mo = new MutationObserver(apply);
    mo.observe(nl, {childList:true, characterData:true, subtree:true});
    apply();
  }

  /* ---------- Draw CirSpice editor ---------- */
  const ta = document.getElementById('spice-in');
  if (ta && ta.parentNode){
    const wrap = document.createElement('div'); wrap.className = 'hl-wrap';
    const layer = document.createElement('pre'); layer.className = 'hl-layer'; layer.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('code'); inner.className = 'hl-inner';
    layer.appendChild(inner);
    ta.parentNode.insertBefore(wrap, ta);
    wrap.appendChild(layer); wrap.appendChild(ta);   // moving keeps netlist-import.js's listeners/reference
    ta.setAttribute('wrap', 'off');
    ta.spellcheck = false;

    const sync = () => { inner.style.transform = 'translate(' + (-ta.scrollLeft) + 'px,' + (-ta.scrollTop) + 'px)'; };
    const refresh = () => { inner.innerHTML = highlight(ta.value) + '\n'; sync(); };

    // programmatic changes (sample / clear / Tab key) don't fire "input", so hook the value setter
    const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    Object.defineProperty(ta, 'value', {
      configurable: true,
      get(){ return desc.get.call(this); },
      set(v){ desc.set.call(this, v); refresh(); }
    });

    ta.addEventListener('input', refresh);
    ta.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    refresh();
  }
})();
