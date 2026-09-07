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
    const limit = Number(videoGrid.dataset.limit) || Infinity;
    const slow = window.matchMedia('(prefers-reduced-motion: reduce)');
    let playlist = [];   // the whole set, even where the grid shows fewer
    let index = 0;

    /* The dialog is built here rather than written into every page, so any page
       carrying a grid gets the same player and the markup has one home. */
    const box = el('dialog', 'lightbox');
    box.setAttribute('aria-label', 'Video player');
    const closeBtn = el('button', 'lightbox-close', 'Close ✕');
    closeBtn.type = 'button';

    /* The stage keeps its box while the clip inside it swaps. That is what the
       fade rides on — replacing the element would flash the backdrop. */
    const stage = el('div', 'lightbox-stage');
    const vid = el('video', 'lb-video');
    vid.controls = true;
    vid.preload = 'metadata';
    vid.setAttribute('playsinline', '');
    // the scrubber only shows in the phone feed, where native controls are off,
    // but it rides with the video so the two never get separated
    const bar2 = el('div', 'lb-progress');
    const fill = el('div', 'lb-progress-fill');
    bar2.append(fill);
    const media = el('div', 'lb-media');
    media.append(vid, bar2);
    stage.append(media);
    const stageWrap = el('div', 'lb-stage-wrap');
    stageWrap.append(stage);

    // chevrons as SVG, not glyphs — a ‹ scaled to 200px tall renders as a hairline
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
    // the setlist scrolls on its own arrows, so you can read ahead without
    // changing what is playing — these never call go()
    const scrollPrev = arrow('lb-scroll', 'Scroll setlist left', 'M19 3 5 22l14 19');
    const scrollNext = arrow('lb-scroll', 'Scroll setlist right', 'M5 3l14 19L5 41');
    const listWrap = el('div', 'lb-list-wrap');
    listWrap.append(scrollPrev, list, scrollNext);
    const bar = el('div', 'lightbox-bar');
    bar.append(nowTitle, upNext, listWrap);
    const inner = el('div', 'lightbox-inner');
    inner.append(row, bar);
    /* The phone layout. Panels are cheap — a blurred still, a poster and some
       text — and the single <video> moves into whichever one you land on.
       Twenty-two video elements on a phone would be brutal on data and memory. */
    const feed = el('div', 'lb-feed');
    box.append(closeBtn, inner, feed);
    document.body.append(box);

    const onPhone = window.matchMedia('(max-width: 700px)');
    const inFeed = () => onPhone.matches;

    /* ── the fade ──────────────────────────────────────────────────── */
    let fadeGuard = 0;
    const showStage = () => { clearTimeout(fadeGuard); stage.classList.remove('is-fading'); };
    const hideStage = () => {
      stage.classList.add('is-fading');
      // if the next clip never reports playing, don't strand the stage blank
      clearTimeout(fadeGuard);
      fadeGuard = setTimeout(showStage, 2500);
    };

    /* ── playback ──────────────────────────────────────────────────── */
    // 1080p by default; the smaller rendition on phones and thin connections
    const pickSource = (self) => {
      const narrow = window.matchMedia('(max-width: 900px)').matches;
      const c = navigator.connection;
      const thin = c && (c.saveData || /2g|3g/.test(c.effectiveType || ''));
      const order = (narrow || thin) ? ['720', '1080'] : ['1080', '720'];
      return order.map(k => self.sources[k]).find(Boolean);
    };

    let cameHereAutomatically = false;
    let failRun = 0;

    vid.addEventListener('playing', () => { failRun = 0; showStage(); });
    vid.addEventListener('ended', () => go(index + 1, true));
    vid.addEventListener('error', () => {
      // a clip that will not load must not stall the rotation, but if someone
      // chose it themselves, leave it be rather than jumping somewhere else
      showStage();
      if (cameHereAutomatically && ++failRun < playlist.length) go(index + 1, true);
    });

    const load = (v) => {
      vid.poster = v.self.poster || '';
      vid.src = pickSource(v.self);
      // opening the box is itself a click, so this is normally allowed. On an
      // automatic change a browser may refuse; the poster and controls remain.
      const p = vid.play();
      if (p) p.catch(() => showStage());
    };

    const stopPlayback = () => {
      if (!vid.getAttribute('src')) return;
      vid.pause();
      vid.removeAttribute('src');
      vid.load();                       // releases the connection
    };

    /* ── the phone feed ────────────────────────────────────────────── */
    let settling = false;      // suppress detection during a programmatic scroll
    let scrollIdle = 0;

    // move the player into a panel and start it there
    const activatePanel = (i) => {
      const panel = feed.children[i];
      if (!panel) return;
      const slot = panel.querySelector('.lb-panel-slot');
      if (media.parentElement !== slot) slot.append(media);
      index = i;
      // keep the desktop transport in step, so turning the phone sideways
      // mid-song lands on the right title rather than the last one it saw
      syncBar();
      load(playlist[i]);
    };

    /* Which panel you have landed on is just arithmetic: every panel is exactly
       one viewport tall, so the scroll offset divided by that height is the
       index. An IntersectionObserver would do the same job with more moving
       parts and quirkier behaviour alongside scroll snapping. */
    const nearestPanel = () => {
      const h = feed.clientHeight || 1;
      return Math.max(0, Math.min(playlist.length - 1,
                                  Math.round(feed.scrollTop / h)));
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
      // fires once the snap has settled, where supported; the timer covers the rest
      if ('onscrollend' in feed) feed.addEventListener('scrollend', settleToPanel);
    };

    const scrollToPanel = (i, smooth) => {
      const panel = feed.children[i];
      if (!panel) return;
      settling = true;
      feed.scrollTo({ top: panel.offsetTop,
                      behavior: smooth && !slow.matches ? 'smooth' : 'auto' });
      setTimeout(() => { settling = false; }, smooth ? 450 : 60);
    };

    // tap the video to pause and resume; the scrubber handles its own taps
    media.addEventListener('click', (e) => {
      if (!inFeed() || e.target.closest('.lb-progress')) return;
      if (vid.paused) vid.play().catch(() => {}); else vid.pause();
    });

    vid.addEventListener('timeupdate', () => {
      if (!vid.duration) return;
      fill.style.width = `${(vid.currentTime / vid.duration) * 100}%`;
    });

    const scrub = (e) => {
      const r = bar2.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      if (vid.duration) vid.currentTime = p * vid.duration;
    };
    bar2.addEventListener('pointerdown', (e) => {
      bar2.setPointerCapture(e.pointerId);
      scrub(e);
      const move = (ev) => scrub(ev);
      const up = () => { bar2.removeEventListener('pointermove', move);
                         bar2.removeEventListener('pointerup', up); };
      bar2.addEventListener('pointermove', move);
      bar2.addEventListener('pointerup', up);
    });

    /* ── transport ─────────────────────────────────────────────────── */
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
      // centred by hand rather than with scrollIntoView, which also scrolls
      // ancestors; instant here because it rides along with the fade
      const t = list.children[index];
      if (t) list.scrollLeft = clampScroll(
        t.offsetLeft - (list.clientWidth - t.offsetWidth) / 2);
      syncScrollArrows();
    };

    // wraps at both ends, so the last song rolls into the first
    const go = (i, auto) => {
      const n = playlist.length;
      if (!n) return;
      cameHereAutomatically = !!auto;
      const next = ((i % n) + n) % n;
      if (inFeed()) {
        /* Scroll, and let the settling pick the song. Activating directly would
           let a failed or interrupted scroll play one clip while showing
           another; this way what you see is always what you hear. */
        const wrapping = next === 0 && index === n - 1;
        scrollToPanel(next, !wrapping);   // wrapping 22 screens is a jump, not a glide
        clearTimeout(scrollIdle);
        scrollIdle = setTimeout(() => { settling = false; settleToPanel(); },
                                wrapping ? 80 : 520);
        return;
      }
      index = next;
      syncBar();
      hideStage();
      setTimeout(() => load(playlist[index]), slow.matches ? 0 : 280);
    };

    const open = (slug) => {
      const found = playlist.findIndex(v => v.slug === slug);
      index = found < 0 ? 0 : found;
      // showModal, not a hidden toggle: it puts the dialog in the top layer,
      // paints the real ::backdrop, traps focus, and handles Escape natively
      box.showModal();
      document.body.style.overflow = 'hidden';
      // after showModal, never before: a display:none dialog measures zero, so
      // the setlist would think it had nothing to scroll
      syncBar();
      cameHereAutomatically = false;   // an explicit choice, not the rotation
      failRun = 0;
      showStage();
      if (inFeed()) {
        vid.controls = false;          // the panel supplies its own controls
        scrollToPanel(index, false);
        activatePanel(index);
        return;
      }
      vid.controls = true;
      if (media.parentElement !== stage) stage.append(media);
      load(playlist[index]);
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
    window.addEventListener('resize', syncScrollArrows);
    // turning a phone sideways crosses the breakpoint mid-song; keep playing
    onPhone.addEventListener('change', () => {
      if (!box.open) return;
      const at = vid.currentTime;
      if (inFeed()) {
        vid.controls = false;
        scrollToPanel(index, false);
        activatePanel(index);
      } else {
        vid.controls = true;
        stage.append(media);
        syncBar();
      }
      if (at) vid.currentTime = at;
    });
    closeBtn.addEventListener('click', () => box.close());
    // clicking the scrim: the dialog fills the viewport, so any hit that lands
    // on the dialog itself rather than its contents is outside the player
    box.addEventListener('click', e => { if (e.target === box) box.close(); });
    box.addEventListener('keydown', e => {
      // let the arrow keys scrub the player when it has focus
      if (e.target === vid) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    });
    // fires for the close button, the scrim, and Escape alike
    box.addEventListener('close', () => {
      document.body.style.overflow = '';
      stopPlayback();
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
        // blurred copy of the still, so a 16:9 clip fills a portrait screen
        // without reading as letterboxed
        const bg = el('div', 'lb-panel-bg');
        if (v.self?.poster) bg.style.backgroundImage = `url("${v.self.poster}")`;
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
        panel.append(bg, slot, meta);
        feed.append(panel);
      });
      watchPanels();

      playlist.slice(0, limit).forEach(v => {
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
})();
