/* Owner photo manager (shared by the lead tracker and every website's /admin/photos/ page).
   Owners upload photos from their phone; each photo can fill one named spot on the website ("slot"), show in the
   website's photo gallery, have a caption, and be moved up/down or deleted.
   Storage: public bucket `site-photos`, path `<site slug>/<file>`; rows in `site_photos`; spot names in `site_slots`.
   Row level security lets only members of that business change anything (Supabase project "Lead-tracker").
   Usage: PhotoManager.mount(element, { sb, business: { id, slug, name }, projects? })   (sb = a signed-in supabase-js client)
   Tabs appear when the site has projects (site_projects) or editable words (site_texts): Projects, Photo spots, Words.
   Without them the screen is the single photo list it always was.
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
    '.pm-up div{font-size:14px;padding:8px 12px;border-radius:10px;background:var(--pm-soft)}' +
    '.pm-add[hidden],.pm-new[hidden],.pm-tabs[hidden]{display:none}' +
    '.pm-tabs{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:6px;margin:0 0 14px;padding:4px;border-radius:14px;background:var(--pm-soft)}' +
    '.pm-tab{font:inherit;font-size:15px;font-weight:600;min-height:48px;border:0;border-radius:11px;background:transparent;color:inherit;cursor:pointer;padding:0 6px}' +
    '.pm-tab.on{background:#fff;color:#111;box-shadow:0 1px 4px rgba(0,0,0,.15)}' +
    '.pm-new,.pm-pedit{display:grid;gap:10px;margin:0 0 14px;padding:12px;border:1px solid var(--pm-line);border-radius:16px;background:var(--pm-soft)}' +
    '.pm-new label,.pm-pedit label,.pm-word label{display:grid;gap:4px;font-size:14px;font-weight:600}' +
    '.pm-new input,.pm-pedit input[type=text],.pm-word input,.pm-word textarea{font:inherit;font-size:16px;font-weight:400;width:100%;min-height:48px;border-radius:12px;border:1px solid var(--pm-line);padding:10px 12px;background:#fff;color:#111}' +
    '.pm-word textarea{min-height:110px;resize:vertical;line-height:1.4}' +
    '.pm-acts.two{grid-template-columns:1fr 1.4fr}' +
    '.pm-acts .pm-primary,.pm-cover{background:var(--pm-accent);color:#fff;border:0}' +
    '.pm-cover{font:inherit;font-size:16px;font-weight:700;min-height:50px;border-radius:12px;cursor:pointer}' +
    '.pm-cover.on{background:transparent;color:inherit;border:1px solid var(--pm-line);opacity:1}' +
    '.pm-back{font:inherit;font-size:16px;font-weight:600;min-height:48px;border:0;background:transparent;color:inherit;cursor:pointer;padding:0 4px;margin:0 0 6px}' +
    '.pm-plist{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}' +
    '.pm-pcard{font:inherit;color:inherit;text-align:left;border:1px solid var(--pm-line);border-radius:16px;overflow:hidden;background:var(--pm-soft);padding:0;cursor:pointer;display:flex;flex-direction:column}' +
    '.pm-pthumb{position:relative;display:block;aspect-ratio:4/5;background:rgba(0,0,0,.12)}' +
    '.pm-pthumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}' +
    '.pm-pthumb>span:not(.pm-badge){position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;opacity:.7}' +
    '.pm-pinfo{display:grid;gap:2px;padding:10px 12px 12px;font-size:14px}.pm-pinfo b{font-size:16px}.pm-pinfo small{opacity:.7}' +
    '.pm-badge2{top:auto;bottom:8px}' +
    '.pm-spots{display:grid;gap:6px;margin:0 0 16px}' +
    '.pm-spot{display:flex;align-items:center;gap:10px;padding:6px;border-radius:12px;background:var(--pm-soft);font-size:15px;font-weight:600}' +
    '.pm-spot img,.pm-spot-empty{width:52px;height:40px;border-radius:8px;object-fit:cover;flex:none;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.1);font-weight:400}' +
    '.pm-spot small{display:block;font-weight:400;opacity:.7;font-size:13px}.pm-spot.full small{opacity:1;color:#188038}' +
    '.pm-words{display:grid;gap:14px}.pm-word{display:grid;gap:4px}.pm-word label small{font-weight:400;opacity:.75}' +
    '.pm-saved{font-size:14px;color:#188038;min-height:1.2em}.pm-saved.err{color:#d93025;font-weight:600}';

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
    var photos = [], slots = [], projects = [], texts = [], busy = false;
    var tabbed = false, tab = 'projects', openId = null;
    root.innerHTML = '';
    root.classList.add('pm');

    var tabs = el('div', { class: 'pm-tabs', role: 'tablist', hidden: true });
    var status = el('p', { class: 'pm-status', role: 'status', 'aria-live': 'polite' });
    var upList = el('div', { class: 'pm-up' });
    var view = el('div', { class: 'pm-view' });
    var file = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    var uploadTo = null; // project id the next upload goes into
    root.append(tabs, status, upList, view, file);

    function say(t, err) { status.textContent = t || ''; status.className = 'pm-status' + (err ? ' err' : ''); }
    function slotLabel(name) { var s = slots.filter(function (x) { return x.slot === name; })[0]; return s ? s.label : name; }
    function project(id) { return projects.filter(function (x) { return x.id === id; })[0]; }
    function inProject(id) { return photos.filter(function (p) { return p.project_id === id; }); }
    function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
    function addButton(label, projectId) {
      return el('button', { type: 'button', class: 'pm-add', onclick: function () { uploadTo = projectId || null; file.click(); } }, '📷', label);
    }
    function optional(q) { return q.then(function (r) { return r.error ? [] : (r.data || []); }, function () { return []; }); }

    function load() {
      say('Loading…');
      return Promise.all([
        sb.from('site_slots').select('*').eq('business_id', biz.id).order('sort'),
        sb.from('site_photos').select('*').eq('business_id', biz.id).order('sort').order('created_at', { ascending: false }),
        optional(sb.from('site_projects').select('*').eq('business_id', biz.id).order('sort').order('created_at')),
        optional(sb.from('site_texts').select('*').eq('business_id', biz.id).order('sort')),
      ]).then(function (r) {
        if (r[1].error) throw r[1].error;
        slots = (r[0].data || []).filter(function (s) { return !s.retired; });
        photos = r[1].data || [];
        projects = r[2]; texts = r[3];
        tabbed = !!(opts.projects || projects.length || texts.length);
        if (tabbed && tab === 'projects' && !(opts.projects || projects.length)) tab = 'spots';
        say('');
        paint();
      }).catch(function (e) { say('Couldn’t load photos: ' + (e.message || e), true); });
    }

    // ---------- layout ----------
    function paint() {
      tabs.hidden = !tabbed;
      if (tabbed) {
        var list = [];
        if (opts.projects || projects.length) list.push(['projects', '🏠 Projects']);
        list.push(['spots', '🖼️ Photo spots']);
        if (texts.length) list.push(['words', '✏️ Words']);
        tabs.replaceChildren.apply(tabs, list.map(function (t) {
          return el('button', { type: 'button', role: 'tab', class: 'pm-tab' + (tab === t[0] ? ' on' : ''), 'aria-selected': tab === t[0] ? 'true' : 'false',
            onclick: function () { tab = t[0]; openId = null; say(''); paint(); window.scrollTo(0, 0); } }, t[1]);
        }));
      }
      if (!tabbed || tab === 'spots') return paintSpots();
      if (tab === 'words') return paintWords();
      if (openId && project(openId)) return paintProject(project(openId));
      openId = null; paintProjects();
    }

    function grid(list, ctx) {
      if (!list.length) return el('div', { class: 'pm-empty' }, ctx.empty);
      return el('div', { class: 'pm-grid' }, list.map(function (p, i) { return card(p, i, list, ctx); }));
    }

    function paintSpots() {
      var gallery = !(opts.projects || projects.length); // with projects, the projects are the gallery
      view.replaceChildren(
        el('div', { class: 'pm-bar' }, addButton('Add photos')),
        el('p', { class: 'pm-help' }, tabbed
          ? 'Fill the photo spots on the website. Upload here, or use a photo already in a project, then pick its spot. A spot keeps its current picture until you fill it.'
          : 'Pick one or many from your camera roll. Then, for each photo: choose the spot on the website it fills (or none), whether it shows in the photo gallery, and a short caption. Changes show on the website straight away (refresh the site to see them).'),
        tabbed && slots.length ? spotList() : null,
        grid(photos, { spots: true, gallery: gallery, projectPick: projects.length > 0,
          empty: 'No photos yet. Tap “Add photos” to upload from your phone. Until then the website keeps its current pictures.' }));
    }

    function spotList() {
      return el('div', { class: 'pm-spots' }, slots.map(function (s) {
        var p = photos.filter(function (x) { return x.slot === s.slot; })[0];
        return el('div', { class: 'pm-spot' + (p ? ' full' : '') },
          p ? el('img', { src: p.url, alt: '' }) : el('span', { class: 'pm-spot-empty' }, '—'),
          el('span', {}, s.label, el('small', {}, p ? 'Has your photo' : 'Current picture (not filled yet)')));
      }));
    }

    // ---------- projects ----------
    function paintProjects() {
      var form = el('form', { class: 'pm-new', hidden: true });
      var name = el('input', { type: 'text', maxlength: '120', placeholder: 'e.g. 214 Peninsula Rd', required: true, autocomplete: 'off' });
      var kind = el('input', { type: 'text', maxlength: '80', placeholder: 'e.g. Custom Homes', list: 'pm-kinds', autocomplete: 'off' });
      var kinds = el('datalist', { id: 'pm-kinds' }, uniq(projects.map(function (p) { return p.kind; })).map(function (k) { return el('option', { value: k }); }));
      form.append(
        el('label', {}, 'Project name', name),
        el('label', {}, 'Type of project (optional)', kind, kinds),
        el('div', { class: 'pm-acts two' },
          el('button', { type: 'button', onclick: function () { form.hidden = true; newBtn.hidden = false; } }, 'Cancel'),
          el('button', { type: 'submit', class: 'pm-primary' }, 'Create project')));
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var t = name.value.trim(); if (!t) { name.focus(); return; }
        var top = projects.length ? Math.min.apply(null, projects.map(function (p) { return p.sort; })) - 1 : 0;
        say('Creating…');
        sb.from('site_projects').insert({ business_id: biz.id, site: biz.slug, title: t, kind: kind.value.trim() || null, sort: top })
          .select().single().then(function (r) {
            if (r.error) { say('Not created: ' + r.error.message, true); return; }
            projects.unshift(r.data); openId = r.data.id; paint(); window.scrollTo(0, 0);
            say('Project created. Now add its photos.');
          });
      });
      var newBtn = el('button', { type: 'button', class: 'pm-add', onclick: function () { form.hidden = false; newBtn.hidden = true; name.focus(); } }, '➕', 'New project');
      view.replaceChildren(
        el('div', { class: 'pm-bar' }, newBtn), form,
        el('p', { class: 'pm-help' }, 'These are the projects on your website, in this order. Tap one to add photos, pick its cover, rename it or hide it.'),
        projects.length ? el('div', { class: 'pm-plist' }, projects.map(projectCard))
          : el('div', { class: 'pm-empty' }, 'No projects yet. Tap “New project” to start one.'));
    }

    function coverOf(pr) { var ph = inProject(pr.id); return pr.cover_url || (ph[0] && ph[0].url) || ''; }

    function projectCard(pr) {
      var n = inProject(pr.id).length, c = coverOf(pr);
      return el('button', { type: 'button', class: 'pm-pcard', onclick: function () { openId = pr.id; say(''); paint(); window.scrollTo(0, 0); } },
        el('span', { class: 'pm-pthumb' }, c ? el('img', { src: c, alt: '', loading: 'lazy' }) : el('span', {}, 'No photos yet'),
          pr.visible ? null : el('span', { class: 'pm-badge' }, '🙈 Hidden')),
        el('span', { class: 'pm-pinfo' }, el('b', {}, pr.title), pr.kind ? el('span', {}, pr.kind) : null,
          el('small', {}, plural(n, 'photo'))));
    }

    function saveProject(pr, patch, okMsg) {
      return sb.from('site_projects').update(patch).eq('id', pr.id).then(function (r) {
        if (r.error) { say('Not saved: ' + r.error.message, true); return false; }
        Object.assign(pr, patch); if (okMsg) say(okMsg); return true;
      });
    }

    function paintProject(pr) {
      var i = projects.indexOf(pr);
      var name = el('input', { type: 'text', maxlength: '120', value: pr.title });
      var kind = el('input', { type: 'text', maxlength: '80', value: pr.kind || '', list: 'pm-kinds2', placeholder: 'e.g. Custom Homes' });
      var kinds = el('datalist', { id: 'pm-kinds2' }, uniq(projects.map(function (p) { return p.kind; })).map(function (k) { return el('option', { value: k }); }));
      name.addEventListener('change', function () { var t = name.value.trim(); if (!t) { name.value = pr.title; return; } saveProject(pr, { title: t }, 'Name saved'); });
      kind.addEventListener('change', function () { saveProject(pr, { kind: kind.value.trim() || null }, 'Type saved'); });
      var vis = el('input', { type: 'checkbox', checked: pr.visible });
      vis.addEventListener('change', function () { saveProject(pr, { visible: vis.checked }, vis.checked ? 'Shows on the website' : 'Hidden from the website'); });
      var ph = inProject(pr.id);
      view.replaceChildren(
        el('button', { type: 'button', class: 'pm-back', onclick: function () { openId = null; say(''); paint(); } }, '← All projects'),
        el('div', { class: 'pm-pedit' },
          el('label', {}, 'Project name', name),
          el('label', {}, 'Type of project', kind, kinds),
          el('label', { class: 'pm-toggle' }, vis, 'Show this project on the website'),
          el('div', { class: 'pm-acts' },
            el('button', { type: 'button', disabled: i <= 0, onclick: function () { moveProject(i, -1); } }, '↑ Earlier'),
            el('button', { type: 'button', disabled: i >= projects.length - 1, onclick: function () { moveProject(i, 1); } }, '↓ Later'),
            el('button', { type: 'button', class: 'pm-del', onclick: function () { removeProject(pr); } }, '🗑 Delete'))),
        el('div', { class: 'pm-bar' }, addButton('Add photos to this project', pr.id)),
        el('p', { class: 'pm-help' }, ph.length
          ? 'Tap “★ Make cover” on the photo you want on the project’s card. The order here is the order on the website.'
          : (pr.cover_url ? 'This project only has its card picture so far. Add photos and visitors can tap the card to see them all.' : 'Add the project’s photos from your phone.')),
        grid(ph, { project: pr, projectPick: true, empty: 'No photos in this project yet.' }));
    }

    function moveProject(i, dlt) {
      var j = i + dlt; if (j < 0 || j >= projects.length || busy) return;
      busy = true;
      var t = projects[i]; projects[i] = projects[j]; projects[j] = t;
      paint();
      Promise.all(projects.map(function (p, k) { return p.sort === k ? true : saveProject(p, { sort: k }); }))
        .then(function () { busy = false; say('Order saved'); });
    }

    function removeProject(pr) {
      var n = inProject(pr.id).length;
      if (!window.confirm('Delete the project “' + pr.title + '” from the website?' +
        (n ? ' Its ' + plural(n, 'photo') + ' are kept: you’ll find them under Photo spots.' : ''))) return;
      sb.from('site_projects').delete().eq('id', pr.id).then(function (r) {
        if (r.error) { say('Not deleted: ' + r.error.message, true); return; }
        projects = projects.filter(function (x) { return x !== pr; });
        photos.forEach(function (p) { if (p.project_id === pr.id) p.project_id = null; });
        openId = null; paint(); say('Project deleted');
      });
    }

    // ---------- words ----------
    function paintWords() {
      view.replaceChildren(
        el('p', { class: 'pm-help' }, 'Words on the website you can change. Leave a box empty to keep what the website says now. Changes show straight away (refresh the site to see them).'),
        el('div', { class: 'pm-words' }, texts.map(wordBox)));
    }

    function wordBox(t) {
      var input = t.multiline
        ? el('textarea', { rows: '4', maxlength: '2000', placeholder: 'Empty: the website keeps its current words' })
        : el('input', { type: 'text', maxlength: '300', placeholder: 'Empty: the website keeps its current words' });
      input.value = t.value || '';
      var note = el('small', { class: 'pm-saved' });
      var timer;
      function saveNow() {
        clearTimeout(timer);
        var v = input.value.trim() || null;
        if (v === (t.value || null)) return;
        note.textContent = 'Saving…';
        sb.from('site_texts').update({ value: v, updated_at: new Date().toISOString() }).eq('business_id', biz.id).eq('key', t.key).then(function (r) {
          if (r.error) { note.textContent = 'Not saved: ' + r.error.message; note.className = 'pm-saved err'; return; }
          t.value = v; note.className = 'pm-saved'; note.textContent = v ? '✓ Saved' : '✓ Saved: the website shows its original words';
        });
      }
      input.addEventListener('input', function () { clearTimeout(timer); note.textContent = ''; timer = setTimeout(saveNow, 1200); });
      input.addEventListener('blur', saveNow);
      return el('div', { class: 'pm-word' },
        el('label', {}, t.label, t.hint ? el('small', {}, t.hint) : null, input), note);
    }

    // ---------- one photo ----------
    function save(p, patch, okMsg) {
      return sb.from('site_photos').update(patch).eq('id', p.id).then(function (r) {
        if (r.error) { say('Not saved: ' + r.error.message, true); return false; }
        Object.assign(p, patch);
        if (okMsg) say(okMsg);
        return true;
      });
    }

    function card(p, i, list, ctx) {
      var cap = el('input', { type: 'text', maxlength: '300', value: p.caption || '', placeholder: 'e.g. Kitchen, after', enterkeyhint: 'done' });
      var capT;
      cap.addEventListener('input', function () { clearTimeout(capT); capT = setTimeout(function () { save(p, { caption: cap.value.trim() || null }, 'Caption saved'); }, 700); });
      cap.addEventListener('keydown', function (e) { if (e.key === 'Enter') cap.blur(); });

      var gal = el('input', { type: 'checkbox', checked: p.in_gallery });
      gal.addEventListener('change', function () { save(p, { in_gallery: gal.checked }, gal.checked ? 'Shows in the gallery' : 'Hidden from the gallery'); });

      var sel = null;
      if (ctx.spots && slots.length) {
        sel = el('select', { 'aria-label': 'Spot on the website' },
          el('option', { value: '' }, tabbed ? '— Not in a spot —' : '— Not in a spot (gallery only) —'),
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
      }

      var psel = null;
      if (ctx.projectPick && projects.length) {
        psel = el('select', { 'aria-label': 'Project' },
          el('option', { value: '' }, '— Not in a project —'),
          projects.map(function (pr) { return el('option', { value: pr.id, selected: p.project_id === pr.id }, pr.title); }));
        psel.addEventListener('change', function () {
          var v = psel.value || null, was = p.project_id && project(p.project_id);
          psel.disabled = true;
          var jobs = [save(p, { project_id: v }, v ? 'Moved to ' + project(v).title : 'Taken out of the project')];
          if (was && was.cover_url === p.url) jobs.push(saveProject(was, { cover_url: null }));
          Promise.all(jobs).then(function () { psel.disabled = false; paint(); });
        });
      }

      var isCover = ctx.project && ctx.project.cover_url === p.url;
      var coverBtn = ctx.project ? el('button', { type: 'button', class: 'pm-cover' + (isCover ? ' on' : ''), disabled: isCover,
        onclick: function () { saveProject(ctx.project, { cover_url: p.url }, 'Cover picture saved').then(paint); } },
        isCover ? '★ This is the cover' : '☆ Make cover') : null;

      var up = el('button', { type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: function () { move(list, i, -1); } }, '↑ Up');
      var down = el('button', { type: 'button', 'aria-label': 'Move down', disabled: i === list.length - 1, onclick: function () { move(list, i, 1); } }, '↓ Down');
      var del = el('button', { type: 'button', class: 'pm-del', onclick: function () { remove(p); } }, '🗑 Delete');
      var pr = p.project_id && project(p.project_id);

      return el('div', { class: 'pm-card' },
        el('div', { class: 'pm-thumb' }, el('img', { src: p.url, alt: p.caption || '', loading: 'lazy' }),
          p.slot && slots.some(function (s) { return s.slot === p.slot; }) ? el('span', { class: 'pm-badge' }, '📍 ' + slotLabel(p.slot)) : null,
          !ctx.project && pr ? el('span', { class: 'pm-badge pm-badge2' }, '🏠 ' + pr.title) : null,
          isCover ? el('span', { class: 'pm-badge' }, '★ Cover') : null),
        el('div', { class: 'pm-body' },
          coverBtn,
          sel ? el('label', {}, 'Spot on the website', sel) : null,
          psel ? el('label', {}, 'Project', psel) : null,
          ctx.gallery ? el('label', { class: 'pm-toggle' }, gal, 'Show in photo gallery') : null,
          el('label', {}, 'Caption', cap),
          el('div', { class: 'pm-acts' }, up, down, del)));
    }

    function move(list, i, dlt) {
      var j = i + dlt;
      if (j < 0 || j >= list.length || busy) return;
      busy = true;
      var a = list[i], b = list[j];
      var sa = a.sort, sb2 = b.sort;
      if (sa === sb2) { sa = i; sb2 = j; }
      var jobs = [save(a, { sort: sb2 }), save(b, { sort: sa })];
      photos.sort(function (x, y) { return x.sort - y.sort || String(y.created_at).localeCompare(String(x.created_at)); });
      paint();
      Promise.all(jobs).then(function () {
        photos.sort(function (x, y) { return x.sort - y.sort || String(y.created_at).localeCompare(String(x.created_at)); });
        busy = false; paint(); say('Order saved');
      });
    }

    function remove(p) {
      if (!window.confirm('Delete this photo from the website? This can’t be undone.')) return;
      say('Deleting…');
      sb.from('site_photos').delete().eq('id', p.id).then(function (r) {
        if (r.error) { say('Not deleted: ' + r.error.message, true); return; }
        sb.storage.from(BUCKET).remove([p.path]).catch(function () {});
        var pr = p.project_id && project(p.project_id);
        if (pr && pr.cover_url === p.url) saveProject(pr, { cover_url: null });
        photos = photos.filter(function (x) { return x.id !== p.id; });
        paint(); say('Photo deleted');
      });
    }

    file.addEventListener('change', function () {
      var files = [].slice.call(file.files || []);
      var projectId = uploadTo;
      file.value = '';
      if (!files.length) return;
      q('.pm-add').forEach(function (b) { b.disabled = true; });
      // new photos go first (in the project when adding to one)
      var pool = projectId ? inProject(projectId) : photos;
      var top = pool.length ? Math.min.apply(null, pool.map(function (p) { return p.sort; })) : 0;
      var done = 0, failed = 0;
      var rows = files.map(function (f) { var r = el('div', {}, '⏳ ' + (f.name || 'photo')); upList.append(r); return r; });
      // one at a time: kinder to a phone's memory and a weak signal
      files.reduce(function (chain, f, n) {
        return chain.then(function () {
          rows[n].textContent = '⏳ Shrinking ' + (f.name || 'photo') + '…';
          return shrink(f).then(function (s) {
            var path = biz.slug + '/' + rid() + '.' + s.ext;
            rows[n].textContent = '⬆️ Uploading ' + (f.name || 'photo') + '…';
            return sb.storage.from(BUCKET).upload(path, s.blob, { contentType: s.type, cacheControl: '31536000', upsert: false }).then(function (u) {
              if (u.error) throw u.error;
              var url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
              var row = { business_id: biz.id, path: path, url: url, in_gallery: true, sort: top - files.length + n, width: s.w, height: s.h };
              if (projectId) row.project_id = projectId;
              return sb.from('site_photos').insert(row).select().single();
            }).then(function (ins) {
              if (ins.error) { sb.storage.from(BUCKET).remove([path]).catch(function () {}); throw ins.error; }
              photos.push(ins.data); done++;
              rows[n].textContent = '✅ ' + (f.name || 'photo');
            });
          }).catch(function (e) { failed++; rows[n].textContent = '⚠️ ' + (f.name || 'photo') + ': ' + (e.message || e); });
        });
      }, Promise.resolve()).then(function () {
        photos.sort(function (a, b) { return a.sort - b.sort || String(b.created_at).localeCompare(String(a.created_at)); });
        var pr = projectId && project(projectId);
        // a project's first real photos replace a borrowed card picture
        var job = pr && done && (!pr.cover_url || !/\/site-photos\//.test(pr.cover_url)) && inProject(pr.id).length === done
          ? saveProject(pr, { cover_url: inProject(pr.id)[0].url }) : Promise.resolve();
        return job.then(function () {
          paint();
          say(done + ' added' + (failed ? ', ' + failed + ' didn’t work' : '') +
            (pr ? '. They show in “' + pr.title + '” on the website.' : '. Now pick a spot or caption for each.'), !!failed);
          setTimeout(function () { rows.forEach(function (r) { if (r.textContent.charAt(0) === '✅') r.remove(); }); }, 4000);
        });
      });
    });

    function q(sel) { return [].slice.call(root.querySelectorAll(sel)); }
    function uniq(a) { return a.filter(function (x, k) { return x && a.indexOf(x) === k; }); }

    load();
    return { reload: load };
  }

  window.PhotoManager = { mount: mount, shrink: shrink };
})();
