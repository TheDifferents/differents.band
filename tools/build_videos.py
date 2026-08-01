#!/usr/bin/env python3
"""Refresh data/videos.json from the band's YouTube playlist.

Reads the playlist through the YouTube Data API so the site keeps the order
you set in YouTube Studio. The API key never reaches the browser — this runs
in CI (see .github/workflows/videos.yml) and commits the resulting JSON.

    YOUTUBE_API_KEY=... python3 tools/build_videos.py
"""
import json, os, re, sys, urllib.parse, urllib.request

PLAYLIST_ID = os.environ.get('PLAYLIST_ID', 'PLGX0zmR180-9UuOns8QRleBn-H_pjjnpT')
API_KEY = os.environ.get('YOUTUBE_API_KEY')
API = 'https://www.googleapis.com/youtube/v3/'
OUT = 'data/videos.json'

# titles are "Song Name" or "Song Name | The Differents Charleston SC"
SPLIT_TITLE = re.compile(r'\s*[|–—-]\s*The Differents.*$', re.I)


def api(endpoint, **params):
    params['key'] = API_KEY
    url = API + endpoint + '?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def iso_to_clock(iso):
    """PT4M16S -> 4:16 ; PT1H2M3S -> 1:02:03"""
    m = re.match(r'^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$', iso or '')
    if not m:
        return None
    h, mi, s = (int(x) if x else 0 for x in m.groups())
    return f'{h}:{mi:02d}:{s:02d}' if h else f'{mi}:{s:02d}'


def best_thumb(thumbs):
    for k in ('maxres', 'standard', 'high', 'medium', 'default'):
        if k in thumbs:
            return thumbs[k]['url']
    return None


def main():
    if not API_KEY:
        sys.exit('YOUTUBE_API_KEY is not set. In CI it comes from repo secrets; '
                 'locally, export it before running.')

    items, page = [], None
    while True:
        kw = dict(part='snippet,contentDetails', playlistId=PLAYLIST_ID, maxResults=50)
        if page:
            kw['pageToken'] = page
        data = api('playlistItems', **kw)
        items += data.get('items', [])
        page = data.get('nextPageToken')
        if not page:
            break

    videos, ids = [], []
    for it in items:
        sn = it['snippet']
        vid = it.get('contentDetails', {}).get('videoId')
        # private and deleted entries keep a slot in the playlist but have no
        # usable snippet — skip them rather than rendering a dead tile
        if not vid or sn.get('title') in ('Private video', 'Deleted video'):
            continue
        videos.append({
            'id': vid,
            'title': SPLIT_TITLE.sub('', sn['title']).strip(),
            'thumb': best_thumb(sn.get('thumbnails', {})),
            'publishedAt': sn.get('publishedAt'),
            'duration': None,
        })
        ids.append(vid)

    # durations come from a separate endpoint, 50 ids per call
    lengths = {}
    for i in range(0, len(ids), 50):
        chunk = api('videos', part='contentDetails', id=','.join(ids[i:i + 50]))
        for v in chunk.get('items', []):
            lengths[v['id']] = iso_to_clock(v['contentDetails'].get('duration'))
    for v in videos:
        v['duration'] = lengths.get(v['id'])

    payload = {'playlistId': PLAYLIST_ID, 'count': len(videos), 'videos': videos}

    old = None
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8') as fh:
            try:
                old = json.load(fh)
            except json.JSONDecodeError:
                pass
    if old == payload:
        print(f'{len(videos)} videos — no change')
        return

    os.makedirs('data', exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
    print(f'{len(videos)} videos -> {OUT}')


if __name__ == '__main__':
    main()
