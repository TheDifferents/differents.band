#!/usr/bin/env python3
"""Parse the Word setlists in Setlists/ into data/songs.json.

Each setlist row is a tab-separated Word paragraph laid out as
    Title <tabs> Chords <tabs> Duration
with the title sometimes split across two runs. Songs recur across
setlists, so entries are merged on a normalised title key.

Run after dropping new .docx setlists in:  python3 tools/build_songs.py
"""
import zipfile, re, glob, os, html, json, collections

PARA = re.compile(r'<w:p\b.*?</w:p>', re.S)
TOK  = re.compile(r'<w:tab/>|<w:br/>|<w:t(?:\s[^>]*)?>(.*?)</w:t>', re.S)
DUR  = re.compile(r'^\d{1,2}:\d{2}$')
CHORD = re.compile(r'^[A-G](#|b)?(m|maj|min|sus|dim|aug|add)?\d*(/[A-G](#|b)?)?$', re.I)

# section headers and other non-song lines
SKIP = re.compile(r'^(set\s*#?\d*|electric|acoustic|break|encore|set list|setlist)\b', re.I)

# songs listed under these headers are still in the repertoire — they just
# weren't in that night's set. Tracked only as metadata, never as exclusion.
BULLPEN = re.compile(r'^(bullpen|to work on|not part of set ?list)\b', re.I)
# ...until a new set header starts a real setlist again — several docs carry
# two gigs plus a bullpen sandwiched between them
SETHEAD = re.compile(r'^set\s*#?\s*\d', re.I)

# spellings that should collapse to one canonical entry
CANON = {
    "breakfast at tiffanys": "Breakfast at Tiffany's",
    "bad moon risin": "Bad Moon Rising",
    "dont you forget about me": "Don't You Forget About Me",
    "mary janes last dance": "Mary Jane's Last Dance",
    "runnin down a dream": "Runnin' Down a Dream",
    "jumpin jack flash": "Jumpin' Jack Flash",
    "crazy little thing": "Crazy Little Thing Called Love",
    "dock of the bay": "(Sittin' On) The Dock of the Bay",
    "3 am": "3 A.M.",
}

def para_text(p):
    parts = []
    for m in TOK.finditer(p):
        s = m.group(0)
        if s == '<w:tab/>':  parts.append('\t')
        elif s == '<w:br/>': parts.append(' ')
        else:               parts.append(html.unescape(m.group(1)))
    return ''.join(parts)

def is_chords(field):
    toks = [t for t in re.split(r'[\s,]+', field.strip(' ()')) if t]
    if not toks: return False
    hits = sum(1 for t in toks if CHORD.match(t.strip('(),')))
    return hits / len(toks) >= 0.6

def norm(title):
    t = title.lower().replace('’', "'").replace('&', 'and')
    t = re.sub(r"[^a-z0-9 ]", '', t)
    return re.sub(r'\s+', ' ', t).strip()

def parse_row(line):
    fields = [f.strip() for f in line.split('\t')]
    fields = [f for f in fields if f]
    if not fields: return None
    duration = chords = None
    if fields and DUR.match(fields[-1]):
        duration = fields.pop()
    if fields and is_chords(fields[-1]) and len(fields) > 1:
        chords = fields.pop()
    title = ' '.join(fields).strip()
    title = re.sub(r'\s+', ' ', title)
    if not title or SKIP.match(title): return None
    if len(title) < 2 or not re.search(r'[A-Za-z]', title): return None
    return title, chords, duration

songs = {}
files = sorted(glob.glob('Setlists/*.docx'))
for f in files:
    with zipfile.ZipFile(f) as z:
        xml = z.read('word/document.xml').decode('utf-8', 'ignore')
    section = None
    bullpen = False
    for p in PARA.findall(xml):
        line = para_text(p).strip()
        if not line: continue
        low = line.lower().strip()
        if SETHEAD.match(line):
            bullpen = False; section = None; continue
        if BULLPEN.match(line):
            bullpen = True; continue
        if low in ('electric', 'acoustic'):
            section = low.capitalize(); continue
        if SKIP.match(line): continue
        row = parse_row(line)
        if not row: continue
        title, chords, duration = row
        key = norm(title)
        if not key: continue
        e = songs.setdefault(key, {
            'title': CANON.get(key, title.replace('’', "'")),
            'chords': None, 'duration': None,
            'sets': set(), 'sources': set(), 'variants': collections.Counter(),
            'recent': False,
        })
        if not bullpen: e['recent'] = True
        e['variants'][title.replace('’', "'")] += 1
        if chords and not e['chords']:     e['chords'] = chords
        if duration and not e['duration']: e['duration'] = duration
        if section and not bullpen: e['sets'].add(section)
        e['sources'].add(os.path.basename(f))

with open('tools/songs-overrides.json', encoding='utf-8') as fh:
    OVERRIDES = json.load(fh)
ARTISTS = OVERRIDES.get('artists', {})
EXCLUDE = set(OVERRIDES.get('exclude', []))

out = []
for key, e in songs.items():
    if key in EXCLUDE: continue
    title = CANON.get(key) or e['variants'].most_common(1)[0][0]
    out.append({
        'title': title,
        'artist': ARTISTS.get(key),
        'chords': e['chords'],
        'duration': e['duration'],
        'sets': sorted(e['sets']),
        'appearances': len(e['sources']),
        'recentlyPlayed': e['recent'],
    })
out.sort(key=lambda s: norm(s['title']))

os.makedirs('data', exist_ok=True)
with open('data/songs.json', 'w', encoding='utf-8') as fh:
    json.dump({'songs': out, 'sourceCount': len(files)}, fh,
              indent=2, ensure_ascii=False)
    fh.write('\n')
missing = [s['title'] for s in out if not s['artist']]
recent = sum(1 for s in out if s['recentlyPlayed'])
print(f'{len(out)} songs from {len(files)} setlists -> data/songs.json '
      f'({recent} played recently, {len(out) - recent} deeper in the book, '
      f'{len(EXCLUDE)} excluded)')
if missing:
    print(f'  no artist credit for {len(missing)}: ' + ', '.join(missing))
