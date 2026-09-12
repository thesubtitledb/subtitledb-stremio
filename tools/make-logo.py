#!/usr/bin/env python3
"""Render assets/logo.png from the site favicon, with no image library.

The favicon at thesubtitledb.org/favicon.svg is a rounded square with a diagonal
gradient and three caption bars. Stremio wants a raster logo, and every rasteriser
worth installing is a bigger dependency than the fifty lines it takes to draw four
rounded rectangles. So this draws them, and the addon serves the result.

Run it when the site's favicon changes. The output is committed.
"""

import struct
import sys
import zlib
from pathlib import Path

SIZE = 256
SS = 3  # supersampling factor, for the rounded corners

# Straight from favicon.svg, in the 28-unit viewBox it is drawn in.
VIEW = 28.0
CARD_RADIUS = 6.5
STOPS = [(0.0, (0x35, 0xB7, 0xAB)), (0.65, (0x1B, 0x7F, 0xA5)), (1.0, (0x12, 0x68, 0x8C))]
BARS = [(8.0, 0.42), (12.9, 0.70), (17.8, 1.0)]
BAR_X, BAR_W, BAR_H, BAR_R = 7.5, 13.0, 2.2, 1.1


def gradient(t):
    """The svg linearGradient, sampled. t runs 0..1 along the (0,0)->(1,1) diagonal."""
    t = min(1.0, max(0.0, t))
    for i in range(len(STOPS) - 1):
        t0, c0 = STOPS[i]
        t1, c1 = STOPS[i + 1]
        if t <= t1:
            k = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
            return tuple(round(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
    return STOPS[-1][1]


def in_round_rect(x, y, rx, ry, w, h, r):
    """Point in a rounded rectangle, in viewBox units."""
    if x < rx or y < ry or x > rx + w or y > ry + h:
        return False
    cx = min(max(x, rx + r), rx + w - r)
    cy = min(max(y, ry + r), ry + h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render():
    rows = []
    scale = VIEW / (SIZE * SS)
    for py in range(SIZE):
        row = bytearray()
        for px in range(SIZE):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    x = (px * SS + sx + 0.5) * scale
                    y = (py * SS + sy + 0.5) * scale
                    if not in_round_rect(x, y, 0, 0, VIEW, VIEW, CARD_RADIUS):
                        continue
                    r, g, b = gradient((x / VIEW + y / VIEW) / 2)
                    for by, opacity in BARS:
                        if in_round_rect(x, y, BAR_X, by, BAR_W, BAR_H, BAR_R):
                            r = round(r + (255 - r) * opacity)
                            g = round(g + (255 - g) * opacity)
                            b = round(b + (255 - b) * opacity)
                            break
                    acc[0] += r
                    acc[1] += g
                    acc[2] += b
                    acc[3] += 255
            n = SS * SS
            alpha = acc[3] / n
            if alpha <= 0:
                row += bytes(4)
                continue
            # Straight (unpremultiplied) alpha: divide the colour by the covered
            # samples, not by all of them, or the edge pixels darken.
            covered = acc[3] / 255
            row += bytes(
                (
                    round(acc[0] / covered),
                    round(acc[1] / covered),
                    round(acc[2] / covered),
                    round(alpha),
                )
            )
        rows.append(bytes(row))
    return rows


def png(rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "assets/logo.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(png(render()))
    print(f"{out} {out.stat().st_size} bytes")


if __name__ == "__main__":
    main()
