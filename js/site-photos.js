/* Owner photos on a website. The owner uploads photos in their private photo page (/admin/photos/); this file shows
   them on the public site:
     <img data-photo-slot="hero">        the photo the owner put in the "hero" spot replaces this image
     <div data-photo-slot="hero">        (any other element) the photo replaces the image inside it, or fills it if it
                                         has none (add data-photo-replace to always replace what's inside)
     <div data-photo-gallery>            gallery photos are added here (newest-first order the owner set);
       <template data-photo-template>    optional markup per photo: {src} and {caption} are filled in
       children with data-photo-placeholder are removed once real gallery photos exist
     data-photo-lightbox on the gallery  tap a photo to see it big (for sites without their own viewer)
     data-photo-section (hidden)         shown once its gallery has photos
   Nothing uploaded, or the database can't be reached: the page stays exactly as it was.
   Load: <script src="/js/site-photos.js?v=1" data-site="SLUG" defer></script>
   Reads with the public key only; anyone may read (the site is public), only the owner can change photos. */
(function () {
  'use strict';
  var URL_ = 'https://cgrqejsigmzvlhlmvjbx.supabase.co';
  var KEY = 'sb_publishable_UkXqc8XM9vH8LLQ9CO_u7g_b1qZ1KxP';
  var me = document.currentScript;
  var site = me && me.getAttribute('data-site');
  if (!site || !window.fetch) return;
  var d = document;

  function q(sel, root) { return [].slice.call((root || d).querySelectorAll(sel)); }
  function okUrl(u) { return /^https:\/\//.test(u || ''); }

  function setImg(img, p) {
    var pic = img.parentElement && img.parentElement.tagName === 'PICTURE' ? img.parentElement : null;
    if (pic) q('source', pic).forEach(function (s) { s.remove(); });
    img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.removeAttribute('hidden');
    if (p.width && p.height && img.hasAttribute('width')) { img.setAttribute('width', p.width); img.setAttribute('height', p.height); }
    img.src = p.url;
    if (p.caption) img.alt = p.caption;
    img.classList.add('sp-photo');
    var a = img.closest('a[data-full]');
    if (a) { a.setAttribute('data-full', p.url); a.setAttribute('href', p.url); if (p.caption) a.setAttribute('data-caption', p.caption); }
  }

  function fillSlot(node, p) {
    node.removeAttribute('hidden');
    if (node.tagName === 'IMG') { setImg(node, p); return; }
    var inner = node.hasAttribute('data-photo-replace') ? null : node.querySelector('img');
    if (inner) { setImg(inner, p); inner.style.objectFit = 'cover'; node.classList.add('sp-filled'); return; }
    // A drawn placeholder (gradient, icon, label): replace what's inside with the photo, filling the box.
    if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
    var img = d.createElement('img');
    img.src = p.url; img.alt = p.caption || ''; img.decoding = 'async'; img.className = 'sp-photo sp-fill';
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit';
    node.replaceChildren(img);
    node.style.backgroundImage = 'none';
    node.classList.add('sp-filled');
    if (node.getAttribute('aria-label') && /placeholder/i.test(node.getAttribute('aria-label'))) {
      if (p.caption) node.setAttribute('aria-label', p.caption); else node.removeAttribute('aria-label');
    }
  }

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function item(gal, p) {
    var tpl = gal.querySelector('template[data-photo-template]');
    var html = tpl ? tpl.innerHTML : '<figure class="sp-item"><img src="{src}" alt="{caption}" loading="lazy" decoding="async"><figcaption>{caption}</figcaption></figure>';
    var box = d.createElement('div');
    box.innerHTML = html.replace(/\{src\}/g, esc(p.url)).replace(/\{caption\}/g, esc(p.caption || ''));
    var el = box.firstElementChild;
    if (!p.caption) q('figcaption', el).forEach(function (f) { f.remove(); });
    el.setAttribute('data-photo-upload', '');
    return el;
  }

  function lightbox(gal) {
    var dlg, img, cap, list = [], idx = 0;
    function build() {
      dlg = d.createElement('div');
      dlg.className = 'sp-lb'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-label', 'Photo');
      dlg.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure><button type="button" class="sp-x" aria-label="Close">\u00d7</button>' +
        '<button type="button" class="sp-prev" aria-label="Previous photo">\u2039</button><button type="button" class="sp-next" aria-label="Next photo">\u203a</button>';
      d.body.appendChild(dlg);
      img = dlg.querySelector('img'); cap = dlg.querySelector('figcaption');
      dlg.querySelector('.sp-x').onclick = close;
      dlg.querySelector('.sp-prev').onclick = function () { show(idx - 1); };
      dlg.querySelector('.sp-next').onclick = function () { show(idx + 1); };
      dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.tagName === 'FIGURE') close(); });
      var sx = null;
      dlg.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
      dlg.addEventListener('touchend', function (e) { if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1)); });
    }
    function show(i) {
      idx = (i + list.length) % list.length;
      var s = list[idx];
      img.src = s.currentSrc || s.src; img.alt = s.alt || '';
      var f = s.closest('figure'); var fc = f && f.querySelector('figcaption');
      cap.textContent = fc ? fc.textContent : (s.alt || '');
      dlg.querySelector('.sp-prev').hidden = dlg.querySelector('.sp-next').hidden = list.length < 2;
    }
    function close() { dlg.classList.remove('open'); d.documentElement.style.overflow = ''; }
    d.addEventListener('keydown', function (e) {
      if (!dlg || !dlg.classList.contains('open')) return;
      if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1);
    });
    gal.addEventListener('click', function (e) {
      var t = e.target.closest('img');
      if (!t || !gal.contains(t)) return;
      e.preventDefault();
      if (!dlg) build();
      list = q('img', gal).filter(function (x) { return x.offsetParent !== null; });
      show(list.indexOf(t));
      dlg.classList.add('open'); d.documentElement.style.overflow = 'hidden';
    });
    q('img', gal).forEach(function (x) { x.style.cursor = 'zoom-in'; });
  }

  var CSS = '.sp-gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}' +
    '@media(min-width:700px){.sp-gallery{grid-template-columns:repeat(3,1fr);gap:14px}}' +
    '.sp-item{margin:0}.sp-item img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block;cursor:zoom-in}' +
    '.sp-item figcaption{font-size:.9em;margin-top:6px;opacity:.8}' +
    '.sp-lb{position:fixed;inset:0;z-index:2147483000;background:rgba(10,10,10,.94);display:none;align-items:center;justify-content:center;padding:16px}' +
    '.sp-lb.open{display:flex}.sp-lb figure{margin:0;max-width:100%;max-height:100%;text-align:center}' +
    '.sp-lb img{max-width:100%;max-height:calc(100dvh - 90px);border-radius:6px;object-fit:contain}' +
    '.sp-lb figcaption{color:#eee;margin-top:10px;font:15px/1.4 system-ui,sans-serif}' +
    '.sp-lb button{position:absolute;background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:99px;width:52px;height:52px;font-size:30px;line-height:1;cursor:pointer}' +
    '.sp-lb .sp-x{top:12px;right:12px}.sp-lb .sp-prev{left:10px;top:50%;transform:translateY(-50%)}.sp-lb .sp-next{right:10px;top:50%;transform:translateY(-50%)}' +
    '.sp-lb button[hidden]{display:none}';

  function apply(rows) {
    rows = (rows || []).filter(function (p) { return okUrl(p.url); });
    rows.forEach(function (p) {
      if (!p.slot) return;
      q('[data-photo-slot="' + p.slot.replace(/[^a-z0-9-]/g, '') + '"]').forEach(function (n) { fillSlot(n, p); });
    });
    var gals = q('[data-photo-gallery]');
    var inGal = rows.filter(function (p) { return p.in_gallery; });
    if (gals.length && !d.getElementById('sp-css')) { var st = d.createElement('style'); st.id = 'sp-css'; st.textContent = CSS; d.head.appendChild(st); }
    gals.forEach(function (gal) {
      if (inGal.length) {
        q('[data-photo-placeholder]', gal).forEach(function (n) { n.remove(); });
        var before = gal.getAttribute('data-photo-gallery') === 'append' ? null : gal.querySelector(':scope > :not(template)');
        inGal.forEach(function (p) { gal.insertBefore(item(gal, p), before); });
        if (before) gal.scrollLeft = 0; // sideways-scrolling galleries start at the first photo
        var sec = gal.closest('[data-photo-section]');
        if (sec) sec.hidden = false;
      }
      if (gal.hasAttribute('data-photo-lightbox')) lightbox(gal);
    });
    d.dispatchEvent(new CustomEvent('site-photos:ready', { detail: { count: rows.length } }));
  }

  var url = URL_ + '/rest/v1/site_photos?select=url,caption,slot,in_gallery,sort,width,height&site=eq.' + encodeURIComponent(site) +
    '&order=sort.asc,created_at.desc&limit=200';
  fetch(url, { headers: { apikey: KEY, Accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (rows) {
      if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { apply(rows); });
      else apply(rows);
    })
    .catch(function () {
      // keep the current pictures; still give galleries their viewer
      var run = function () { apply([]); };
      if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', run); else run();
    });
})();
