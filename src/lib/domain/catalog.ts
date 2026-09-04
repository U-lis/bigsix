import type { Catalog, Progression, ProgressionId, Standard, Step } from './types.ts';

// loadCatalog(path) 는 여기 있었다. node:fs 에 의존해 브라우저에서 동작하지 않으므로
// 제거했다 (FR-0.7 / EC-22). 앱과 테스트는 src/lib/data/catalog.ts 의 loadCatalog()
// (인자 없음, vite JSON import) 를 함께 쓴다 (FR-10.2 / FR-10.4).

export function fromJSON(raw: any): Catalog {
  return { progressions: raw.progressions, programs: raw.programs };
}

export function getProgression(catalog: Catalog, id: ProgressionId): Progression {
  const p = catalog.progressions.find((x) => x.id === id);
  if (!p) throw new Error(`알 수 없는 종목: ${id}`);
  return p;
}

export function getStep(catalog: Catalog, id: ProgressionId, n: number): Step {
  const s = getProgression(catalog, id).steps.find((x) => x.n === n);
  if (!s) throw new Error(`${id} 에 ${n}단계가 없다`);
  return s;
}

/** 범위형 기준(브리지 마스터 10~30회)은 하한을 판정값으로 쓴다. */
export function valueOf(std: Standard): number {
  return Array.isArray(std.value) ? std.value[0] : std.value;
}

/** 1~9단계는 progression, 10단계는 elite 가 최종 기준이다. */
export function topStandard(step: Step): Standard {
  const s = step.progression ?? step.elite;
  if (!s) throw new Error(`${step.n}단계에 최종 기준이 없다`);
  return s;
}

export function topLabel(step: Step): 'progression' | 'elite' {
  return step.progression ? 'progression' : 'elite';
}
