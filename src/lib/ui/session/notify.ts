/**
 * 다중 알림 — 소리 · 진동 · 화면 점멸을 동시에 시도한다 (FR-6.14 / EC-24).
 *
 * 한 수단이 막혀 있어도(무음 모드, 진동 미지원, 브라우저의 자동 재생 정책) 나머지로
 * 전달된다. 5초만 울리고 자동 조용해진다 (FR-6.14).
 *
 * 소리는 짧은 삐 소리를 `WebAudio` 로 만든다 — 오디오 파일을 배포에 심지 않기 위함.
 * 파일 로딩·CORS·프리캐시 문제를 걷어낸다.
 *
 * 화면 점멸은 `<body>` 에 `data-flash` 속성을 붙였다 뗀다 — CSS 는 레이아웃에서
 * 처리한다.
 */

export interface NotifyOptions {
  /** 알림 지속 시간(ms). 기본 5000. */
  durationMs?: number;
  /** 각 진동 펄스 길이(ms). */
  vibrateMs?: number;
  /** 소리 톤(Hz). */
  freqHz?: number;
}

export interface NotifyHandle {
  /** 5초를 기다리지 않고 즉시 종료한다. */
  cancel(): void;
}

/**
 * 5초간 세 수단으로 알린다.
 * 각 수단은 독립적으로 시도하며 한 쪽이 실패해도 나머지에 영향이 없다.
 */
export function alert(options: NotifyOptions = {}): NotifyHandle {
  const durationMs = options.durationMs ?? 5_000;
  const freqHz = options.freqHz ?? 880;
  const vibrateMs = options.vibrateMs ?? 400;

  const stops: Array<() => void> = [];

  // ── 소리 ──────────────────────────────────────────────────────
  try {
    stops.push(startBeep(freqHz, durationMs));
  } catch {
    // 오디오 컨텍스트 실패 (자동 재생 정책, 지원 안 함 등) — 나머지로 진행.
  }

  // ── 진동 ──────────────────────────────────────────────────────
  try {
    startVibration(vibrateMs, durationMs);
    // 진동은 자체 스케줄이라 stop 이 필요 없다 — 하지만 명시적 종료가 필요할 수 있으니 훅만.
    stops.push(() => {
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(0); // 종료
        }
      } catch {
        // ignore
      }
    });
  } catch {
    // 진동 미지원 — 나머지로 진행.
  }

  // ── 화면 점멸 ─────────────────────────────────────────────────
  try {
    stops.push(startFlash(durationMs));
  } catch {
    // DOM 접근 실패 (SSR) — 나머지로 진행.
  }

  // 5초 후 자동 종료.
  const autoTimer = setTimeout(() => {
    for (const s of stops) s();
  }, durationMs);

  return {
    cancel(): void {
      clearTimeout(autoTimer);
      for (const s of stops) s();
    },
  };
}

// ── 개별 수단 구현 ────────────────────────────────────────────────

function startBeep(freqHz: number, durationMs: number): () => void {
  if (typeof globalThis === 'undefined') throw new Error('no globalThis');
  const w = globalThis as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (Ctor === undefined) throw new Error('WebAudio 없음');
  const ctx = new Ctor();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freqHz;
  gain.gain.value = 0.1;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  const stopAt = ctx.currentTime + durationMs / 1000;
  osc.stop(stopAt);
  return () => {
    try {
      osc.stop();
    } catch {
      // 이미 정지
    }
    try {
      void ctx.close();
    } catch {
      // ignore
    }
  };
}

function startVibration(pulseMs: number, durationMs: number): void {
  if (typeof navigator === 'undefined') throw new Error('no navigator');
  if (typeof navigator.vibrate !== 'function') throw new Error('vibrate 미지원');
  // [진동, 쉼, 진동, 쉼, ...] 패턴을 durationMs 까지 반복.
  const cycle = pulseMs * 2;
  const pattern: number[] = [];
  let remaining = durationMs;
  while (remaining > 0) {
    pattern.push(Math.min(pulseMs, remaining));
    remaining -= pulseMs;
    if (remaining <= 0) break;
    pattern.push(Math.min(pulseMs, remaining));
    remaining -= pulseMs;
    void cycle;
  }
  const ok = navigator.vibrate(pattern);
  if (!ok) throw new Error('vibrate 거부됨');
}

function startFlash(durationMs: number): () => void {
  if (typeof document === 'undefined') throw new Error('no document');
  const body = document.body;
  if (body === null) throw new Error('no body');
  body.setAttribute('data-flash', 'on');
  const t = setTimeout(() => {
    try {
      body.removeAttribute('data-flash');
    } catch {
      // ignore
    }
  }, durationMs);
  return () => {
    clearTimeout(t);
    try {
      body.removeAttribute('data-flash');
    } catch {
      // ignore
    }
  };
}
