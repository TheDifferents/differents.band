#!/usr/bin/env python3
"""Build the site's JSON from the hand-maintained song files.

    data/songs.jsonl     the book — what we play        -> data/songs.json
    data/wishlist.jsonl  pitches — what we don't play   -> data/wishlist.json

Both are one song per line plus '#' comments, and both are the only things you
hand-edit. This script validates them, sorts them, rewrites them in place so you
can append a new song anywhere, and emits the site JSON with retired songs held
back.

    python3 tools/build_songs.py           build
    python3 tools/build_songs.py --check   validate only, touch nothing (CI-safe)
"""
import json, re, sys, os

BOOK     = 'data/songs.jsonl'
WISHLIST = 'data/wishlist.jsonl'

# shared descriptive fields, then the band-specific ones only the book carries
COMMON  = ('title', 'artist', 'year', 'bpm', 'fact')
BOOK_FIELDS     = ('title', 'artist', 'chords', 'duration', 'sets', 'status', 'year', 'bpm', 'fact')
WISHLIST_FIELDS = COMMON

STATUSES  = ('rotation', 'bullpen', 'retired')
SETS      = ('Acoustic', 'Electric')
PUBLISHED = ('rotation', 'bullpen')   # retired stays in the book, off the site

def norm(title):
    """Sort/compare key: lowercase, punctuation stripped. Also catches dupes."""
    t = title.lower().replace('’', "'").replace('&', 'and')
    t = re.sub(r"[^a-z0-9 ]", '', t)
    return re.sub(r'\s+', ' ', t).strip()

def load(path):
    songs, header, errors = [], [], []
    with open(path, encoding='utf-8') as fh:
        for n, raw in enumerate(fh, 1):
            line = raw.strip()
            if not line:
                continue
            if line.startswith('#'):
                if not songs:               # the top block documents the file
                    header.append(raw.rstrip('\n'))
                continue
            try:
                songs.append((n, json.loads(line)))
            except json.JSONDecodeError as e:
                errors.append(f'{path}:{n}: not valid JSON ({e.msg})')
    return songs, header, errors

def validate(path, raw, fields, is_book):
    errors, seen, clean = [], {}, []
    for n, s in raw:
        where = f'{path}:{n}'
        if not isinstance(s, dict):
            errors.append(f'{where}: expected an object, got {type(s).__name__}')
            continue
        title = s.get('title')
        if not title or not isinstance(title, str):
            errors.append(f'{where}: missing a title')
            continue
        key = norm(title)
        if key in seen:
            errors.append(f'{where}: "{title}" duplicates line {seen[key]}')
            continue
        seen[key] = n
        if unknown := set(s) - set(fields):
            errors.append(f'{where}: "{title}" has unknown field(s): ' + ', '.join(sorted(unknown)))
            continue

        year, bpm, fact = s.get('year'), s.get('bpm'), s.get('fact')
        if year is not None and not (isinstance(year, int) and 1900 <= year <= 2100):
            errors.append(f'{where}: "{title}" has year {year!r}, expected a 4-digit year or null')
            continue
        if bpm is not None and not (isinstance(bpm, int) and 30 <= bpm <= 300):
            errors.append(f'{where}: "{title}" has bpm {bpm!r}, expected 30-300 or null')
            continue
        if fact is not None and not isinstance(fact, str):
            errors.append(f'{where}: "{title}" has a non-text fact')
            continue

        out = {'title': title.replace('’', "'"), 'artist': s.get('artist') or None}
        if is_book:
            status = s.get('status', 'rotation')
            if status not in STATUSES:
                errors.append(f'{where}: "{title}" has status {status!r}, '
                              f'expected one of {", ".join(STATUSES)}')
                continue
            sets = s.get('sets') or []
            if not isinstance(sets, list) or any(x not in SETS for x in sets):
                errors.append(f'{where}: "{title}" has sets {sets!r}, '
                              f'expected a list of {" / ".join(SETS)}')
                continue
            out |= {'chords': s.get('chords') or None,
                    'duration': s.get('duration') or None,
                    'sets': sorted(sets), 'status': status}
        out |= {'year': year, 'bpm': bpm, 'fact': fact or None}
        clean.append({k: out.get(k) for k in fields})
    return clean, errors

def rewrite(path, header, songs, fields):
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(header) + '\n')
        for s in songs:
            fh.write(json.dumps({k: s[k] for k in fields},
                                ensure_ascii=False, separators=(', ', ': ')) + '\n')

check = '--check' in sys.argv
errors, built = [], {}

for path, fields, is_book in ((BOOK, BOOK_FIELDS, True), (WISHLIST, WISHLIST_FIELDS, False)):
    if not os.path.exists(path):
        continue
    raw, header, errs = load(path)
    songs, more = validate(path, raw, fields, is_book)
    errors += errs + more
    songs.sort(key=lambda s: norm(s['title']))
    built[path] = (header, songs, fields, is_book)

if errors:
    print(f'{len(errors)} problem(s):', file=sys.stderr)
    for e in errors:
        print('  ' + e, file=sys.stderr)
    sys.exit(1)

for path, (header, songs, fields, is_book) in built.items():
    if not check:
        rewrite(path, header, songs, fields)
        out = path.replace('.jsonl', '.json')
        rows = [s for s in songs if not is_book or s['status'] in PUBLISHED]
        os.makedirs('data', exist_ok=True)
        with open(out, 'w', encoding='utf-8') as fh:
            json.dump({'songs': rows}, fh, indent=2, ensure_ascii=False)
            fh.write('\n')

    label = 'book' if is_book else 'wishlist'
    if is_book:
        tally = {s: sum(1 for x in songs if x['status'] == s) for s in STATUSES}
        live = tally['rotation'] + tally['bullpen']
        print(f'{label:8s} {live:3d} on the site '
              f'({tally["rotation"]} rotation, {tally["bullpen"]} bullpen, '
              f'{tally["retired"]} retired)', end='')
    else:
        print(f'{label:8s} {len(songs):3d} pitched', end='')
    have = sum(1 for s in songs if s['fact'])
    print(f'  ·  {have}/{len(songs)} with a fact, '
          f'{sum(1 for s in songs if s["bpm"])} with a tempo')
