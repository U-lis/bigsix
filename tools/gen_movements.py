#!/usr/bin/env python3
"""data/progressions.json 에서 docs/MOVEMENTS.md 를 생성한다.

레포 루트에서 `python3 tools/gen_movements.py` 로 실행한다. 수정은 JSON 쪽에서.
"""
import json

d = json.load(open('data/progressions.json', encoding='utf-8'))

def std(s, key):
    v = s.get(key) or s.get('elite')
    val = v['value']
    if isinstance(val, list):
        val = '%d~%d' % tuple(val)
    if s['unit'] == 'seconds':
        val = f'{val//60}분' if isinstance(val, int) and val >= 60 and val % 60 == 0 else f'{val}초'
        return val
    return f"{v['sets']}×{val}"

out = ["# 죄수 운동법 — 60단계 동작 요약", "",
       "`data/progressions.json` 에서 자동 생성된다. **직접 고치지 말고 JSON 을 고친 뒤 `python3 tools/gen_movements.py` 를 실행할 것.**", "",
       "> 아래 동작 설명은 **책의 Point/Tip 원문이 아니라 자체 작성한 요약**이다.",
       "> 단계명·기준 수치·페이지는 한국어판(비타북스 2017) 실물 대조 값이다.", "",
       "기준 표기 `2×10` = 10회씩 2세트. † = 한쪽 팔/다리 기준.", "", "---", ""]

for pr in d['progressions']:
    out.append(f"## {pr['name']['ko']} ({pr['name']['en']})")
    if pr.get('requires'):
        out.append(f"> 선행 조건: {pr['requires']}")
    out.append("")
    for s in pr['steps']:
        n = '마스터' if s['n'] == 10 else f"{s['n']}단계"
        side = ' †' if s.get('perSide') else ''
        out.append(f"### {n} · {s['name']['ko']} <sub>{s['name']['en']} · p.{s['page']}</sub>")
        out.append(f"`초보자 {std(s,'beginner')}` · `중급자 {std(s,'intermediate')}` · "
                   f"`{'최상급자' if s['n']==10 else '상급자'} {std(s,'progression')}`{side}")
        out.append("")
        for line in s['summary']:
            out.append(f"- {line}")
        out.append("")
    out.append("---")
    out.append("")

open('docs/MOVEMENTS.md', 'w', encoding='utf-8').write('\n'.join(out))
print('docs/MOVEMENTS.md 생성:', sum(len(p['steps']) for p in d['progressions']), '스텝')
