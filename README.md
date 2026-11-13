# Saltwater Building Co website

One-page site for Saltwater Building Co (Ucluelet, BC), built by Keen Falcon. Plain HTML/CSS/JS, no build step.
Hosted on Netlify: whatever is on `main` goes live about a minute after a commit.

```
index.html     The whole site: hero, Rising Tide feature, build story, services, projects,
               why us, how we build, areas, process, reviews, quote form, Ask Saltwater helper
thanks.html    Shown after the quote form is sent
404.html       Page not found
netlify.toml   Headers, short links (/quote, /contact), pre-launch noindex
robots.txt, sitemap.xml, favicon.svg
images/        Job photos go here
admin/photos/  Owner photo page (sign in, upload from the phone, pick spots, gallery, captions)
js/site-photos.js  Shows the owner's photos in the data-photo-slot spots and the #photos gallery
```

Owner photos: `admin/photos/` and `js/site-photos.js` come from `danstewart5/Sitewalk-leads` `site-kit/` (copy, don't
edit here). With nothing uploaded the page is unchanged; the #photos gallery stays hidden until it has photos.

## Still needed from Chris

While `<body class="draft">` is on, yellow tags on the page mark each of these.

| What | Where in index.html |
|---|---|
| Hero photo: best finished home | the `.slot` in the `hero` section |
| Rising Tide photo + 3 build updates | `#featured` |
| 4 stage photos of one build (lot, framing, weather-tight, finished) | `#story` |
| Project photos and job types for Rainforest Lane and Gibsons Landing | `#work` |
| 2–3 real client reviews (never made-up ones) | `TESTIMONIALS` comment |
| Google review link | `GOOGLE REVIEW LINK` comment (then remove `hidden`) |
| Business email (info@saltwaterbuildingco.ca?) | `#quote` contact list |
| Confirm: 2-5-10 warranty, "how we build" wording, reply time, Ask Saltwater answers | yellow tags |

To swap a placeholder for a photo, replace the `<figure class="slot">…</figure>` with
`<img src="images/name.webp" alt="what it shows" loading="lazy">` (keep the same aspect ratio).

## Quote form (Netlify Forms)

The form is named `quote` and sends people to `/thanks.html`. One optional photo or PDF (8 MB max).
1. After the first deploy: Netlify → Forms. If detection is off, click **Enable form detection** and redeploy.
2. Lead emails: Site configuration → Notifications → Emails and webhooks → Form submission notifications →
   Add notification → Email notification → Chris's email, form **quote**.
3. Send a test from the live page and check the spam folder the first time.

## Launch

1. Point the domain at Netlify (Domain management → Add a domain: saltwaterbuildingco.ca and www).
2. Delete the `noindex` meta tag in `index.html` (marked PRE-LAUNCH), the `X-Robots-Tag` line in `netlify.toml`,
   and swap `robots.txt` for the version in its comment.
3. Remove `class="draft"` from `<body>`.
4. Claim and fill in the Google Business Profile, with the website link and 604-848-4040.
