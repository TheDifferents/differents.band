#!/usr/bin/env python3
"""Turn the camera masters in media/source into web-ready renditions.

The sources are ~19 Mbps 1080p, which is a fine master and a terrible download.
This writes two H.264 renditions plus a poster frame for each clip, and a
manifest the site build reads.

    python3 tools/transcode_videos.py            # encode anything out of date
    python3 tools/transcode_videos.py --force    # re-encode everything
    python3 tools/transcode_videos.py --only "Use Me"

Outputs land in media/ (git-ignored). Upload them with tools/upload_media.py.
"""
import argparse, json, os, pathlib, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mediautil import TITLE_FIXES, slugify

SRC = pathlib.Path('media/source')
WEB = pathlib.Path('media/web')
POST = pathlib.Path('media/posters')
MANIFEST = pathlib.Path('data/media.json')

# one master, two deliverables: 1080 for desktop, 720 for phones and thin pipes
RENDITIONS = [
    {'name': '1080', 'height': 1080, 'crf': 21, 'maxrate': '6M', 'bufsize': '12M'},
    {'name': '720',  'height': 720,  'crf': 23, 'maxrate': '3M', 'bufsize': '6M'},
]


def probe(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', str(path)],
        capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    v = next(s for s in d['streams'] if s['codec_type'] == 'video')
    return {'duration': float(d['format']['duration']),
            'width': int(v['width']), 'height': int(v['height'])}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit('ffmpeg failed:\n' + ' '.join(cmd) + '\n' + r.stderr[-2000:])


def encode(src, dst, rend):
    # -movflags +faststart puts the index at the front so playback can start
    # before the file finishes downloading. Without it a 30MB clip is a 30MB wait.
    run(['ffmpeg', '-y', '-v', 'error', '-i', str(src),
         '-vf', f"scale=-2:{rend['height']}:flags=lanczos",
         '-c:v', 'libx264', '-preset', 'medium', '-crf', str(rend['crf']),
         '-maxrate', rend['maxrate'], '-bufsize', rend['bufsize'],
         '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
         '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000',
         '-movflags', '+faststart', str(dst)])


def poster(src, dst, duration):
    run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{duration * 0.25:.2f}', '-i', str(src),
         '-frames:v', '1', '-vf', 'scale=1280:-2:flags=lanczos', '-q:v', '3', str(dst)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--only', default=None, help='substring match on the filename')
    args = ap.parse_args()

    for d in (WEB, POST):
        d.mkdir(parents=True, exist_ok=True)

    sources = sorted(p for p in SRC.iterdir()
                     if p.suffix.lower() in {'.mp4', '.mov', '.m4v'})
    if args.only:
        sources = [p for p in sources if args.only.lower() in p.stem.lower()]
    if not sources:
        sys.exit(f'nothing to do in {SRC}')

    entries, t0 = [], time.time()
    for i, src in enumerate(sources, 1):
        stem = src.stem
        title = TITLE_FIXES.get(stem, stem)
        slug = slugify(title)
        info = probe(src)
        print(f'[{i}/{len(sources)}] {title}  ({info["duration"]:.0f}s)', flush=True)

        files = {}
        for rend in RENDITIONS:
            dst = WEB / f'{slug}-{rend["name"]}.mp4'
            fresh = dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime
            if fresh and not args.force:
                print(f'      {rend["name"]}p up to date', flush=True)
            else:
                s = time.time()
                encode(src, dst, rend)
                print(f'      {rend["name"]}p  {dst.stat().st_size/1e6:.1f} MB'
                      f'  in {time.time()-s:.0f}s', flush=True)
            files[rend['name']] = {'file': dst.name, 'bytes': dst.stat().st_size}

        pdst = POST / f'{slug}.jpg'
        if args.force or not pdst.exists() or pdst.stat().st_mtime < src.stat().st_mtime:
            poster(src, pdst, info['duration'])
        files['poster'] = {'file': pdst.name, 'bytes': pdst.stat().st_size}

        entries.append({'slug': slug, 'title': title,
                        'duration': round(info['duration'], 2),
                        'source': src.name, 'renditions': files})

    # merge with anything already in the manifest so --only doesn't drop the rest
    existing = {}
    if MANIFEST.exists():
        try:
            existing = {e['slug']: e for e in json.load(open(MANIFEST, encoding='utf-8'))['clips']}
        except Exception:
            pass
    for e in entries:
        existing[e['slug']] = e
    clips = sorted(existing.values(), key=lambda e: e['title'].lower())

    MANIFEST.parent.mkdir(exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump({'count': len(clips), 'clips': clips}, fh, indent=2, ensure_ascii=False)
        fh.write('\n')

    total = sum(r['bytes'] for e in entries for k, r in e['renditions'].items())
    print(f'\n{len(entries)} clips in {time.time()-t0:.0f}s — '
          f'{total/1e6:.0f} MB written, manifest at {MANIFEST}')


if __name__ == '__main__':
    main()
