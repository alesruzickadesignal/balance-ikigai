/* Balance IKIGAI – sdílený skript. Bez závislostí; GSAP je volitelný (jen index). */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Hlavička: stín při scrollu ---------- */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Navigace: mobilní menu + rozbalovací Služby ---------- */
  var navToggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  var subToggle = document.querySelector('.nav-sub-toggle');

  function setMenu(open, returnFocus) {
    if (!navToggle) return;
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.querySelector('.sr-only').textContent = open ? 'Zavřít menu' : 'Otevřít menu';
    if (open) {
      var first = nav.querySelector('a, button');
      if (first) first.focus();
    } else if (returnFocus) {
      navToggle.focus();
    }
  }
  function setSub(open) {
    if (subToggle) subToggle.setAttribute('aria-expanded', String(open));
  }
  function menuIsOpen() { return navToggle && navToggle.getAttribute('aria-expanded') === 'true'; }
  function mobileNav() { return navToggle && getComputedStyle(navToggle).display !== 'none'; }

  if (navToggle && nav) {
    navToggle.addEventListener('click', function () { setMenu(!menuIsOpen(), false); });
    // Klik na odkaz (i kotvu na téže stránce) menu zavře.
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) { setSub(false); if (mobileNav()) setMenu(false, false); }
    });
    // Při přechodu na desktop nesmí zůstat menu "otevřené" v ARIA.
    window.matchMedia('(min-width: 961px)').addEventListener('change', function (e) {
      if (e.matches) setMenu(false, false);
    });
  }
  if (subToggle) {
    subToggle.addEventListener('click', function () {
      setSub(subToggle.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.has-sub') && !mobileNav()) setSub(false);
    });
    // Desktop: odchod fokusu mimo dropdown ho zavře.
    subToggle.parentElement.addEventListener('focusout', function (e) {
      if (!mobileNav() && !subToggle.parentElement.contains(e.relatedTarget)) setSub(false);
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (subToggle && subToggle.getAttribute('aria-expanded') === 'true') {
      setSub(false);
      subToggle.focus();
    } else if (menuIsOpen()) {
      setMenu(false, true);
    }
  });

  /* ---------- Hero video: při reduced-motion jen poster ---------- */
  var video = document.querySelector('[data-hero-video]');
  if (video) {
    var vToggle = document.querySelector('.video-toggle');
    if (reduced) {
      if (vToggle) vToggle.hidden = true;
    } else {
      // Zdroj nastavujeme až tady, aby se při reduced-motion video vůbec nestahovalo.
      video.querySelectorAll('source[data-src]').forEach(function (s) { s.src = s.dataset.src; });
      video.load();
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay zablokován – zůstane poster */ });
      if (vToggle) {
        vToggle.addEventListener('click', function () {
          var paused = vToggle.getAttribute('aria-pressed') === 'true';
          if (paused) video.play(); else video.pause();
          vToggle.setAttribute('aria-pressed', String(!paused));
          vToggle.setAttribute('aria-label', paused ? 'Pozastavit video' : 'Přehrát video');
        });
      }
    }
  }

  /* ---------- Formátování vstupů (převzato z reference) ---------- */
  function chunk3(s) { return (s.match(/.{1,3}/g) || []).join(' '); }

  // Telefon: +420 XXX XXX XXX nebo XXX XXX XXX
  function formatPhone(v) {
    v = v.replace(/[^\d+]/g, '');
    var hasPlus = v.charAt(0) === '+';
    var digits = v.replace(/\D/g, '');
    if (hasPlus) {
      if (digits.indexOf('420') === 0) {
        digits = digits.slice(0, 12);
        var rest = digits.slice(3);
        return '+420' + (rest ? ' ' + chunk3(rest) : '');
      }
      return '+' + chunk3(digits.slice(0, 15));
    }
    return chunk3(digits.slice(0, 9));
  }
  // PSČ: 123 45
  function formatPsc(v) {
    v = v.replace(/\D/g, '').slice(0, 5);
    return v.length > 3 ? v.slice(0, 3) + ' ' + v.slice(3) : v;
  }
  // SPZ: 3 znaky + mezera + až 5 znaků
  function formatSpz(v) {
    v = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    return v.length > 3 ? v.slice(0, 3) + ' ' + v.slice(3) : v;
  }
  // Částky: 1 500 000
  function formatMoney(v) {
    v = v.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12);
    return v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  var formatters = { phone: formatPhone, psc: formatPsc, spz: formatSpz, money: formatMoney };

  document.addEventListener('input', function (e) {
    var el = e.target;
    var fmt = el.dataset && formatters[el.dataset.format];
    if (fmt) el.value = fmt(el.value);
  });

  /* ---------- Předvyplnění SPZ z hero formuláře (?predvyplnit=…&souhlas=1) ---------- */
  var params = new URLSearchParams(window.location.search);
  document.querySelectorAll('[data-prefill]').forEach(function (el) {
    var val = params.get(el.dataset.prefill);
    if (val) el.value = formatSpz(val);
  });
  document.querySelectorAll('[data-prefill-check]').forEach(function (el) {
    el.checked = params.get(el.dataset.prefillCheck) === '1';
  });

  /* ---------- Podmíněné části formulářů: data-show-if="Pole=Hodnota|Hodnota" ----------
     Musí jít o <fieldset>: disabled ho vyřadí z odeslání i z validace. */
  document.querySelectorAll('fieldset[data-show-if]').forEach(function (set) {
    var parts = set.dataset.showIf.split('=');
    var name = parts[0];
    var allowed = parts[1].split('|');
    var form = set.closest('form');
    function sync() {
      var field = form.elements[name];
      var on = !!field && allowed.indexOf(field.value) !== -1;
      set.hidden = !on;
      set.disabled = !on;
    }
    form.addEventListener('change', function (e) { if (e.target.name === name) sync(); });
    sync();
  });

  /* ---------- Počet osob → pole "Věk N. osoby" (cestovní pojištění) ---------- */
  document.querySelectorAll('[data-persons]').forEach(function (counter) {
    var box = document.getElementById(counter.dataset.persons);
    if (!box) return;
    var template = box.firstElementChild.cloneNode(true);
    var max = parseInt(counter.max, 10) || 10;
    function sync() {
      var n = Math.min(Math.max(parseInt(counter.value, 10) || 1, 1), max);
      while (box.children.length < n) {
        var f = template.cloneNode(true);
        f.querySelector('input').value = '';
        box.appendChild(f);
      }
      while (box.children.length > n) box.lastElementChild.remove();
      Array.prototype.forEach.call(box.children, function (f, i) {
        var input = f.querySelector('input');
        var label = f.querySelector('label');
        var id = 'vek-osoby-' + (i + 1);
        input.id = id;
        input.name = 'Vek-' + (i + 1) + '.-osoby';
        label.htmlFor = id;
        label.textContent = 'Věk ' + (i + 1) + '. osoby';
      });
    }
    counter.addEventListener('input', sync);
    counter.addEventListener('change', function () {
      // Po opuštění pole srovnáme i viditelnou hodnotu do povoleného rozsahu.
      counter.value = box.children.length;
    });
    sync();
  });

  /* ---------- Posuvník splatnosti ---------- */
  document.querySelectorAll('input[type="range"][data-output]').forEach(function (range) {
    var out = document.getElementById(range.dataset.output);
    function sync() { out.textContent = range.value + ' let'; }
    range.addEventListener('input', sync);
    sync();
  });

  /* ---------- Datum: nelze vybrat minulost ---------- */
  var today = new Date();
  var iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  document.querySelectorAll('input[type="date"][data-min-today]').forEach(function (d) { d.min = iso; });

  /* ---------- Animace (GSAP, jen když je načtený a pohyb není omezen) ---------- */
  function revealAll() { root.classList.remove('anim'); }

  if (!window.gsap || reduced) {
    revealAll();
    return;
  }
  var gsap = window.gsap;
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

  gsap.fromTo('[data-hero-in]',
    { autoAlpha: 0, y: 28 },
    { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.09, onComplete: revealAll }
  );

  if (!window.ScrollTrigger) return;

  gsap.utils.toArray('[data-reveal]').forEach(function (el) {
    gsap.from(el, {
      autoAlpha: 0, y: 36, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true }
    });
  });

  // Počítadla: HTML nese finální hodnotu (bez JS/při reduced-motion se zobrazí rovnou).
  gsap.utils.toArray('[data-count]').forEach(function (el) {
    var target = parseInt(el.dataset.count, 10);
    var suffix = el.dataset.suffix || '';
    var state = { v: 0 };
    gsap.to(state, {
      v: target, duration: 1.8, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onStart: function () { el.textContent = '0' + suffix; },
      onUpdate: function () { el.textContent = Math.round(state.v).toLocaleString('cs-CZ') + suffix; }
    });
  });
})();
