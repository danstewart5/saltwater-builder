/* Owner photo manager (shared by the lead tracker and every website's /admin/photos/ page).
   Owners upload photos from their phone; each photo can fill one named spot on the website ("slot"), show in the
   website's photo gallery, have a caption, and be moved up/down or deleted.
   Storage: public bucket `site-photos`, path `<site slug>/<file>`; rows in `site_photos`; spot names in `site_slots`.
   Row level security lets only members of that business change anything (Supabase project "Lead-tracker").
   Usage: PhotoManager.mount(element, { sb, business: { id, slug, name } })   (sb = a signed-in supabase-js client)
   Plain script (no imports) so a website can load it with <script src>; the tracker loads it as a module. */
(function () {
  'use strict';
  var BUCKET = 'site-photos';
  var MAX_SIDE = 1600;

  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (k === 'checked') e.checked = !!v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null || kid === false) continue;
      [].concat(kid).forEach(function (k) { if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k)); });
    }
    return e;
  }

  var CSS = '' +
    '.pm{--pm-accent:#2563eb;--pm-line:rgba(127,127,127,.35);--pm-soft:rgba(127,127,127,.12);color:inherit;font:inherit}' +
    '.pm *{box-sizing:border-box}' +
    '.pm-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 12px}' +
    '.pm-add{flex:1 1 220px;min-height:60px;font-size:19px;font-weight:700;border-radius:14px;border:0;background:var(--pm-accent);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;padding:0 16px}' +
    '.pm-add:disabled{opacity:.6}' +
    '.pm-help{font-size:14px;opacity:.75;margin:0 0 12px;line-height:1.4}' +
    '.pm-status{min-height:1.4em;font-size:15px;margin:0 0 10px}' +
    '.pm-status.err{color:#d93025;font-weight:600}' +
    '.pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}' +
    '.pm-card{border:1px solid var(--pm-line);border-radius:16px;overflow:hidden;background:var(--pm-soft);display:flex;flex-direction:column}' +
    '.pm-thumb{position:relative;aspect-ratio:4/3;background:rgba(0,0,0,.15)}' +
    '.pm-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}' +
    '.pm-badge{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.72);color:#fff;font-size:13px;font-weight:600;padding:4px 9px;border-radius:99px;max-width:calc(100% - 16px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.pm-body{padding:10px;display:grid;gap:10px}' +
    '.pm-body label{display:grid;gap:4px;font-size:14px;font-weight:600}' +
    '.pm-body input[type=text],.pm-body select{font:inherit;font-size:16px;font-weight:400;width:100%;min-height:48px;border-radius:12px;border:1px solid var(--pm-line);padding:0 12px;background:#fff;color:#111}' +
    '.pm-toggle{display:flex!important;grid-template-columns:none;align-items:center;gap:12px;min-height:52px;padding:0 12px;border-radius:12px;border:1px solid var(--pm-line);cursor:pointer;font-size:16px!important}' +
    '.pm-toggle input{width:28px;height:28px;margin:0;accent-color:var(--pm-accent);flex:none}' +
    '.pm-acts{display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:8px}' +
    '.pm-acts button{font:inherit;font-size:16px;font-weight:600;min-height:50px;border-radius:12px;border:1px solid var(--pm-line);background:transparent;color:inherit;cursor:pointer}' +
    '.pm-acts button:disabled{opacity:.35}' +
    '.pm-acts .pm-del{color:#d93025;border-color:rgba(217,48,37,.5)}' +
    '.pm-empty{text-align:center;padding:30px 12px;border:2px dashed var(--pm-line);border-radius:16px;opacity:.85}' +
    '.pm-up{display:grid;gap:6px;margin:0 0 12px}' +
    '.pm-up div{font-size:14px;padding:8px 12px;border-radius:10px;background:var(--pm-soft)}';

  function injectCss() {
    if (document.getElementById('pm-css')) return;
    var s = document.createElement('style'); s.id = 'pm-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  // Shrink a phone photo to ~1600 px on the long side, WebP (JPEG where the browser can't make WebP).
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, MAX_SIDE / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        var g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b && b.type === 'image/webp') return resolve({ blob: b, ext: 'webp', type: 'image/webp', w: cw, h: ch });
          c.toBlob(function (j) {
            if (!j) return reject(new Error('Could not read that photo'));
            resolve({ blob: j, ext: 'jpg', type: 'image/jpeg', w: cw, h: ch });
          }, 'image/jpeg', 0.85);
        }, 'image/webp', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file isn\u2019t a photo this phone can open (try a JPEG or PNG)')); };
      img.src = url;
    });
  }

  function rid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

  function mount(root, opts) {
    injectCss();
    var sb = opts.sb, biz = opts.business;
    var photos = [], slots = [], busy = false;
    root.innerHTML = '';
    root.classList.add('pm');

    var status = el('p', { class: 'pm-status', role: 'status', 'aria-live': 'polite' });
    var upList = el('div', { class: 'pm-up' });
    var grid = el('div', { class: 'pm-grid' });
    var file = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    var addBtn = el('button', { type: 'button', class: 'pm-add', onclick: function () { file.click(); } }, '\ud83d\udcf7', 'Add photos');
    root.append(
      el('div', { class: 'pm-bar' }, addBtn, file),
      el('p', { class: 'pm-help' }, 'Pick one or many from your camera roll. Then, for each photo: choose the spot on the website it fills (or none), whether it shows in the photo gallery, and a short caption. Changes show on the website straight away (refresh the site to see them).'),
      status, upList, grid);

    function say(t, err) { status.textContent = t || ''; status.className = 'pm-status' + (err ? ' err' : ''); }
    function slotLabel(name) { var s = slots.filter(function (x) { return x.slot === name; })[0]; return s ? s.label : name; }

    function load() {
      say('Loading\u2026');
      return Promise.all([
        sb.from('site_slots').select('slot,label,sort').eq('business_id', biz.id).order('sort'),
        sb.from('site_photos').select('*').eq('business_id', biz.id).order('sort').order('created_at', { ascending: false }),
      ]).then(function (r) {
        if (r[1].error) throw r[1].error;
        slots = (r[0].data || []);
        photos = r[1].data || [];
        say(photos.length ? photos.length + ' photo' + (photos.length === 1 ? '' : 's') : '');
        paint();
      }).catch(function (e) { say('Couldn\u2019t load photos: ' + (e.message || e), true); });
    }

    function paint() {
      if (!photos.length) {
        grid.replaceChildren(el('div', { class: 'pm-empty' }, 'No photos yet. Tap \u201cAdd photos\u201d to upload from your phone. Until then the website keeps its current pictures.'));
        return;
      }
      grid.replaceChildren.apply(grid, photos.map(card));
    }

    function save(p, patch, okMsg) {
      return sb.from('site_photos').update(patch).eq('id', p.id).then(function (r) {
        if (r.error) { say('Not saved: ' + r.error.message, true); return false; }
        Object.assign(p, patch);
        if (okMsg) say(okMsg);
        return true;
      });
    }

    function card(p, i) {
      var cap = el('input', { type: 'text', maxlength: '300', value: p.caption || '', placeholder: 'e.g. Kitchen, after', enterkeyhint: 'done' });
      var capT;
      cap.addEventListener('input', function () { clearTimeout(capT); capT = setTimeout(function () { save(p, { caption: cap.value.trim() || null }, 'Caption saved'); }, 700); });
      cap.addEventListener('keydown', function (e) { if (e.key === 'Enter') cap.blur(); });

      var gal = el('input', { type: 'checkbox', checked: p.in_gallery });
      gal.addEventListener('change', function () { save(p, { in_gallery: gal.checked }, gal.checked ? 'Shows in the gallery' : 'Hidden from the gallery'); });

      var sel = el('select', { 'aria-label': 'Spot on the website' },
        el('option', { value: '' }, '\u2014 Not in a spot (gallery only) \u2014'),
        slots.map(function (s) {
          var other = photos.filter(function (o) { return o.slot === s.slot && o.id !== p.id; })[0];
          return el('option', { value: s.slot, selected: p.slot === s.slot }, s.label + (other ? '  (has a photo: will swap)' : ''));
        }));
      if (p.slot && !slots.some(function (s) { return s.slot === p.slot; })) sel.append(el('option', { value: p.slot, selected: true }, p.slot));
      sel.addEventListener('change', function () {
        var v = sel.value || null;
        var other = v && photos.filter(function (o) { return o.slot === v && o.id !== p.id; })[0];
        sel.disabled = true;
        (other ? save(other, { slot: null }) : Promise.resolve(true)).then(function (ok) {
          if (!ok) return false;
          return save(p, { slot: v }, v ? 'Now showing in: ' + slotLabel(v) : 'Removed from its spot');
        }).then(function () { sel.disabled = false; paint(); });
      });

      var up = el('button', { type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: function () { move(i, -1); } }, '\u2191 Up');
      var down = el('button', { type: 'button', 'aria-label': 'Move down', disabled: i === photos.length - 1, onclick: function () { move(i, 1); } }, '\u2193 Down');
      var del = el('button', { type: 'button', class: 'pm-del', onclick: function () { remove(p); } }, '\ud83d\uddd1 Delete');

      return el('div', { class: 'pm-card' },
        el('div', { class: 'pm-thumb' }, el('img', { src: p.url, alt: p.caption || '', loading: 'lazy' }),
          p.slot ? el('span', { class: 'pm-badge' }, '\ud83d\udccd ' + slotLabel(p.slot)) : null),
        el('div', { class: 'pm-body' },
          slots.length ? el('label', {}, 'Spot on the website', sel) : null,
          el('label', { class: 'pm-toggle' }, gal, 'Show in photo gallery'),
          el('label', {}, 'Caption', cap),
          el('div', { class: 'pm-acts' }, up, down, del)));
    }

    function move(i, d) {
      var j = i + d;
      if (j < 0 || j >= photos.length || busy) return;
      busy = true;
      var t = photos[i]; photos[i] = photos[j]; photos[j] = t;
      paint();
      var jobs = [];
      photos.forEach(function (p, k) { if (p.sort !== k) jobs.push(save(p, { sort: k })); });
      Promise.all(jobs).then(function () { busy = false; say('Order saved'); });
    }

    function remove(p) {
      if (!window.confirm('Delete this photo from the website? This can\u2019t be undone.')) return;
      say('Deleting\u2026');
      sb.from('site_photos').delete().eq('id', p.id).then(function (r) {
        if (r.error) { say('Not deleted: ' + r.error.message, true); return; }
        sb.storage.from(BUCKET).remove([p.path]).catch(function () {});
        photos = photos.filter(function (x) { return x.id !== p.id; });
        paint(); say('Photo deleted');
      });
    }

    file.addEventListener('change', function () {
      var files = [].slice.call(file.files || []);
      file.value = '';
      if (!files.length) return;
      addBtn.disabled = true;
      var top = photos.length ? Math.min.apply(null, photos.map(function (p) { return p.sort; })) : 0;
      var done = 0, failed = 0;
      var rows = files.map(function (f) { var r = el('div', {}, '\u23f3 ' + (f.name || 'photo')); upList.append(r); return r; });
      // one at a time: kinder to a phone's memory and a weak signal
      files.reduce(function (chain, f, n) {
        return chain.then(function () {
          rows[n].textContent = '\u23f3 Shrinking ' + (f.name || 'photo') + '\u2026';
          return shrink(f).then(function (s) {
            var path = biz.slug + '/' + rid() + '.' + s.ext;
            rows[n].textContent = '\u2b06\ufe0f Uploading ' + (f.name || 'photo') + '\u2026';
            return sb.storage.from(BUCKET).upload(path, s.blob, { contentType: s.type, cacheControl: '31536000', upsert: false }).then(function (u) {
              if (u.error) throw u.error;
              var url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
              return sb.from('site_photos').insert({ business_id: biz.id, path: path, url: url, in_gallery: true,
                sort: top - files.length + n, width: s.w, height: s.h }).select().single();
            }).then(function (ins) {
              if (ins.error) { sb.storage.from(BUCKET).remove([path]).catch(function () {}); throw ins.error; }
              photos.push(ins.data); done++;
              rows[n].textContent = '\u2705 ' + (f.name || 'photo');
            });
          }).catch(function (e) { failed++; rows[n].textContent = '\u26a0\ufe0f ' + (f.name || 'photo') + ': ' + (e.message || e); });
        });
      }, Promise.resolve()).then(function () {
        addBtn.disabled = false;
        photos.sort(function (a, b) { return a.sort - b.sort || String(b.created_at).localeCompare(String(a.created_at)); });
        paint();
        say(done + ' added' + (failed ? ', ' + failed + ' didn\u2019t work' : '') + '. Now pick a spot or caption for each.', !!failed);
        setTimeout(function () { rows.forEach(function (r) { if (r.textContent.charAt(0) === '\u2705') r.remove(); }); }, 4000);
      });
    });

    load();
    return { reload: load };
  }

  window.PhotoManager = { mount: mount, shrink: shrink };
})();
