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
   Projects (script tag has data-projects):
     <div data-photo-projects>           one card per project the owner made, in their order; children with
       <template data-project-template>  data-photo-placeholder are removed once projects exist. Template fills
                                         {title} {kind} {src} (cover) {count}; tapping a card that has photos opens
                                         them all (a card with only a cover keeps its own link).
   Videos:
     <video data-video-slot="hero-video"> the owner's video (shrunk on upload) replaces this one, with its still as poster
     <section data-video-poster="hero-video"> gets the owner's video still as its background (for when no video plays)
   Words (script tag has data-texts):
     <span data-text="quote-text">        replaced with the owner's words for that spot; empty = left as it is
   Nothing uploaded, or the database can't be reached: the page stays exactly as it was.
   Load: <script src="/js/site-photos.js?v=1" data-site="SLUG" [data-projects] [data-texts] defer></script>
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
    '.sp-lb button[hidden]{display:none}' +
    '.sp-pv{position:fixed;inset:0;z-index:2147482000;background:#fff;color:#141414;overflow-y:auto;-webkit-overflow-scrolling:touch;display:none}' +
    '.sp-pv.open{display:block}.sp-pv-in{max-width:1100px;margin:0 auto;padding:18px 16px 60px}' +
    '.sp-pv-top{position:sticky;top:0;background:#fff;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:6px 0 14px;z-index:1}' +
    '.sp-pv h2{margin:0;font-size:24px;line-height:1.2;font-weight:600}.sp-pv .sp-pv-k{margin:4px 0 0;opacity:.7;font-size:15px}' +
    '.sp-pv-x{flex:none;width:48px;height:48px;border-radius:99px;border:1px solid rgba(0,0,0,.2);background:#fff;font-size:28px;line-height:1;cursor:pointer;color:inherit}' +
    '.sp-pv .sp-gallery img{aspect-ratio:4/5}';

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

  function fill(str, map) { return str.replace(/\{(\w+)\}/g, function (m, k) { return k in map ? esc(map[k]) : m; }); }

  // One project's photos, full screen; tap a photo to see it big. The phone's back button closes it.
  var pv;
  function openProject(pr, photos) {
    if (!pv) {
      pv = d.createElement('div'); pv.className = 'sp-pv'; pv.setAttribute('role', 'dialog'); pv.setAttribute('aria-modal', 'true');
      d.body.appendChild(pv);
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pv.classList.contains('open') && !d.querySelector('.sp-lb.open')) history.back(); });
      window.addEventListener('popstate', function () { if (pv.classList.contains('open')) { pv.classList.remove('open'); d.documentElement.style.overflow = ''; } });
    }
    pv.setAttribute('aria-label', pr.title);
    pv.innerHTML = '<div class="sp-pv-in"><div class="sp-pv-top"><div><h2></h2><p class="sp-pv-k"></p></div>' +
      '<button type="button" class="sp-pv-x" aria-label="Close">×</button></div><div class="sp-gallery"></div></div>';
    pv.querySelector('h2').textContent = pr.title;
    var k = pv.querySelector('.sp-pv-k'); if (pr.kind) k.textContent = pr.kind; else k.remove();
    var gal = pv.querySelector('.sp-gallery');
    photos.forEach(function (p) { gal.appendChild(item(gal, p)); });
    pv.querySelector('.sp-pv-x').onclick = function () { history.back(); };
    lightbox(gal);
    pv.classList.add('open'); pv.scrollTop = 0; d.documentElement.style.overflow = 'hidden';
    history.pushState({ spProject: pr.id }, '');
    pv.querySelector('.sp-pv-x').focus();
  }

  function applyProjects(projects, rows) {
    var boxes = q('[data-photo-projects]');
    if (!boxes.length || !projects || !projects.length) return;
    if (!d.getElementById('sp-css')) { var st = d.createElement('style'); st.id = 'sp-css'; st.textContent = CSS; d.head.appendChild(st); }
    var list = projects.map(function (pr) {
      var ph = rows.filter(function (p) { return p.project_id === pr.id; });
      var cover = okUrl(pr.cover_url) ? pr.cover_url : (ph[0] && ph[0].url);
      return { pr: pr, photos: ph, cover: cover };
    }).filter(function (x) { return x.cover; });
    if (!list.length) return;
    boxes.forEach(function (box) {
      var tpl = box.querySelector('template[data-project-template]');
      if (!tpl) return;
      q('[data-photo-placeholder]', box).forEach(function (n) { n.remove(); });
      list.forEach(function (x) {
        var holder = d.createElement('div');
        holder.innerHTML = fill(tpl.innerHTML, { title: x.pr.title, kind: x.pr.kind || '', src: x.cover,
          count: x.photos.length + ' photo' + (x.photos.length === 1 ? '' : 's') });
        var el = holder.firstElementChild;
        if (!x.pr.kind) q('[data-if-kind]', el).forEach(function (n) { n.remove(); });
        if (x.photos.length) {
          el.addEventListener('click', function (e) { e.preventDefault(); openProject(x.pr, x.photos); });
          if (el.tagName === 'A') { el.removeAttribute('target'); el.setAttribute('href', '#'); }
          el.setAttribute('aria-label', x.pr.title + ': see ' + x.photos.length + ' photo' + (x.photos.length === 1 ? '' : 's'));
        }
        box.insertBefore(el, tpl);
      });
      box.scrollLeft = 0;
    });
  }

  function applyVideos(rows) {
    rows.forEach(function (p) {
      if (!p.slot) return;
      var name = p.slot.replace(/[^a-z0-9-]/g, '');
      if (okUrl(p.poster_url)) q('[data-video-poster="' + name + '"]').forEach(function (n) { n.style.backgroundImage = 'url("' + p.poster_url + '")'; });
      q('video[data-video-slot="' + name + '"]').forEach(function (v) {
        if (okUrl(p.poster_url)) v.poster = p.poster_url;
        q('source', v).forEach(function (s) { s.remove(); });
        v.src = p.url; v.muted = true;
        try { v.load(); var pl = v.play(); if (pl && pl.catch) pl.catch(function () {}); } catch (e) {}
      });
    });
  }

  function applyTexts(texts) {
    var map = {};
    (texts || []).forEach(function (t) { if (t.value && String(t.value).trim()) map[t.key] = String(t.value).trim(); });
    q('[data-text]').forEach(function (n) {
      var v = map[n.getAttribute('data-text')];
      if (!v) return;
      var lines = v.split(/\r?\n/);
      n.replaceChildren();
      lines.forEach(function (line, i) { if (i) n.appendChild(d.createElement('br')); n.appendChild(d.createTextNode(line)); });
    });
  }

  function get(path) {
    return fetch(URL_ + '/rest/v1/' + path, { headers: { apikey: KEY, Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  var s = encodeURIComponent(site);
  var wantProjects = me.hasAttribute('data-projects'), wantTexts = me.hasAttribute('data-texts');
  Promise.all([
    get('site_photos?select=url,caption,slot,in_gallery,sort,width,height,media,poster_url' + (wantProjects ? ',project_id' : '') +
      '&site=eq.' + s + '&order=sort.asc,created_at.desc&limit=500').catch(function () { return null; }),
    wantProjects ? get('site_projects?select=id,title,kind,cover_url&site=eq.' + s + '&visible=eq.true&order=sort.asc,created_at.asc').catch(function () { return []; }) : [],
    wantTexts ? get('site_texts?select=key,value&site=eq.' + s).catch(function () { return []; }) : [],
  ]).then(function (r) {
    var run = function () {
      var all = (r[0] || []).filter(function (p) { return okUrl(p.url); });
      var rows = all.filter(function (p) { return p.media !== 'video'; });
      try { applyVideos(all.filter(function (p) { return p.media === 'video'; })); } catch (e) { /* keep the page as it was */ }
      // photos that belong to a project show in that project, not in the general gallery
      apply(rows.map(function (p) { return p.project_id ? Object.assign({}, p, { in_gallery: false }) : p; }));
      try { applyProjects(r[1], rows); } catch (e) { /* keep the page as it was */ }
      try { applyTexts(r[2]); } catch (e) { /* keep the page as it was */ }
    };
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', run); else run();
  });
})();
