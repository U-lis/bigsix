#!/usr/bin/env python3
"""static/icon.svg 를 PNG 로 굽는다.

외부 래스터라이저(rsvg-convert, inkscape, ImageMagick)가 이 환경에 없고, 아이콘을
위해 네이티브 의존성을 하나 더 들이는 것은 과하다. 도형이 둥근 사각형뿐이라
직접 그리는 편이 짧다 — 이 파일이 icon.svg 의 도형 정의를 그대로 들고 있고,
둘이 어긋나면 안 된다.

    python3 tools/gen_icons.py

PNG 인코딩은 표준 라이브러리(zlib)만 쓴다. 4배 슈퍼샘플링으로 안티에일리어싱한다.
"""
import struct
import zlib

BG = (0x11, 0x11, 0x13)
# icon.svg 의 <rect> 6개와 같은 순서·같은 색.
BARS = [
    (0, 0, "#f87171"), (168, 0, "#fbbf24"),
    (0, 112, "#7dabff"), (168, 112, "#5eead4"),
    (0, 224, "#c4b5fd"), (168, 224, "#ededf0"),
]
BAR_W, BAR_H, BAR_R = 152, 96, 16
PAD = 96          # icon.svg 의 translate(96 96)
CANVAS = 512
SS = 4            # 슈퍼샘플링 배율


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def in_round_rect(x, y, rx0, ry0, w, h, r):
    """(x, y) 가 둥근 사각형 안인가."""
    if not (rx0 <= x < rx0 + w and ry0 <= y < ry0 + h):
        return False
    # 모서리 원 바깥이면 제외한다.
    cx = rx0 + r if x < rx0 + r else (rx0 + w - r if x > rx0 + w - r else x)
    cy = ry0 + r if y < ry0 + r else (ry0 + h - r if y > ry0 + h - r else y)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render(size, scale, bg_radius):
    """size×size 픽셀. scale 은 512 기준 도형을 얼마로 줄일지 (maskable 안전 영역용)."""
    n = size * SS
    unit = CANVAS / n              # 샘플 하나가 덮는 512 좌표계 길이
    off = (CANVAS - CANVAS * scale) / 2

    # 512 좌표계에서의 도형 목록을 미리 만든다.
    shapes = []
    for bx, by, color in BARS:
        shapes.append((
            off + (PAD + bx) * scale, off + (PAD + by) * scale,
            BAR_W * scale, BAR_H * scale, BAR_R * scale, rgb(color),
        ))

    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = 0
            for sy in range(SS):
                yy = (py * SS + sy + 0.5) * unit
                for sx in range(SS):
                    xx = (px * SS + sx + 0.5) * unit
                    if bg_radius and not in_round_rect(
                            xx, yy, 0, 0, CANVAS, CANVAS, bg_radius):
                        c = (0, 0, 0)   # 라운드 바깥 — 배경도 없음
                    else:
                        c = BG
                        for rx0, ry0, w, h, rr, col in shapes:
                            if in_round_rect(xx, yy, rx0, ry0, w, h, rr):
                                c = col
                                break
                    r += c[0]; g += c[1]; b += c[2]
            k = SS * SS
            row += bytes((r // k, g // k, b // k))
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"{path}  {size}x{size}  {len(png)}B")


if __name__ == "__main__":
    for size in (192, 512):
        write_png(f"static/icon-{size}.png", render(size, 1.0, 96), size)
    # maskable 은 원형으로 잘려도 내용이 남아야 한다. 안전 영역은 지름 80%(=410)의
    # 원이고, 도형 묶음은 320×320 정사각형이라 대각선이 452 로 삐져나온다.
    # 0.85 배로 줄이면 대각선이 385 가 되어 원 안에 들어온다. 배경은 모서리까지
    # 꽉 채운다 (라운드 없음 — 런처가 알아서 자른다).
    write_png("static/icon-maskable.png", render(512, 0.85, 0), 512)
