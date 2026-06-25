#!/usr/bin/env python3
"""
Download images from a text file containing one URL per line.

Usage:
    python download_images.py links.txt

Optional:
    python download_images.py links.txt output_folder
"""

import sys
import time
import mimetypes
import urllib.request
from pathlib import Path
from urllib.parse import urlparse, unquote


def get_filename_from_url(url: str, index: int, content_type: str | None = None) -> str:
    parsed = urlparse(url)
    name = Path(unquote(parsed.path)).name

    if not name or "." not in name:
        ext = mimetypes.guess_extension(content_type or "") or ".jpg"
        name = f"image_{index:03d}{ext}"

    return name


def make_unique_path(path: Path) -> Path:
    if not path.exists():
        return path

    stem = path.stem
    suffix = path.suffix
    parent = path.parent

    counter = 2
    while True:
        new_path = parent / f"{stem}_{counter}{suffix}"
        if not new_path.exists():
            return new_path
        counter += 1


def download_image(url: str, output_dir: Path, index: int) -> bool:
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0"}
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            content_type = response.headers.get("Content-Type", "")
            data = response.read()

        filename = get_filename_from_url(url, index, content_type)
        output_path = make_unique_path(output_dir / filename)

        output_path.write_bytes(data)
        print(f"Downloaded: {url} -> {output_path}")
        return True

    except Exception as e:
        print(f"Failed: {url} | {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python download_images.py links.txt [output_folder]")
        sys.exit(1)

    links_file = Path(sys.argv[1])
    output_dir = Path(sys.argv[2]) if len(sys.argv) >= 3 else Path("downloaded_images")

    if not links_file.exists():
        print(f"File not found: {links_file}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    urls = []
    for line in links_file.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            urls.append(line)

    print(f"Found {len(urls)} links.")

    success = 0
    failed = 0

    for i, url in enumerate(urls, start=1):
        if download_image(url, output_dir, i):
            success += 1
        else:
            failed += 1

        time.sleep(0.2)

    print()
    print(f"Done. Downloaded: {success}, Failed: {failed}")
    print(f"Saved to: {output_dir.resolve()}")


if __name__ == "__main__":
    main()