/**
 * 조정 가능한 규칙 상수.
 *
 * `book` 표시가 붙은 값은 책에 명시된 것이고,
 * 나머지는 앱 정책이다 — 바꿔도 책과 어긋나지 않는다.
 */
export const RULES = {
  /** book: 브리지·핸드스탠드는 빅4가 이 단계를 완료해야 시작한다. */
  gateStep: 6,
  /**
   * 결정: true — 6단계를 완수하고 7단계에 진입해야 해금된다.
   * (false 로 두면 6단계 도달만으로 해금)
   */
  gateRequiresCompletion: true,

  /** book: 직전 평균이 목표 기준의 이 비율에 도달하면 기준 자체에 도전한다. */
  attemptThreshold: 0.9,

  /** book: 아무리 강해도 2단계부터 시작할 것을 권한다. */
  startStep: 2,

  /** book: 초보자 기준 미달 시 이전 단계 상급자 기준으로 다지는 세트 수. */
  consolidationSets: 2,

  /**
   * 정책: 다지기가 이 횟수만큼 쌓일 때마다 수행량을 한 단계 올린다.
   * 같은 자리에 머무는 동안 자극이 늘지 않는 문제를 막는다.
   */
  consolidationBumpEvery: 3,
  /** 정책: 올릴 때의 증가폭(기준값 대비). 30 → 33 → 36 → 39. */
  consolidationBumpRatio: 0.1,

  /** 정책: 최근 N개 세션의 RPE 평균이 임계 이상이면 승급을 보류한다. */
  rpeVetoWindow: 3,
  rpeVetoMean: 8,

  /** 정책: 직전 RPE 가 이 값 이상이면 다음 세션의 유지 세트 목표를 낮춘다. */
  rpeDownshiftAt: 9,
  rpeDownshiftAmount: 1,
} as const;
