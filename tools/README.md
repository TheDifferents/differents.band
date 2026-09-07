# Video pipeline

The site serves its own video. Nothing is embedded from YouTube, which matters
because four of the songs are blocked from embedded playback by a rights-holder
claim and will not play on any site but YouTube itself.

Three data files, in the order they feed each other:

| File | Written by | Hand-edited? |
|---|---|---|
| `data/media.json` | `transcode_videos.py`, then `upload_media.py` | no |
| `data/clips.json` | you | **yes** — running order, titles, artists |
| `data/videos.json` | `build_videos.py` | no — this is what the site reads |

A clip is joined between the files by its **slug**, derived from the song title.
`mediautil.py` owns that rule so every step derives it identically.

## One-time setup

In the Cloudflare dashboard, open **R2 Object Storage**, then **Manage R2 API
Tokens**, and create a token with **Object Read & Write**. It shows an Access
Key ID and a Secret Access Key once and never again. An ordinary account API
token will not work here: the S3 endpoint needs that dedicated pair.

```sh
export R2_ACCOUNT_ID=...          # or CLOUDFLARE_ACCOUNT_ID
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
export R2_BUCKET=differents-videos
export MEDIA_BASE_URL=https://media.differents.band   # or the bucket's r2.dev URL
```

The bucket must allow public reads for the site to play anything, either through
a custom domain or the bucket's `r2.dev` URL. A custom domain needs the zone on
Cloudflare DNS; `differents.band` is currently at Namecheap.

## Adding clips

1. Drop the camera exports into `media/source/`. That directory is git-ignored:
   the masters are ~19 Mbps and the published site is capped at 1 GB.
2. `python3 tools/transcode_videos.py` writes a 1080p and a 720p rendition plus
   a poster for anything out of date, and updates `data/media.json`.
3. `python3 tools/upload_media.py` pushes them to R2. Object keys carry a
   content hash, so a re-encode gets a fresh URL and everything can be cached
   forever without a purge. Re-running skips what is already there.
4. Add the new slug to `data/clips.json`, wherever you want it in the running
   order, with its artist. A clip that is not listed there is not shown.
5. `MEDIA_BASE_URL=... python3 tools/build_videos.py`.

`MEDIA_BASE_URL` is required. Without it the build stops rather than writing a
page of unplayable videos. The build also refuses to write an empty file.

## Previewing locally

```sh
python3 tools/upload_media.py --local     # point the manifest at files on disk
MEDIA_BASE_URL=http://127.0.0.1:8777 python3 tools/build_videos.py
python3 tools/serve.py                    # http://127.0.0.1:8777
```

`tools/serve.py` exists because `python -m http.server` answers every request
with the whole file and no `Range` support, so a `<video>` cannot seek and has
to download everything before it plays. R2 supports `Range`, so previewing
without it is misleading.

`--local` writes machine-local paths into `data/media.json`. Do not commit that
state. Re-run `tools/upload_media.py` for real, which replaces them with the
content-addressed keys.

## What was removed

The daily GitHub Actions job that refreshed the running order from the YouTube
playlist is gone, along with the playlist API call in the build. `data/clips.json`
replaced it. The `YOUTUBE_API_KEY` repository secret is no longer read by
anything and can be deleted.
