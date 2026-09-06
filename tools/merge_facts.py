#!/usr/bin/env python3
"""Merge researched {title, year, bpm, fact} JSONL into data/songs.jsonl.

    python3 tools/merge_facts.py facts1.jsonl facts2.jsonl ...

Joins on the normalised title, reports anything that didn't match in either
direction, and never overwrites a value that's already set unless --force.
"""
import json, re, sys

def norm(t):
    t = t.lower().replace('’', "'").replace('&', 'and')
    t = re.sub(r"[^a-z0-9 ]", '', t)
    return re.sub(r'\s+', ' ', t).strip()

force = '--force' in sys.argv
paths  = [a for a in sys.argv[1:] if not a.startswith('--')]

incoming = {}
bad = []
for p in paths:
    for n, line in enumerate(open(p, encoding='utf-8'), 1):
        line = line.strip()
        if not line or line.startswith('#'): continue
        line = re.sub(r'^```\w*$|^```$', '', line).strip()   # stray fences
        if not line: continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError as e:
            bad.append(f'{p}:{n}: {e.msg}'); continue
        if not r.get('title'):
            bad.append(f'{p}:{n}: no title'); continue
        incoming[norm(r['title'])] = r

lines = open('data/songs.jsonl', encoding='utf-8').read().splitlines()
out, updated, skipped, seen = [], [], [], set()
for line in lines:
    st = line.strip()
    if not st or st.startswith('#'):
        out.append(line); continue
    s = json.loads(st)
    k = norm(s['title'])
    r = incoming.get(k)
    if r:
        seen.add(k)
        changed = []
        for f in ('year', 'bpm', 'fact'):
            v = r.get(f)
            if v in (None, ''): continue
            if s.get(f) not in (None, '') and not force:
                continue
            s[f] = v; changed.append(f)
        (updated if changed else skipped).append(s['title'])
    out.append(json.dumps(s, ensure_ascii=False, separators=(', ', ': ')))

open('data/songs.jsonl','w',encoding='utf-8').write('\n'.join(out) + '\n')

unmatched = [incoming[k]['title'] for k in incoming if k not in seen]
print(f'merged {len(updated)} songs; {len(skipped)} already had values')
if bad:       print(f'\n{len(bad)} unparseable line(s):\n  ' + '\n  '.join(bad))
if unmatched: print(f'\n{len(unmatched)} incoming title(s) matched nothing in the book:\n  '
                    + '\n  '.join(sorted(unmatched)))
