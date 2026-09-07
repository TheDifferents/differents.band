#!/usr/bin/env python3
"""Push the transcoded clips and posters to Cloudflare R2.

R2 speaks the S3 API, so this is boto3 against an R2 endpoint. Object keys carry
a content hash, which means a re-encode gets a new URL and every object can be
cached forever without a purge.

Credentials come from the environment, never from a file in the repo:

    export R2_ACCOUNT_ID=...            # or CLOUDFLARE_ACCOUNT_ID
    export R2_ACCESS_KEY_ID=...         # from an R2 API token, not an account token
    export R2_SECRET_ACCESS_KEY=...     # or R2_ACCESS_KEY, as the dashboard labels it
    export R2_BUCKET=differents-media
    export MEDIA_BASE_URL=https://media.differents.band   # or the r2.dev URL

    python3 tools/upload_media.py            # upload what is missing
    python3 tools/upload_media.py --dry-run
"""
import argparse, hashlib, json, os, pathlib, sys, urllib.request

MANIFEST = pathlib.Path('data/media.json')
WEB = pathlib.Path('media/web')
POST = pathlib.Path('media/posters')
PREFIX = 'clips/'
# filenames are content-addressed, so they can never go stale
CACHE = 'public, max-age=31536000, immutable'
TYPES = {'.mp4': 'video/mp4', '.jpg': 'image/jpeg'}


def sha8(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()[:8]


def need(name, *fallbacks):
    for n in (name, *fallbacks):
        v = os.environ.get(n)
        if v:
            return v
    names = ' or '.join((name, *fallbacks))
    sys.exit(f'{names} is not set. See the docstring at the top of this file.')


def derive_s3_keys(token):
    """R2's S3 credentials from a Cloudflare API token.

    Cloudflare documents the pair as: Access Key ID is the token's id, Secret
    Access Key is the SHA-256 of the token value. That lets one token in .env
    cover both the REST API and the S3 endpoint, as long as it carries an R2
    permission. Without one the endpoint answers AccessDenied.
    """
    acct = os.environ.get('R2_ACCOUNT_ID') or os.environ.get('CLOUDFLARE_ACCOUNT_ID')
    req = urllib.request.Request(
        f'https://api.cloudflare.com/client/v4/accounts/{acct}/tokens/verify',
        headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        result = json.load(r).get('result') or {}
    if not result.get('id'):
        sys.exit('could not read the token id needed for the S3 Access Key ID')
    return result['id'], hashlib.sha256(token.encode()).hexdigest()


def preflight(account):
    """Say precisely which part of the R2 setup is missing.

    The three failures look alike from a stack trace but need different fixes,
    so they are separated here.
    """
    import socket, ssl
    host = f'{account}.r2.cloudflarestorage.com'
    try:
        with socket.create_connection((host, 443), timeout=15) as sock:
            with ssl.create_default_context().wrap_socket(sock, server_hostname=host):
                pass
    except ssl.SSLError:
        sys.exit(
            f'{host} refuses the TLS handshake.\n\n'
            'The generic host r2.cloudflarestorage.com handshakes fine from the same\n'
            'machine and resolves to the same addresses, so this is not DNS or a\n'
            'proxy. Cloudflare is rejecting this hostname specifically. A made-up\n'
            'account id fails identically, so this cannot tell apart:\n'
            '  - R2 not yet enabled on the account\n'
            '  - the endpoint still propagating after enabling it\n'
            '  - a wrong account id\n\n'
            'Check the account id against the R2 page in the dashboard, and if R2 was\n'
            'only just enabled, give it a few minutes and retry.')
    except OSError as e:
        sys.exit(f'Cannot reach {host}: {e}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--local', action='store_true',
                    help='point the manifest at the files on disk, so the site '
                         'can be run and tested before any bucket exists')
    args = ap.parse_args()

    if not MANIFEST.exists():
        sys.exit('data/media.json is missing — run tools/transcode_videos.py first')
    data = json.load(open(MANIFEST, encoding='utf-8'))
    base = os.environ.get('MEDIA_BASE_URL', '').rstrip('/')

    if args.local:
        for clip in data['clips']:
            for kind, rend in clip['renditions'].items():
                d = 'media/posters' if kind == 'poster' else 'media/web'
                rend['key'] = f'{d}/{rend["file"]}'
                rend.pop('url', None)
        with open(MANIFEST, 'w', encoding='utf-8') as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
            fh.write('\n')
        print(f'manifest points at local files for {len(data["clips"])} clips. '
              'Re-run without --local once the bucket is up.')
        return

    bucket = os.environ.get('R2_BUCKET', 'differents-videos')
    client = None
    if not args.dry_run:
        import boto3
        from botocore.config import Config
        account = need('R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID')
        preflight(account)
        if os.environ.get('R2_ACCESS_KEY_ID'):
            # R2_ACCESS_KEY is what the Cloudflare dashboard calls the Secret
            # Access Key; accept either spelling
            key_id = os.environ['R2_ACCESS_KEY_ID']
            secret = need('R2_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY')
        else:
            key_id, secret = derive_s3_keys(need('CLOUDFLARE_API_KEY'))
        endpoint = (os.environ.get('R2_ENDPOINT')
                    or f'https://{account}.r2.cloudflarestorage.com').rstrip('/')
        client = boto3.client(
            's3', endpoint_url=endpoint,
            aws_access_key_id=key_id, aws_secret_access_key=secret,
            region_name='auto',
            config=Config(signature_version='s3v4', retries={'max_attempts': 5}))
        try:
            client.head_bucket(Bucket=bucket)
        except Exception as e:
            code = getattr(e, 'response', {}).get('Error', {}).get('Code', '')
            if code in ('403', 'AccessDenied'):
                sys.exit(
                    f'R2 rejected the credentials for bucket "{bucket}" with '
                    'AccessDenied.\n\nThe key is recognised, so this is a missing '
                    'permission rather than a bad\nkey. Give the API token the '
                    '"Workers R2 Storage: Edit" permission, or create a\ndedicated '
                    'R2 API token and set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.')
            if code == '404' or 'NoSuchBucket' in str(e):
                sys.exit(f'bucket "{bucket}" does not exist on this account')
            raise

    uploaded = skipped = 0
    total_bytes = 0
    for clip in data['clips']:
        for kind, rend in clip['renditions'].items():
            local = (POST if kind == 'poster' else WEB) / rend['file']
            if not local.exists():
                sys.exit(f'missing local file {local} — re-run the transcode')
            digest = sha8(local)
            key = f'{PREFIX}{local.stem}-{digest}{local.suffix}'
            # only the key is recorded. The public origin is applied at build
            # time from MEDIA_BASE_URL, so the manifest stays portable.
            rend['key'] = key
            rend.pop('url', None)
            total_bytes += rend['bytes']

            if args.dry_run:
                print(f'would upload {local.name:<44} -> {key}')
                continue
            try:
                client.head_object(Bucket=bucket, Key=key)
                skipped += 1
                continue                      # same hash, same bytes, already there
            except client.exceptions.ClientError:
                pass
            client.upload_file(
                str(local), bucket, key,
                ExtraArgs={'ContentType': TYPES[local.suffix],
                           'CacheControl': CACHE})
            print(f'uploaded {local.name:<44} {rend["bytes"]/1e6:6.1f} MB')
            uploaded += 1

    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write('\n')

    if args.dry_run:
        print(f'\ndry run — {total_bytes/1e6:.0f} MB across '
              f'{sum(len(c["renditions"]) for c in data["clips"])} objects')
        if not base:
            print('MEDIA_BASE_URL is unset; set it when building the site')
    else:
        print(f'\n{uploaded} uploaded, {skipped} already present. '
              f'{total_bytes/1e6:.0f} MB total in the bucket.')


if __name__ == '__main__':
    main()
