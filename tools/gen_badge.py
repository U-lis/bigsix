#!/usr/bin/env python3
"""알림 badge (Android 상태바 단색 아이콘) 를 굽는다 — 글자 'b6'.

badge 를 안 보내면 Chromium 이 상태바에 기본 종 모양을 띄운다. 상태바는 알파 채널만
쓰므로 흰 글자 + 투명 배경 한 장이면 된다. gen_icons.py 와 같은 이유로 표준
라이브러리만 쓴다 — 글꼴에 기대지 않고 획(선분 · 원호)을 직접 긋는다.

    python3 tools/gen_badge.py
"""
import math
import struct
import zlib

SIZE = 96         # Android 권장 badge 크기
SS = 4            # 슈퍼샘플링 배율
STROKE = 9        # 획 두께 (96 좌표계)


def arc(cx, cy, r, a0, a1, n=48):
    """중심 (cx, cy), 반지름 r 의 원호. 각도는 도, 화면 좌표(y 아래로)."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)))
            for i in range(n + 1)]


# 획 = 점 목록 (꺾은선). 끝은 둥글게 처리된다.
# 소문자 b 와 6 은 같은 크기의 아래 원을 공유한다 — 둘이 닮아 보이는 것이 의도다.
R, CY = 15, 63
B_CX, SIX_CX = 27, 72
STROKES = [
    # b — 원 왼쪽에 붙은 세로 줄기 + 아래 원
    [(B_CX - R, 16), (B_CX - R, CY)],
    arc(B_CX, CY, R, 0, 360, 96),
    # 6 — 아래 원 + 왼쪽에서 위로 올라가 오른쪽으로 꺾이는 꼬리
    arc(SIX_CX, CY, R, 0, 360, 96),
    arc(SIX_CX + 26, CY, 26 + R, 180, 245),
]


def seg_dist2(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    qx, qy = ax + t * dx - px, ay + t * dy - py
    return qx * qx + qy * qy


def render():
    n = SIZE * SS
    hit = bytearray(n * n)
    h = STROKE / 2
    for pts in STROKES:
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            # 선분 주변 사각형만 훑는다.
            x0 = max(0, int((min(ax, bx) - h) * SS))
            x1 = min(n, int((max(ax, bx) + h) * SS) + 1)
            y0 = max(0, int((min(ay, by) - h) * SS))
            y1 = min(n, int((max(ay, by) + h) * SS) + 1)
            for sy in range(y0, y1):
                yy = (sy + 0.5) / SS
                for sx in range(x0, x1):
                    if hit[sy * n + sx]:
                        continue
                    if seg_dist2((sx + 0.5) / SS, yy, ax, ay, bx, by) <= h * h:
                        hit[sy * n + sx] = 1
    rows = []
    k = SS * SS
    for py in range(SIZE):
        row = bytearray()
        for px in range(SIZE):
            a = sum(hit[(py * SS + sy) * n + px * SS + sx]
                    for sy in range(SS) for sx in range(SS))
            row += bytes((255, 255, 255, a * 255 // k))
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"{path}  {SIZE}x{SIZE}  {len(png)}B")


if __name__ == "__main__":
    write_png("static/badge-96.png", render())
