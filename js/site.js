/* The Differents — differents.band
   One script for every page. Each block no-ops when its markup is absent. */
(() => {
  'use strict';

  /* ── off-register headings settle as they scroll in ───────────── */
  const regs = document.querySelectorAll('.reg');
  if (regs.length) {
    if (!('IntersectionObserver' in window)) {
      regs.forEach(el => el.classList.add('settled'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add('settled'); io.unobserve(e.target); }
        });
      }, { threshold: 0.35 });
      regs.forEach(el => io.observe(el));
    }
  }

  /* ── mobile menu ──────────────────────────────────────────────── */
  const burger = document.querySelector('.burger');
  const menu = document.getElementById('menu');
  if (burger && menu) {
    // Below this width the menu is a full-screen overlay. Above it, the links
    // are the ordinary desktop nav and must never be inert.
    const overlay = window.matchMedia('(max-width: 860px)');
    // A closed overlay is only hidden by opacity — a CSS visibility transition
    // does not reliably settle to hidden, which would leave four invisible
    // links sitting in the tab order. inert takes them out of the focus order
    // and the accessibility tree outright.
    const syncInert = () => menu.toggleAttribute(
      'inert', overlay.matches && burger.getAttribute('aria-expanded') !== 'true');

    const setOpen = (open) => {
      burger.setAttribute('aria-expanded', String(open));
      menu.toggleAttribute('data-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
      syncInert();
    };
    syncInert();
    overlay.addEventListener('change', syncInert);
    burger.addEventListener('click', () =>
      setOpen(burger.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setOpen(false); burger.focus();
      }
    });
  }

  /* ── helpers ──────────────────────────────────────────────────── */
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const getJSON = (path) => fetch(path, { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(`${path} → ${r.status}`); return r.json(); });

  const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // parse as local midnight — new Date('2026-08-01') is UTC and can land on
  // the previous day west of Greenwich, which would hide a show on its own date
  const parseDay = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const todayStamp = () => { const t = new Date(); t.setHours(0,0,0,0); return t; };

  /* ── calendar links ───────────────────────────────────────────── */
  // shows.json keeps the set time as one display string ("8:30–11:30pm",
  // "6–9pm") so a gig stays a single hand-edited row. Read that back into
  // wall-clock minutes rather than adding start/end fields to the JSON.
  // Anything unparseable returns null and the row simply renders without
  // calendar links — better than an event that is silently an hour out.
  const slugify = (v) => String(v || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const parseSpan = (time) => {
    const parts = String(time || '').toLowerCase().replace(/\s+/g, '').split(/[–—-]/);
    if (parts.length !== 2) return null;
    const read = (s) => {
      const m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
      if (!m) return null;
      const h = +m[1], min = +(m[2] || 0);
      if (min > 59 || h > 23) return null;
      if (m[3] && (h < 1 || h > 12)) return null;   // 13pm is a typo, not a time
      return { h, min, mer: m[3] || null };
    };
    const a = read(parts[0]), b = read(parts[1]);
    if (!a || !b) return null;
    // "8:30–11:30pm" spells the meridiem once; the start borrows it
    const mer = b.mer || a.mer;
    const to24 = (p, m) => (m ? (m === 'pm' ? p.h % 12 + 12 : p.h % 12) : p.h) * 60 + p.min;
    const start = to24(a, a.mer || mer);
    const end = to24(b, b.mer || mer);
    // a 10pm–1am set ends on the following day
    return { start, end: end <= start ? end + 1440 : end };
  };

  const VENUE_TZ = 'America/New_York';
  // A wall-clock time at the venue → the actual instant, with no hard-coded
  // offset: guess, ask Intl how that guess reads in the zone, correct by the
  // difference. The second pass only earns its keep for a set that runs
  // through a daylight-saving change.
  const zoned = (y, mo, d, mins) => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: VENUE_TZ, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
    const readBack = (t) => {
      const q = {};
      fmt.formatToParts(new Date(t)).forEach(x => { q[x.type] = x.value; });
      return Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour % 24, +q.minute);
    };
    const wall = Date.UTC(y, mo, d, 0, 0) + mins * 60000;
    let inst = wall;
    for (let i = 0; i < 2; i++) inst = wall - (readBack(inst) - inst);
    return new Date(inst);
  };

  const utcStamp = (dt) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  // one place to describe a gig, so the Google link and the .ics agree
  const calEvent = (s) => {
    const span = parseSpan(s.time);
    if (!span) return null;
    const d = s._d;
    const at = (mins) => zoned(d.getFullYear(), d.getMonth(), d.getDate(), mins);
    return {
      title: `The Differents at ${s.venue}`,
      where: [s.venue, s.address].filter(Boolean).join(', '),
      blurb: `Live music${s.time ? `, ${s.time}` : ''}. differents.band`,
      start: at(span.start),
      end: at(span.end)
    };
  };

  const googleCalUrl = (ev) => 'https://calendar.google.com/calendar/render?' +
    new URLSearchParams({
      action: 'TEMPLATE',
      text: ev.title,
      dates: `${utcStamp(ev.start)}/${utcStamp(ev.end)}`,
      location: ev.where,
      details: ev.blurb
    });

  const icsBlobUrl = (ev, s) => {
    const esc = (v) => String(v).replace(/([\;,])/g, '\\$1').replace(/\n/g, '\\n');
    // RFC 5545 measures the 75-character line limit in octets, and a venue
    // name or a time written with an en dash is not ASCII. Walk code points
    // and count their UTF-8 length, so a fold never lands mid-character.
    const enc = new TextEncoder();
    const fold = (line) => {
      const out = [];
      let cur = '', len = 0;
      for (const ch of line) {
        const n = enc.encode(ch).length;
        if (len + n > 72) { out.push(cur); cur = ' '; len = 1; }
        cur += ch; len += n;
      }
      out.push(cur);
      return out.join('\r\n');
    };
    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//The Differents//differents.band//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${s.date}-${slugify(s.venue)}@differents.band`,
      `DTSTAMP:${utcStamp(new Date())}`,
      `DTSTART:${utcStamp(ev.start)}`,
      `DTEND:${utcStamp(ev.end)}`,
      `SUMMARY:${esc(ev.title)}`,
      `LOCATION:${esc(ev.where)}`,
      `DESCRIPTION:${esc(ev.blurb)}`,
      'URL:https://differents.band/shows.html',
      'END:VEVENT',
      'END:VCALENDAR'
    ].map(fold).join('\r\n') + '\r\n';
    return URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  };


  /* ── shows ────────────────────────────────────────────────────── */
  const showsList = document.getElementById('shows-list');
  const strip = document.getElementById('next-show');

  if (showsList || strip) {
    getJSON(showsList ? 'data/shows.json' : 'data/shows.json').then(data => {
      const today = todayStamp();
      const all = (data.shows || [])
        .map(s => ({ ...s, _d: parseDay(s.date) }))
        .sort((a, b) => a._d - b._d);
      // a date that has been and gone comes off the site entirely
      const upcoming = all.filter(s => s._d >= today);

      if (strip) {
        const next = upcoming[0];
        if (!next) { strip.remove(); }
        else {
          const isTonight = next._d.getTime() === today.getTime();
          strip.dataset.when = isTonight ? 'tonight' : 'next';
          const inner = el('div', 'tonight-in');
          const pulse = el('span', 'pulse');
          pulse.append(el('i'), document.createTextNode(isTonight ? 'Tonight' : 'Next show'));
          const when = el('span', 'when',
            `${DAY[next._d.getDay()]} ${MON[next._d.getMonth()]} ${next._d.getDate()}` +
            `${next.time ? ' · ' + next.time : ''}${next.city ? ' · ' + next.city : ''}`);
          const link = el('a', 'tonight-link', 'All dates');
          link.href = 'shows.html';
          inner.append(pulse, el('strong', null, next.venue), when, link);
          strip.replaceChildren(inner);
        }
      }

      if (showsList) {
        const row = (s) => {
          const d = s._d;
          const wrap = el('div', 'show');
          if (d.getTime() === today.getTime()) wrap.classList.add('is-tonight');
          const date = el('div', 'show-date');
          date.append(DAY[d.getDay()], el('b', null, String(d.getDate()).padStart(2, '0')),
                      MON[d.getMonth()]);
          const mid = el('div');
          const venue = el('div', 'show-venue', s.venue);
          if (d.getTime() === today.getTime()) venue.append(el('span', 'tag', 'Tonight'));
          mid.append(venue);
          if (s.address) {
            const addr = el('div', 'show-addr');
            const a = el('a', null, s.address);
            a.href = 'https://maps.google.com/?q=' + encodeURIComponent(s.venue + ' ' + s.address);
            a.target = '_blank'; a.rel = 'noopener';
            addr.append(a);
            mid.append(addr);
          }
          const ev = calEvent(s);
          if (ev) {
            const cal = el('div', 'show-cal');
            const gcal = el('a', null, 'Google Calendar');
            gcal.href = googleCalUrl(ev);
            gcal.target = '_blank'; gcal.rel = 'noopener';
            const ical = el('a', null, 'Apple / Outlook');
            ical.href = icsBlobUrl(ev, s);
            ical.download = `the-differents-${slugify(s.venue)}-${s.date}.ics`;
            cal.append(gcal, ical);
            cal.prepend(el('span', 'show-cal-lead', 'Add to calendar'));
            mid.append(cal);
          }
          wrap.append(date, mid, el('div', 'show-time', s.time || ''));
          return wrap;
        };

        if (!upcoming.length) {
          showsList.append(el('p', 'empty',
            'No dates on the books right now. Check back soon, or get in touch to book us.'));
        } else {
          upcoming.forEach(s => showsList.append(row(s)));
        }
      }
    }).catch(err => {
      console.error(err);
      if (showsList) showsList.append(el('p', 'empty', 'Show dates are unavailable right now.'));
      strip?.remove();
    });
  }

  /* ── videos ───────────────────────────────────────────────────── */
  const videoGrid = document.getElementById('video-grid');
  if (videoGrid) {
    // The home page hand-picks its clips by slug in data-featured; videos.html
    // leaves it off and shows the lot. Clicking any card still opens the full
    // playlist, so a visitor who starts on a featured clip can keep going.
    const featured = (videoGrid.dataset.featured || '').trim().split(/\s+/).filter(Boolean);
    const limit = Number(videoGrid.dataset.limit) || Infinity;
    const slow = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPhone = window.matchMedia('(max-width: 700px)');
    const inFeed = () => onPhone.matches;
    let playlist = [];
    let index = 0;

    /* ── the dialog, built here so every page with a grid gets the same
          player and the markup has one home ─────────────────────────── */
    const box = el('dialog', 'lightbox');
    box.setAttribute('aria-label', 'Video player');
    const closeBtn = el('button', 'lightbox-close', 'Close ✕');
    closeBtn.type = 'button';

    // desktop: one stage flanked by chevrons, with the setlist beneath
    const stage = el('div', 'lightbox-stage');
    const stageWrap = el('div', 'lb-stage-wrap');
    stageWrap.append(stage);
    const arrow = (cls, label, d) => {
      const b = el('button', 'lb-arrow ' + cls);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.innerHTML = `<svg viewBox="0 0 24 44" aria-hidden="true"><path d="${d}"/></svg>`;
      return b;
    };
    const prevBtn = arrow('lb-prev', 'Previous video', 'M19 3 5 22l14 19');
    const nextBtn = arrow('lb-next', 'Next video', 'M5 3l14 19L5 41');
    const row = el('div', 'lb-row');
    row.append(prevBtn, stageWrap, nextBtn);

    const nowTitle = el('div', 'lb-title');
    const upNext = el('div', 'lb-upnext');
    const list = el('div', 'lb-list');
    const scrollPrev = arrow('lb-scroll', 'Scroll setlist left', 'M19 3 5 22l14 19');
    const scrollNext = arrow('lb-scroll', 'Scroll setlist right', 'M5 3l14 19L5 41');
    const listWrap = el('div', 'lb-list-wrap');
    listWrap.append(scrollPrev, list, scrollNext);
    const barEl = el('div', 'lightbox-bar');
    barEl.append(nowTitle, upNext, listWrap);
    const inner = el('div', 'lightbox-inner');
    inner.append(row, barEl);

    /* phone: a snapping list of clips. One blurred backdrop sits behind the
       whole thing rather than one per panel, which would stack three different
       blurs into visible bands. */
    const scrim = el('div', 'lb-scrim');
    const feed = el('div', 'lb-feed');
    // the warming players wait here: present so they keep buffering, but
    // invisible. A media element out of the document may stop loading.
    const parking = el('div', 'lb-parking');
    box.append(closeBtn, inner, scrim, feed, parking);
    document.body.append(box);

    /* ── the fade, desktop only ────────────────────────────────────── */
    let fadeGuard = 0;
    const showStage = () => { clearTimeout(fadeGuard); stage.classList.remove('is-fading'); };
    const hideStage = () => {
      stage.classList.add('is-fading');
      clearTimeout(fadeGuard);
      fadeGuard = setTimeout(showStage, 2500);
    };

    let cameHereAutomatically = false;
    let failRun = 0;

    // 1080p by default; the smaller rendition on phones and thin connections
    const pickSource = (self) => {
      const narrow = window.matchMedia('(max-width: 900px)').matches;
      const c = navigator.connection;
      const thin = c && (c.saveData || /2g|3g/.test(c.effectiveType || ''));
      const order = (narrow || thin) ? ['720', '1080'] : ['1080', '720'];
      return order.map(k => self.sources[k]).find(Boolean);
    };
    const srcFor = (item) => pickSource(item.self);

    /* ── the players ───────────────────────────────────────────────────
       Three of them. In the feed the one you are watching sits between the
       clip before and the clip after, both already holding their own video,
       so a swipe either way starts playing rather than waiting on the
       network. On desktop only two are ever in play, ping-ponging. */
    let live = null;                 // the player you are actually watching
    const players = [];
    const assigned = new Map();      // playlist index -> player, feed only

    const makePlayer = () => {
      const v = el('video', 'lb-video');
      v.preload = 'metadata';
      v.setAttribute('playsinline', '');
      const track = el('div', 'lb-progress');
      const fill = el('div', 'lb-progress-fill');
      track.append(fill);
      const wrap = el('div', 'lb-media');
      wrap.append(v, track);
      const self = { v, track, fill, wrap };

      v.addEventListener('playing', () => { if (live === self) { failRun = 0; showStage(); } });
      v.addEventListener('ended', () => { if (live === self) go(index + 1, true); });
      v.addEventListener('error', () => {
        if (live !== self) return;   // a warming player failing is no reason to move on
        showStage();
        if (cameHereAutomatically && ++failRun < playlist.length) go(index + 1, true);
      });
      v.addEventListener('timeupdate', () => {
        if (v.duration) fill.style.width = `${(v.currentTime / v.duration) * 100}%`;
      });
      // tap to pause and resume; the scrubber handles its own taps
      wrap.addEventListener('click', (e) => {
        if (!inFeed() || e.target.closest('.lb-progress')) return;
        if (v.paused) v.play().catch(() => {}); else v.pause();
      });
      const scrub = (e) => {
        const r = track.getBoundingClientRect();
        const at = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        if (v.duration) v.currentTime = at * v.duration;
      };
      track.addEventListener('pointerdown', (e) => {
        track.setPointerCapture(e.pointerId);
        scrub(e);
        const move = (ev) => scrub(ev);
        const up = () => { track.removeEventListener('pointermove', move);
                           track.removeEventListener('pointerup', up); };
        track.addEventListener('pointermove', move);
        track.addEventListener('pointerup', up);
      });
      players.push(self);
      return self;
    };
    makePlayer(); makePlayer(); makePlayer();

    const park = (p) => {
      p.v.muted = true;      // never leave a hidden player able to make noise
      if (p.wrap.parentElement !== parking) parking.append(p.wrap);
    };

    const releaseAll = () => {
      players.forEach(p => { p.v.pause(); park(p); });
      assigned.clear();
      live = null;
    };

    /* preload="auto" is only a hint, and phones in particular treat it as one:
       they fetch a little and stop, leaving the decoder cold. Muted playback,
       by contrast, is allowed without a gesture on every browser — so a warming
       clip is briefly played muted and then paused back at zero. That forces
       the pipeline to spin up and the first frame to decode, which is the part
       you were feeling as a delay. */
    const prime = (p) => {
      if (p.primed || p === live) return;
      p.v.muted = true;
      const settled = () => {
        p.v.removeEventListener('playing', settled);
        if (p === live) return;          // it was promoted mid-prime; leave it running
        p.v.pause();
        try { p.v.currentTime = 0; } catch (e) { /* not seekable yet */ }
        p.primed = true;
      };
      p.v.addEventListener('playing', settled);
      const pr = p.v.play();
      if (pr) pr.catch(() => {});        // refused: preload alone still applies
    };

    const loadInto = (p, item) => {
      const src = srcFor(item);
      if (p.v.getAttribute('src') !== src) {
        p.v.src = src;
        p.primed = false;                // a new clip needs priming again
      }
      p.v.poster = item.self.poster || '';
      p.v.preload = 'auto';
      if (p !== live) prime(p);
    };

    const startLive = () => {
      if (!live) return;
      live.v.muted = false;              // it may have been primed muted
      const played = live.v.play();
      if (played) played.catch(() => showStage());
    };

    /* ── phone feed ────────────────────────────────────────────────── */
    let settling = false;
    let scrollIdle = 0;

    // panels are shorter than the screen and snap to the middle, so the nearest
    // one is whichever centre is closest to the viewport's centre
    const nearestPanel = () => {
      const mid = feed.scrollTop + feed.clientHeight / 2;
      let best = 0, bestGap = Infinity;
      [...feed.children].forEach((p, i) => {
        const gap = Math.abs(p.offsetTop + p.offsetHeight / 2 - mid);
        if (gap < bestGap) { bestGap = gap; best = i; }
      });
      return best;
    };

    // the first and last clip have to be able to reach the middle too
    const padFeed = () => {
      const first = feed.children[0];
      if (!first) return;
      const pad = Math.max(0, (feed.clientHeight - first.offsetHeight) / 2);
      feed.style.paddingTop = feed.style.paddingBottom = `${pad}px`;
    };

    /* Keep the clip before, the clip itself and the clip after mounted. Moving
       one step recycles only the panel that fell out of range, so the other two
       keep whatever they had already buffered. */
    const mountWindow = (i) => {
      const n = playlist.length;
      const want = [i - 1, i, i + 1].filter(k => k >= 0 && k < n);
      // at the first and last clip one neighbour does not exist, so reach one
      // further along rather than leaving the third player idle
      for (let step = 2; want.length < 3 && want.length < n; step++) {
        if (i + step < n) want.push(i + step);
        else if (i - step >= 0) want.unshift(i - step);
        else break;
      }
      [...assigned.keys()].forEach(k => {
        if (want.includes(k)) return;
        const p = assigned.get(k);
        p.v.pause();
        park(p);
        assigned.delete(k);
      });
      const free = players.filter(p => ![...assigned.values()].includes(p));
      want.forEach(k => {
        if (assigned.has(k)) return;
        const p = free.pop();
        if (!p) return;
        assigned.set(k, p);
        loadInto(p, playlist[k]);
        feed.children[k]?.querySelector('.lb-panel-slot').append(p.wrap);
      });
      live = assigned.get(i) || null;
      assigned.forEach((p, k) => {
        if (k === i) return;
        p.v.pause();
        prime(p);                        // neighbours stay warm and decoded
      });
      // the backdrop follows whatever is centred
      const poster = playlist[i]?.self?.poster;
      if (poster) scrim.style.backgroundImage = `url("${poster}")`;
      [...feed.children].forEach((p, k) => p.classList.toggle('is-live', k === i));
    };

    const activatePanel = (i) => {
      if (!feed.children[i]) return;
      index = i;
      syncBar();
      mountWindow(i);
      startLive();
    };

    const settleToPanel = () => {
      if (!inFeed() || settling) return;
      const i = nearestPanel();
      if (i !== index) activatePanel(i);
    };

    const watchPanels = () => {
      feed.addEventListener('scroll', () => {
        if (!inFeed() || settling) return;
        clearTimeout(scrollIdle);
        scrollIdle = setTimeout(settleToPanel, 90);   // wait for the flick to stop
      }, { passive: true });
      if ('onscrollend' in feed) feed.addEventListener('scrollend', settleToPanel);
    };

    const scrollToPanel = (i, smooth) => {
      const panel = feed.children[i];
      if (!panel) return;
      settling = true;
      const top = panel.offsetTop - (feed.clientHeight - panel.offsetHeight) / 2;
      feed.scrollTo({ top: Math.max(0, top),
                      behavior: smooth && !slow.matches ? 'smooth' : 'auto' });
      setTimeout(() => { settling = false; }, smooth ? 450 : 60);
    };

    /* ── desktop ───────────────────────────────────────────────────── */
    // two of the three ping-pong here, so next and previous are already warm
    const desktopLoad = (item) => {
      const src = srcFor(item);
      const warm = players.find(p => p !== live && p.v.getAttribute('src') === src);
      live = warm || players.find(p => p !== live) || players[0];
      loadInto(live, item);
      live.v.controls = true;
      if (live.wrap.parentElement !== stage) stage.append(live.wrap);
      players.forEach(p => { if (p !== live) { p.v.pause(); park(p); } });
      startLive();
      // warm the next one in the direction of travel
      const n = playlist.length;
      const ahead = playlist[(((index + travel) % n) + n) % n];
      const idle = players.find(p => p !== live);
      if (ahead && idle) loadInto(idle, ahead);
    };

    /* ── transport shared by both ──────────────────────────────────── */
    let travel = 1;
    const clampScroll = (x) =>
      Math.max(0, Math.min(list.scrollWidth - list.clientWidth, x));

    const syncScrollArrows = () => {
      const max = list.scrollWidth - list.clientWidth;
      scrollPrev.disabled = list.scrollLeft <= 1;
      scrollNext.disabled = list.scrollLeft >= max - 1;
    };

    const syncBar = () => {
      const v = playlist[index];
      const nxt = playlist[(index + 1) % playlist.length];
      nowTitle.replaceChildren(el('span', 'lb-song', v ? v.title : ''));
      if (v && v.artist) nowTitle.append(el('span', 'lb-by', v.artist));
      upNext.textContent = playlist.length > 1 && nxt ? `Up next · ${nxt.title}` : '';
      [...list.children].forEach((t, i) => {
        t.classList.toggle('is-current', i === index);
        if (i === index) t.setAttribute('aria-current', 'true');
        else t.removeAttribute('aria-current');
      });
      const t = list.children[index];
      if (t) list.scrollLeft = clampScroll(
        t.offsetLeft - (list.clientWidth - t.offsetWidth) / 2);
      syncScrollArrows();
    };

    // wraps at both ends, so the last clip rolls into the first
    const go = (i, auto) => {
      const n = playlist.length;
      if (!n) return;
      cameHereAutomatically = !!auto;
      const next = ((i % n) + n) % n;
      if (next !== index) travel = i > index ? 1 : -1;
      if (inFeed()) {
        /* Scroll, and let the settling pick the clip. Activating directly would
           let a failed or interrupted scroll play one thing while showing
           another; this way what you see is always what you hear. */
        const wrapping = next === 0 && index === n - 1;
        scrollToPanel(next, !wrapping);
        clearTimeout(scrollIdle);
        scrollIdle = setTimeout(() => { settling = false; settleToPanel(); },
                                wrapping ? 80 : 520);
        return;
      }
      index = next;
      syncBar();
      hideStage();
      setTimeout(() => desktopLoad(playlist[index]), slow.matches ? 0 : 280);
    };

    const enterFeed = () => {
      players.forEach(p => { p.v.controls = false; });
      padFeed();
      scrollToPanel(index, false);
      activatePanel(index);
    };

    const open = (slug) => {
      const found = playlist.findIndex(v => v.slug === slug);
      index = found < 0 ? 0 : found;
      box.showModal();
      document.body.style.overflow = 'hidden';
      // after showModal, never before: a display:none dialog measures zero
      syncBar();
      cameHereAutomatically = false;
      failRun = 0;
      showStage();
      releaseAll();
      if (inFeed()) { enterFeed(); return; }
      desktopLoad(playlist[index]);
    };

    prevBtn.addEventListener('click', () => go(index - 1));
    nextBtn.addEventListener('click', () => go(index + 1));
    list.addEventListener('click', e => {
      const t = e.target.closest('.lb-track');
      if (t) go(Number(t.dataset.i));
    });
    const scrollList = (dir) => list.scrollBy(
      { left: dir * Math.max(180, list.clientWidth * 0.8),
        behavior: slow.matches ? 'auto' : 'smooth' });
    scrollPrev.addEventListener('click', () => scrollList(-1));
    scrollNext.addEventListener('click', () => scrollList(1));
    list.addEventListener('scroll', syncScrollArrows, { passive: true });
    window.addEventListener('resize', () => { syncScrollArrows(); if (inFeed()) padFeed(); });
    // turning a phone sideways crosses the breakpoint mid-clip; keep playing
    onPhone.addEventListener('change', () => {
      if (!box.open) return;
      const at = live ? live.v.currentTime : 0;
      releaseAll();
      if (inFeed()) enterFeed();
      else { desktopLoad(playlist[index]); syncBar(); }
      if (at && live) live.v.currentTime = at;
    });
    closeBtn.addEventListener('click', () => box.close());
    box.addEventListener('click', e => { if (e.target === box) box.close(); });
    box.addEventListener('keydown', e => {
      if (e.target.tagName === 'VIDEO') return;   // let arrows scrub the player
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    });
    box.addEventListener('close', () => {
      document.body.style.overflow = '';
      players.forEach(p => {
        if (!p.v.getAttribute('src')) return;
        p.v.pause();
        p.v.removeAttribute('src');
        p.v.load();                   // releases the connection
      });
      releaseAll();
    });
    videoGrid.addEventListener('click', e => {
      const card = e.target.closest('.video');
      if (card) open(card.dataset.slug);
    });

    getJSON('data/videos.json').then(data => {
      playlist = data.videos || [];
      if (!playlist.length) throw new Error('no videos');

      // no thumbnails in the setlist: every clip is the same band on the same
      // patio, so the stills tell you nothing the title doesn't
      playlist.forEach((v, i) => {
        const t = el('button', 'lb-track');
        t.type = 'button';
        t.dataset.i = String(i);
        t.setAttribute('aria-label', `Play ${v.title}`);
        t.append(el('span', 'lb-track-n', String(i + 1).padStart(2, '0')),
                 el('span', 'lb-track-t', v.title));
        if (v.artist) t.append(el('span', 'lb-track-by', v.artist));
        list.append(t);
      });
      syncScrollArrows();

      playlist.forEach((v, i) => {
        const panel = el('article', 'lb-panel');
        panel.dataset.i = String(i);
        const slot = el('div', 'lb-panel-slot');
        const still = el('img', 'lb-panel-still');
        still.src = v.self?.poster || v.thumb || '';
        still.alt = '';
        still.loading = 'lazy';
        slot.append(still);
        const meta = el('div', 'lb-panel-meta');
        meta.append(el('h3', 'lb-panel-title', v.title));
        if (v.artist) meta.append(el('p', 'lb-panel-artist', v.artist));
        meta.append(el('p', 'lb-panel-pos', `${i + 1} / ${playlist.length}`));
        slot.append(meta);          // the title belongs to its own clip, over it
        panel.append(slot);
        // tapping a neighbour brings it to the middle
        panel.addEventListener('click', (e) => {
          if (e.target.closest('.lb-media')) return;
          if (Number(panel.dataset.i) !== index) go(Number(panel.dataset.i));
        });
        feed.append(panel);
      });
      watchPanels();

      // a named slug that no longer exists is dropped rather than leaving a
      // hole in the grid, so retiring a clip can never break the home page
      const shown = featured.length
        ? featured.map(s => playlist.find(v => v.slug === s)).filter(Boolean)
        : playlist.slice(0, limit);
      if (featured.length && shown.length < featured.length) {
        const missing = featured.filter(s => !playlist.some(v => v.slug === s));
        console.warn('video-grid: no clip for', missing.join(', '));
      }

      shown.forEach(v => {
        const card = el('button', 'video');
        card.type = 'button';
        card.dataset.slug = v.slug;
        card.setAttribute('aria-label', `Play ${v.title}`);

        const thumb = el('div', 'video-thumb');
        const img = new Image();
        img.src = v.thumb || '';
        img.alt = '';
        img.loading = 'lazy';
        const play = el('div', 'play');
        play.innerHTML = '<span><svg class="icon" aria-hidden="true">' +
          '<use href="images/icons.svg#i-play"/></svg></span>';
        thumb.append(img, play);

        const body = el('div', 'video-body');
        body.append(el('div', 'video-title', v.title));
        const meta = [v.artist, v.duration].filter(Boolean).join(' · ');
        if (meta) body.append(el('div', 'video-meta', meta));

        card.append(thumb, body);
        videoGrid.append(card);
      });
    }).catch(err => {
      console.error(err);
      box.remove();
      videoGrid.append(el('p', 'empty', 'Videos aren’t loading right now. '));
      const a = el('a', null, 'Watch on YouTube');
      a.href = 'https://www.youtube.com/@TheDifferentsCharleston';
      a.target = '_blank'; a.rel = 'noopener';
      videoGrid.querySelector('.empty').append(a);
    });
  }

  /* ── songs ────────────────────────────────────────────────────── */
  const songList = document.getElementById('song-list');
  if (songList) {
    const search = document.getElementById('song-search');
    const count = document.getElementById('song-count');
    const chips = [...document.querySelectorAll('.chip')];
    let songs = [];
    let filter = 'all';

    const render = () => {
      const q = (search?.value || '').trim().toLowerCase();
      const shown = songs.filter(s => {
        if (filter !== 'all' && !(s.sets || []).includes(filter)) return false;
        if (!q) return true;
        return s.title.toLowerCase().includes(q) ||
               (s.artist || '').toLowerCase().includes(q);
      });
      songList.replaceChildren();
      shown.forEach(s => {
        const li = el('li', 'song');
        const main = el('button', 'song-main');
        main.type = 'button';
        main.append(el('span', 'song-title', s.title));
        if (s.artist) main.append(el('span', 'song-artist', s.artist));
        li.append(main);

        // songs we know something about get an expandable fact
        if (s.fact) {
          const stats = [s.year, s.bpm && `${s.bpm} BPM`].filter(Boolean).join(' · ');
          main.append(el('span', 'song-more', 'i'));
          main.setAttribute('aria-expanded', 'false');
          const fact = el('p', 'song-fact');
          if (stats) fact.append(el('span', 'song-stats', stats));
          fact.append(document.createTextNode(s.fact));
          fact.hidden = true;
          li.append(fact);
          main.addEventListener('click', () => {
            const open = main.getAttribute('aria-expanded') === 'true';
            main.setAttribute('aria-expanded', String(!open));
            fact.hidden = open;
          });
        }
        songList.append(li);
      });
      if (!shown.length) {
        songList.append(el('li', 'empty', `Nothing matches “${search.value}”.`));
      }
      if (count) {
        count.textContent = shown.length === songs.length
          ? `${songs.length} songs`
          : `${shown.length} of ${songs.length}`;
      }
    };

    getJSON('data/songs.json').then(data => {
      songs = data.songs || [];
      render();
    }).catch(err => {
      console.error(err);
      songList.append(el('li', 'empty', 'The song list isn’t loading right now.'));
    });

    search?.addEventListener('input', render);
    chips.forEach(chip => chip.addEventListener('click', () => {
      filter = chip.dataset.filter;
      chips.forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
      render();
    }));
  }

  /* ── booking form ─────────────────────────────────────────────── */
  // Posts to Web3Forms over fetch so the visitor stays on the page. The
  // form keeps its action and its hidden access_key, so if this script
  // never runs the browser still submits it the ordinary way.
  const bookForm = document.getElementById('book-form');
  if (bookForm) {
    const status = document.getElementById('form-status');
    const send = bookForm.querySelector('button[type="submit"]');
    const FALLBACK = 'That didn\u2019t send. Email us at differents.charleston@gmail.com and we\u2019ll pick it up there.';
    const say = (msg, state) => { status.textContent = msg; status.dataset.state = state || ''; };

    bookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const label = send.textContent;
      send.textContent = 'Sending\u2026';
      send.disabled = true;
      say('', '');
      try {
        const res = await fetch(bookForm.action, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(bookForm)
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          bookForm.reset();
          say('Thanks \u2014 that\u2019s in our inbox. We\u2019ll come back to you shortly.', 'ok');
        } else {
          say(data.message || FALLBACK, 'bad');
        }
      } catch (err) {
        console.error(err);
        say(FALLBACK, 'bad');
      } finally {
        send.textContent = label;
        send.disabled = false;
      }
    });
  }

})();
