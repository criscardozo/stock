#!/usr/bin/env python3
"""Wrap PNGs into a /favicon.ico, with no dependency and no re-encoding.

WHY the file exists at all: browsers are happy with `icon.svg` and
`apple-icon.png`, but the crawlers that build site icons start at
`/favicon.ico` and do not read SVG. Without it the site shows up blank in a
password manager and in anything else that keeps a thumbnail, and the only
symptom is a 404 in somebody else's console.

WHY fifteen lines instead of a tool: an ICO may carry PNGs verbatim — a 6-byte
header, then 16 bytes per entry, then the files. ImageMagick being installed is
the argument against reaching for it, not for: this runs anywhere Python does,
and the bytes that go in are the bytes that were reviewed.

Measured by the sibling app and taken as read here: in Next this belongs in
`public/`, never `app/`. An `app/favicon.ico` is metadata the build DECODES,
and its decoder rejects anything that is not RGBA — a converter writing 8-bit
RGB for an opaque drawing makes the build fail. From `public/` it is served
byte for byte.
"""
import struct
import sys
from pathlib import Path


def pack(pngs: list[Path], out: Path) -> None:
    entries, blobs, offset = [], [], 6 + 16 * len(pngs)
    for png in pngs:
        data = png.read_bytes()
        # Width and height as the PNG declares them, read from its IHDR rather
        # than from the filename: the name is a label, the header is the image.
        width, height = struct.unpack(">II", data[16:24])
        entries.append(
            struct.pack(
                "<BBBBHHII",
                width if width < 256 else 0,
                height if height < 256 else 0,
                0, 0, 1, 32, len(data), offset,
            )
        )
        blobs.append(data)
        offset += len(data)
    out.write_bytes(b"".join([struct.pack("<HHH", 0, 1, len(pngs)), *entries, *blobs]))


if __name__ == "__main__":
    pack([Path(p) for p in sys.argv[1:-1]], Path(sys.argv[-1]))
    print(f"  {sys.argv[-1]}")
