#!/usr/bin/env python3
"""Naming rules shared by the transcode, upload and build steps.

A clip's slug is the join between two worlds: the YouTube playlist supplies the
running order and the titles, the local files supply the video. They only line
up if both sides slugify the same way, so that logic lives here and nowhere else.
"""
import re

# the source filenames carry a typo the YouTube titles no longer do
TITLE_FIXES = {'Last Dance with Marry Jane': 'Last Dance with Mary Jane'}


def slugify(name):
    """'Runnin’ Down a Dream' -> 'runnin-down-a-dream'"""
    s = re.sub(r'[^a-z0-9]+', '-', (name or '').lower()).strip('-')
    return re.sub(r'-{2,}', '-', s)


def split_title(title):
    """Playlist titles read 'Song - Artist'. Returns (song, artist)."""
    i = (title or '').find(' - ')
    return (title, '') if i < 0 else (title[:i], title[i + 3:])


def clip_slug(title):
    """Slug for a clip, from either a filename stem or a playlist title."""
    fixed = TITLE_FIXES.get(title, title)
    return slugify(split_title(fixed)[0])
