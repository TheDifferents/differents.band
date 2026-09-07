#!/usr/bin/env python3
"""Build data/videos.json, the file the site reads.

Two inputs, both local:

  data/clips.json  running order, titles and artists. Hand-edited.
  data/media.json  renditions and posters. Written by tools/transcode_videos.py
                   and tools/upload_media.py.

Nothing here talks to YouTube. The clips are served from our own storage, so
the origin comes from MEDIA_BASE_URL and is required: without it the build would
emit a page of unplayable videos, which is worse than failing.

    MEDIA_BASE_URL=https://media.differents.band python3 tools/build_videos.py
"""
import json, os, sys

CLIPS = 'data/clips.json'
MEDIA = 'data/media.json'
OUT = 'data/videos.json'


def secs_to_clock(sec):
    m, s = divmod(int(round(sec or 0)), 60)
    h, m = divmod(m, 60)
    return f'{h}:{m:02d}:{s:02d}' if h else f'{m}:{s:02d}'


def load(path, what):
    if not os.path.exists(path):
        sys.exit(f'{path} is missing — {what}')
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def main():
    base = os.environ.get('MEDIA_BASE_URL', '').rstrip('/')
    if not base:
        sys.exit('MEDIA_BASE_URL is not set. It is the public origin the clips '
                 'are served from, e.g. https://media.differents.band. Set it '
                 'to http://127.0.0.1:8777 to preview against local files.')

    order = load(CLIPS, 'it holds the running order; see tools/README.md')['clips']
    media = {c['slug']: c for c in load(MEDIA, 'run tools/transcode_videos.py')['clips']}

    videos, missing, unlisted = [], [], []
    for entry in order:
        clip = media.get(entry['slug'])
        if not clip:
            missing.append(entry['slug'])
            continue
        rends = clip.get('renditions', {})
        keys = {k: r.get('key') for k, r in rends.items()}
        if not all(keys.values()) or 'poster' not in keys:
            missing.append(entry['slug'] + ' (not uploaded)')
            continue
        urls = {k: f'{base}/{v}' for k, v in keys.items()}
        poster = urls.pop('poster')
        videos.append({
            'slug': entry['slug'],
            'title': entry.get('title') or clip['title'],
            'artist': entry.get('artist', ''),
            'duration': secs_to_clock(clip.get('duration')),
            'thumb': poster,
            'self': {'poster': poster, 'sources': urls},
        })

    listed = {e['slug'] for e in order}
    unlisted = [s for s in media if s not in listed]

    if missing:
        print(f'{len(missing)} clip(s) skipped, no uploaded media: ' + ', '.join(missing))
    if unlisted:
        print(f'{len(unlisted)} clip(s) present but not in {CLIPS}, so not shown: '
              + ', '.join(unlisted))
    if not videos:
        sys.exit('no playable clips — refusing to write an empty video page. '
                 'Run tools/upload_media.py first (or --local to preview).')

    payload = {'count': len(videos), 'videos': videos}
    old = None
    if os.path.exists(OUT):
        try:
            with open(OUT, encoding='utf-8') as fh:
                old = json.load(fh)
        except json.JSONDecodeError:
            pass
    if old == payload:
        print(f'{len(videos)} videos — no change')
        return

    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
    print(f'{len(videos)} videos -> {OUT}')


if __name__ == '__main__':
    main()
