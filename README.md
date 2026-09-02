# bigsix

폴 웨이드 『죄수 운동법』(*Convict Conditioning*)의 **빅6 6종 × 10단계** 진행 로직.
오늘 무엇을 얼마나 할지 계산하고, 기준을 채웠는지 판정해 다음 단계로 올린다.

UI 없는 순수 함수 모듈이다. 의존성이 없고, Node 24 내장 타입 스트리핑과 내장 테스트 러너만 쓴다.

```bash
npm test          # 41개 테스트
npm run gen       # data/progressions.json → docs/MOVEMENTS.md
```

## 쓰는 법

```ts
import { loadCatalog, initialState, planDay, applySession } from './src/index.ts';

const catalog = loadCatalog('data/progressions.json');
let state = initialState();                       // 전 종목 2단계에서 시작

// 오늘 뭘 얼마나
const today = planDay(state, catalog, 'good_behavior', '월');
// → { exercises: [{ stepName, warmup, work: [{target, mode}], reason }], locked, rest }

// 하고 나서 기록
const { state: next, evaluation } = applySession(state, catalog, {
  date: '2026-09-02', progressionId: 'pushup', step: 5,
  sets: [20, 20], rpe: 7, kind: 'work',
});
// → evaluation.promote === true, next.steps.pushup === 6
```

## 담긴 것

| | |
|---|---|
| `data/progressions.json` | 60단계 전체 — 이름(한/영)·초보자/중급자/상급자 기준·페이지·좌우 구분·동작 요약, 프로그램 5종 |
| `src/` | 해금 판정 · 목표 계산 · 승급 판정 · 주간 배치 |
| `docs/PROGRESSIONS.md` | 기준 수치표와 진급 판정 규칙 |
| `docs/MOVEMENTS.md` | 60단계 동작 요약 (JSON 에서 생성) |
| `docs/LOGIC.md` | 로직 명세와 조정 가능한 상수 |

## 규칙 요약

**목표 계산** — 직전 세션 결과로 다음 목표가 정해진다. 중급자 기준 미달이면 유지 1세트 + 목표까지 최대한,
통과했으면 상급자 기준의 세트 수(2 또는 3)에 따라 갈린다. 직전 평균이 목표의 90% 이상이면 기준 자체에 도전한다.

**승급** — 상급자 기준을 채우면 다음 단계로. 판정은 **수행 횟수만** 본다.

**선행 조건** — 브리지·핸드스탠드는 빅4(푸시업·스쿼트·풀업·레그 레이즈)를 전부 6단계 완료해야 열린다.

**RPE**(주관적 강도, 1~10, 선택 입력) — 승급 결정을 대체하지 않고 두 군데에만 쓴다.
최근 3회 평균이 8 이상이면 기준을 채워도 **승급을 보류**하고, 직전 값이 9 이상이면 다음 세션의 유지 세트를 1 낮춘다.
심박수는 쓰지 않는다 — 이 프로그램은 저반복 고강도 구간이 많아 근력 진전과 심박 반응이 무관하다.

조정 가능한 값은 전부 [`src/rules.ts`](src/rules.ts) 에 모여 있다.

## 데이터 출처

수치와 단계명은 한국어판 **『죄수 운동법』**(폴 웨이드 저, 정미화 옮김, 비타북스 2017, ISBN 979-11-5846-142-3)
실물과 대조했다. 각 단계 본문과 장 끝 「진행 단계 차트」를 **이중 대조**했고, 어긋나는 곳은 문서에 남겼다.

`docs/MOVEMENTS.md` 의 동작 설명은 **책 원문이 아니라 직접 작성한 요약**이다.

훈련 내용 자체를 익히려면 책을 사라. 이 레포는 기준 수치와 진행 로직만 다룬다.

## 라이선스

MIT. 단, 위 서지의 저작권은 원저작자와 출판사에 있다.
