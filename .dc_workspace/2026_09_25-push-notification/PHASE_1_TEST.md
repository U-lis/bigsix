# Phase 1: 테스트 케이스

## 상태: 완료

`tests/unit/precache-parity.test.ts` 에서 제공됨.

## 검증한 동작

- **동작**: 빌드 산출 `sw.js` 의 프리캐시 매니페스트 URL 이 이전 `generateSW` 출력과 정확히 일치한다 | **계층**: 빌드 산출물 (spawnSync pnpm build)
- **동작**: 빌드 산출 `sw.js` 에 `import` 문이 없다 | **계층**: 빌드 산출물
- **동작**: 프리캐시된 모든 URL 이 빌드 출력 디렉터리에 실제 파일로 존재한다 | **계층**: 빌드 산출물
