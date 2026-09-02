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
   * true  = 6단계를 '완료'(승급 완료)해야 하므로 currentStep >= 7 필요
   * false = 6단계에 '도달'하면 되므로 currentStep >= 6 이면 통과
   * 책의 "6단계 완료" 를 엄격하게 읽으면 true.
   */
  gateRequiresCompletion: true,

  /** book: 직전 평균이 목표 기준의 이 비율에 도달하면 기준 자체에 도전한다. */
  attemptThreshold: 0.9,

  /** book: 워밍업은 최대 2세트. */
  maxWarmupSets: 2,

  /** book: 아무리 강해도 2단계부터 시작할 것을 권한다. */
  startStep: 2,

  /** book: 초보자 기준 미달 시 이전 단계 상급자 기준으로 다지는 세트 수. */
  consolidationSets: 2,

  /** 정책: 최근 N개 세션의 RPE 평균이 임계 이상이면 승급을 보류한다. */
  rpeVetoWindow: 3,
  rpeVetoMean: 8,

  /** 정책: 직전 RPE 가 이 값 이상이면 다음 세션의 유지 세트 목표를 낮춘다. */
  rpeDownshiftAt: 9,
  rpeDownshiftAmount: 1,
} as const;
