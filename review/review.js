/* Komentovací mód (review overlay). Vanilla JS, Shadow DOM, bez závislostí.
   Na produkci se nesmí načítat: skript vkládá jen workflow .github/workflows/pages.yml do náhledu. */
(function () {
  'use strict';
  var API = 'https://balance-ikigai-review.alesruzicka.workers.dev'; // endpoint workeru
  if (window.__biReview) return;
  window.__biReview = true;

  var PAGE = location.pathname.split('/').pop() || 'index.html';
  var comments = [];
  var mode = false;
  var showDone = false;
  var openPin = null; // id komentáře s otevřeným detailem
  var draft = null; // {el, x, y, cx, cy}
  var hovered = null;

  // ---------- Shadow DOM ----------
  var host = document.createElement('div');
  host.id = 'bi-review-host';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}' +
    'button,input,textarea{font:inherit}' +
    'button:focus-visible,input:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:3px solid #ffbf00;outline-offset:2px}' +
    '.bar{position:fixed;right:16px;bottom:16px;display:flex;gap:8px;pointer-events:auto}' +
    '.btn{border:0;border-radius:999px;padding:12px 18px;min-height:44px;background:#1b1b1f;color:#fff;font-size:15px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3)}' +
    '.btn.on{background:#d6249f}.btn.sec{background:#fff;color:#1b1b1f}' +
    '.hl{position:fixed;border:2px solid #d6249f;background:rgba(214,36,159,.12);border-radius:3px;display:none;pointer-events:none}' +
    '.pin{position:fixed;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#d6249f;color:#fff;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:auto;cursor:pointer;padding:0;display:none}' +
    '.pin span{display:block;transform:rotate(45deg);font-size:13px;font-weight:700;line-height:24px;text-align:center}' +
    '.pin.done{background:#8a8a93}' +
    '.pop{position:fixed;width:min(320px,calc(100vw - 24px));background:#fff;color:#1b1b1f;border-radius:10px;padding:12px;box-shadow:0 8px 32px rgba(0,0,0,.35);pointer-events:auto;font-size:14px;line-height:1.4;display:none}' +
    '.pop textarea,.pop input[type=text]{width:100%;border:1px solid #bbb;border-radius:6px;padding:8px;font-size:16px;margin:0 0 8px;display:block}' +
    '.pop textarea{min-height:90px;resize:vertical}' +
    '.row{display:flex;gap:8px;justify-content:flex-end}.row .btn{padding:8px 14px;min-height:40px;box-shadow:none}' +
    '.meta{color:#666;font-size:12px;margin-bottom:6px}.txt{white-space:pre-wrap;word-break:break-word;margin-bottom:10px}' +
    '.hint{color:#666;font-size:12px;margin:-4px 0 8px}' +
    '.panel{position:fixed;right:16px;bottom:76px;width:min(340px,calc(100vw - 32px));max-height:60vh;overflow:auto;background:#fff;color:#1b1b1f;border-radius:10px;padding:12px;box-shadow:0 8px 32px rgba(0,0,0,.35);pointer-events:auto;display:none;font-size:14px}' +
    '.panel h2{font-size:15px;margin:0 0 8px}.panel label{display:block;margin-bottom:8px;font-size:13px}' +
    '.item{display:block;width:100%;text-align:left;background:none;border:0;border-top:1px solid #e5e5ea;padding:8px 2px;cursor:pointer;color:inherit}' +
    '.item.done{opacity:.55}.item b{color:#d6249f}' +
    '.toast{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);background:#b00020;color:#fff;border-radius:8px;padding:8px 14px;font-size:14px;display:none;pointer-events:none;max-width:90vw}' +
    '.banner{position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#d6249f;color:#fff;border-radius:999px;padding:6px 14px;font-size:13px;display:none;pointer-events:none;width:max-content;max-width:calc(100vw - 24px);text-align:center}' +
    '</style>' +
    '<div class="banner" id="banner">Klikněte na prvek, který chcete okomentovat (Esc = konec)</div>' +
    '<div class="hl" id="hl"></div><div id="pins"></div>' +
    '<div class="pop" id="pop" role="dialog" aria-label="Komentář"></div>' +
    '<div class="panel" id="panel" role="region" aria-label="Komentáře stránky"></div>' +
    '<div class="toast" id="toast" role="alert"></div>' +
    '<div class="bar"><button class="btn sec" id="list" aria-expanded="false">Komentáře (0)</button>' +
    '<button class="btn" id="toggle" aria-pressed="false" title="Alt+C">Komentovat</button></div>';
  var $ = function (id) { return root.getElementById(id); };
  var hl = $('hl'), pinsEl = $('pins'), pop = $('pop'), panel = $('panel'), toast = $('toast');

  function mount() { if (!host.isConnected) document.body.appendChild(host); }

  // ---------- Pomocné ----------
  function api(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function err(msg) {
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(function () { toast.style.display = 'none'; }, 4000);
  }
  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function fmt(iso) {
    try { return new Date(iso).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return iso; }
  }
  function getName() { try { return localStorage.getItem('bi-review-name') || ''; } catch (e) { return ''; } }
  function setName(n) { try { localStorage.setItem('bi-review-name', n); } catch (e) {} }

  // KV list() za čerstvým zápisem zaostává (~60 s): vlastní čerstvé komentáře držíme i lokálně.
  var MINE = 'bi-review-mine';
  function remember(c) {
    try {
      var m = JSON.parse(localStorage.getItem(MINE) || '[]').filter(function (x) { return Date.now() - Date.parse(x.createdAt) < 120000; });
      m.push(c);
      localStorage.setItem(MINE, JSON.stringify(m));
    } catch (e) {}
  }
  function merge(list) {
    try {
      JSON.parse(localStorage.getItem(MINE) || '[]').forEach(function (x) {
        if (x.page === PAGE && Date.now() - Date.parse(x.createdAt) < 120000 && !list.some(function (c) { return c.id === x.id; })) list.push(x);
      });
    } catch (e) {}
    return list;
  }

  function selectorOf(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
        parts.unshift('#' + CSS.escape(el.id));
        break;
      }
      var tag = el.tagName.toLowerCase();
      if (el === document.body) { parts.unshift('body'); break; }
      var n = 1, s = el;
      while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) n++;
      parts.unshift(tag + ':nth-of-type(' + n + ')');
      el = el.parentElement;
    }
    return parts.join(' > ');
  }
  function labelOf(el) {
    var t = (el.getAttribute('aria-label') || el.alt || el.innerText || el.value || '').replace(/\s+/g, ' ').trim();
    return t ? t.slice(0, 60) : el.tagName.toLowerCase();
  }
  function find(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }
  function isOurs(t) { return t === host || (t && host.contains && host.contains(t)); }
  function pageComments() { return comments.filter(function (c) { return c.page === PAGE; }); }

  // ---------- Špendlíky ----------
  function pinPos(c) {
    var el = find(c.selector);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + (r.width * c.x) / 100, y: r.top + (r.height * c.y) / 100 };
  }
  function renderPins() {
    var list = pageComments();
    var open = list.filter(function (c) { return c.status !== 'done'; }).length;
    $('list').textContent = 'Komentáře (' + open + ')';
    pinsEl.textContent = '';
    list.forEach(function (c, i) {
      var b = mk('button', 'pin' + (c.status === 'done' ? ' done' : ''));
      b.dataset.id = c.id;
      b.appendChild(mk('span', '', String(i + 1)));
      b.setAttribute('aria-label', 'Komentář ' + (i + 1) + ': ' + c.text.slice(0, 60));
      b.addEventListener('click', function (e) { e.stopPropagation(); showPin(c.id); });
      pinsEl.appendChild(b);
    });
    position();
    if (panel.style.display === 'block') renderPanel();
  }
  function position() {
    var list = pageComments();
    var pins = pinsEl.children;
    for (var i = 0; i < pins.length; i++) {
      var c = list[i];
      var p = c && pinPos(c);
      var hide = !p || (c.status === 'done' && !showDone);
      pins[i].style.display = hide ? 'none' : 'block';
      if (!hide) { pins[i].style.left = p.x + 'px'; pins[i].style.top = p.y + 'px'; }
    }
    if (openPin) {
      var oc = list.filter(function (c) { return c.id === openPin; })[0];
      var op = oc && pinPos(oc);
      if (op) placePop(op.x, op.y); else closePop();
    } else if (draft) {
      var dr = draft.el.getBoundingClientRect();
      placePop(dr.left + (dr.width * draft.x) / 100, dr.top + (dr.height * draft.y) / 100);
    }
  }
  var raf = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; position(); }); }

  // ---------- Bublina ----------
  function placePop(x, y) {
    pop.style.display = 'block';
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.max(12, Math.min(x + 14, innerWidth - w - 12));
    var top = y + 14 + h > innerHeight - 12 ? Math.max(12, y - h - 14) : y + 14;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function closePop() {
    pop.style.display = 'none';
    pop.textContent = '';
    pop.onkeydown = null;
    openPin = null;
    if (draft) hl.style.display = 'none';
    draft = null;
  }
  function showPin(id) {
    var c = pageComments().filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    closePop();
    openPin = id;
    var done = c.status === 'done';
    pop.appendChild(mk('div', 'meta', (c.author || 'Anonym') + ' · ' + fmt(c.createdAt) + (done ? ' · hotovo' : '')));
    pop.appendChild(mk('div', 'txt', c.text));
    var row = mk('div', 'row');
    var close = mk('button', 'btn sec', 'Zavřít');
    close.onclick = closePop;
    var tg = mk('button', 'btn', done ? 'Znovu otevřít' : 'Hotovo');
    tg.onclick = function () {
      api('PATCH', '/comments/' + c.id, { status: done ? 'open' : 'done' })
        .then(function (u) { c.status = u.status; closePop(); renderPins(); })
        .catch(function () { err('Změnu stavu se nepodařilo uložit.'); });
    };
    row.append(close, tg);
    pop.appendChild(row);
    var p = pinPos(c);
    if (p) placePop(p.x, p.y);
    tg.focus();
  }
  function startDraft(el, cx, cy) {
    closePop();
    var r = el.getBoundingClientRect();
    draft = {
      el: el,
      x: r.width ? Math.round(((cx - r.left) / r.width) * 1000) / 10 : 50,
      y: r.height ? Math.round(((cy - r.top) / r.height) * 1000) / 10 : 50,
    };
    var name = getName();
    var nameIn = null;
    pop.appendChild(mk('div', 'meta', 'Komentář k: ' + labelOf(el)));
    if (!name) {
      nameIn = mk('input');
      nameIn.type = 'text';
      nameIn.placeholder = 'Vaše jméno';
      nameIn.setAttribute('aria-label', 'Vaše jméno');
      pop.appendChild(nameIn);
    }
    var ta = mk('textarea');
    ta.placeholder = 'Napište komentář…';
    ta.setAttribute('aria-label', 'Text komentáře');
    pop.appendChild(ta);
    pop.appendChild(mk('div', 'hint', 'Cmd/Ctrl+Enter uloží, Esc zruší'));
    var row = mk('div', 'row');
    var cancel = mk('button', 'btn sec', 'Zrušit');
    var save = mk('button', 'btn', 'Uložit');
    row.append(cancel, save);
    pop.appendChild(row);
    cancel.onclick = closePop;
    var d = draft;
    function submit() {
      var text = ta.value.trim();
      var author = name || (nameIn && nameIn.value.trim());
      if (!author) { nameIn.focus(); return; }
      if (!text) { ta.focus(); return; }
      save.disabled = true;
      api('POST', '/comments', {
        page: PAGE,
        selector: selectorOf(d.el),
        label: labelOf(d.el),
        text: text,
        author: author,
        x: d.x,
        y: d.y,
        viewport: { w: innerWidth, h: innerHeight },
        scrollY: Math.round(scrollY),
        userAgent: navigator.userAgent,
      })
        .then(function (c) {
          setName(author);
          comments.push(c);
          remember(c);
          closePop();
          renderPins();
        })
        .catch(function () { save.disabled = false; err('Komentář se nepodařilo uložit.'); });
    }
    save.onclick = submit;
    pop.onkeydown = function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
    };
    position();
    (nameIn || ta).focus();
  }

  // ---------- Panel ----------
  function renderPanel() {
    panel.textContent = '';
    panel.appendChild(mk('h2', '', 'Komentáře k této stránce'));
    var lab = mk('label');
    var cb = mk('input');
    cb.type = 'checkbox';
    cb.checked = showDone;
    cb.onchange = function () { showDone = cb.checked; renderPanel(); position(); };
    lab.append(cb, document.createTextNode(' Zobrazit hotové'));
    panel.appendChild(lab);
    var list = pageComments();
    var any = false;
    list.forEach(function (c, i) {
      if (c.status === 'done' && !showDone) return;
      any = true;
      var it = mk('button', 'item' + (c.status === 'done' ? ' done' : ''));
      var b = mk('b', '', '#' + (i + 1) + ' ');
      it.append(b, document.createTextNode((c.author || 'Anonym') + ': ' + c.text.slice(0, 80)));
      it.onclick = function () {
        var el = find(c.selector);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(function () { showPin(c.id); }, 500);
      };
      panel.appendChild(it);
    });
    if (!any) panel.appendChild(mk('div', '', 'Zatím nic.'));
  }
  $('list').onclick = function () {
    var on = panel.style.display !== 'block';
    panel.style.display = on ? 'block' : 'none';
    $('list').setAttribute('aria-expanded', String(on));
    if (on) renderPanel();
  };

  // ---------- Mód ----------
  function setMode(on) {
    mode = on;
    $('toggle').classList.toggle('on', on);
    $('toggle').setAttribute('aria-pressed', String(on));
    $('toggle').textContent = on ? 'Konec komentování' : 'Komentovat';
    $('banner').style.display = on ? 'block' : 'none';
    if (!on) { hl.style.display = 'none'; hovered = null; closePop(); }
  }
  $('toggle').onclick = function () { setMode(!mode); };

  function target(e) {
    var t = e.target;
    return t && t.nodeType === 1 && !isOurs(t) && t !== document.documentElement ? t : null;
  }
  function highlight(el) {
    hovered = el;
    if (!el) { hl.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    hl.style.cssText = 'display:block;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
  }
  document.addEventListener('mousemove', function (e) { if (mode && !draft) highlight(target(e)); }, true);
  document.addEventListener('focusin', function (e) { if (mode && !draft) highlight(target(e)); }, true);
  // click zachytíme v capture fázi a zastavíme: žádná navigace ani odeslání formuláře
  document.addEventListener('click', function (e) {
    if (!mode) return;
    var t = target(e);
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    startDraft(t, e.clientX, e.clientY);
    highlight(t);
  }, true);
  document.addEventListener('submit', function (e) { if (mode) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.code === 'KeyC') { e.preventDefault(); setMode(!mode); return; }
    if (e.key === 'Escape') {
      if (pop.style.display === 'block') closePop();
      else if (panel.style.display === 'block') $('list').click();
      else if (mode) setMode(false);
      return;
    }
    // klávesnicí: Enter na zaostřeném prvku stránky ho vybere
    if (mode && !draft && e.key === 'Enter') {
      var a = document.activeElement;
      if (a && a !== document.body && !isOurs(a)) {
        e.preventDefault();
        e.stopPropagation();
        var r = a.getBoundingClientRect();
        startDraft(a, r.left + r.width / 2, r.top + r.height / 2);
      }
    }
  }, true);
  // klik mimo bublinu ji zavře (mimo mód); v módu řeší klik na stránku výběr nového prvku
  document.addEventListener('pointerdown', function (e) {
    if (!mode && openPin && !isOurs(e.target)) closePop();
  }, true);

  addEventListener('scroll', schedule, true);
  addEventListener('resize', schedule);
  setInterval(position, 500); // GSAP mění transformace bez scrollu/resize

  // ---------- Start ----------
  function init() {
    mount();
    api('GET', '/comments?page=' + encodeURIComponent(PAGE))
      .then(function (list) { comments = merge(list); renderPins(); })
      .catch(function () { err('Komentáře se nepodařilo načíst.'); });
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();
