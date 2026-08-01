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
      const upcoming = all.filter(s => s._d >= today);
      const past = all.filter(s => s._d < today).reverse();

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
        const row = (s, isPast) => {
          const d = s._d;
          const wrap = el('div', 'show' + (isPast ? ' is-past' : ''));
          if (!isPast && d.getTime() === today.getTime()) wrap.classList.add('is-tonight');
          const date = el('div', 'show-date');
          date.append(DAY[d.getDay()], el('b', null, String(d.getDate()).padStart(2, '0')),
                      MON[d.getMonth()]);
          const mid = el('div');
          const venue = el('div', 'show-venue', s.venue);
          if (!isPast && d.getTime() === today.getTime()) venue.append(el('span', 'tag', 'Tonight'));
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
          upcoming.forEach(s => showsList.append(row(s, false)));
        }
        const pastWrap = document.getElementById('past-shows');
        if (pastWrap && past.length) {
          past.slice(0, 12).forEach(s => pastWrap.append(row(s, true)));
        } else if (pastWrap) {
          pastWrap.closest('.section')?.remove();
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
    getJSON('data/videos.json').then(data => {
      const items = (data.videos || []).slice(0, limit);
      if (!items.length) throw new Error('empty playlist');
      items.forEach(v => {
        const card = el('button', 'video');
        card.type = 'button';
        card.dataset.id = v.id;
        card.setAttribute('aria-label', `Play ${v.title}`);

        const thumb = el('div', 'video-thumb');
        const img = new Image();
        img.src = v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
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
      videoGrid.append(el('p', 'empty', 'Videos aren’t loading right now. '));
      const a = el('a', null, 'Watch the playlist on YouTube');
      a.href = 'https://www.youtube.com/@TheDifferentsCharleston';
      a.target = '_blank'; a.rel = 'noopener';
      videoGrid.querySelector('.empty').append(a);
    });

    /* lightbox — YouTube only loads once someone actually clicks */
    const box = document.getElementById('lightbox');
    if (box) {
      const frameWrap = box.querySelector('.lightbox-inner');
      let lastFocus = null;
      const open = (id, title) => {
        lastFocus = document.activeElement;
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
        iframe.title = title || 'The Differents video';
        iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        frameWrap.querySelector('iframe')?.remove();
        frameWrap.append(iframe);
        box.hidden = false;
        document.body.style.overflow = 'hidden';
        box.querySelector('.lightbox-close').focus();
      };
      const close = () => {
        box.hidden = true;
        frameWrap.querySelector('iframe')?.remove();  // stops playback
        document.body.style.overflow = '';
        lastFocus?.focus();
      };
      videoGrid.addEventListener('click', e => {
        const card = e.target.closest('.video');
        if (card) open(card.dataset.id, card.querySelector('.video-title')?.textContent);
      });
      box.addEventListener('click', e => { if (e.target === box) close(); });
      box.querySelector('.lightbox-close').addEventListener('click', close);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) close(); });
    }
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
        li.append(el('span', 'song-title', s.title));
        if (s.artist) li.append(el('span', 'song-artist', s.artist));
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
