// 환경변수 읽기 (SPEC FR-35.7, ADR-37).
//
// `PUSH_RELAY_API` · `PUSH_RELAY_KEY` 둘을 요구한다. 하나라도 없으면 변수 이름을
// 명시한 설명 있는 오류를 throw 한다 — journald 에서 바로 보고 고칠 수 있게.
//
// 테스트가 임의의 env 를 넘길 수 있도록 인자로 받는다. 기본값은 `process.env`.

export interface CronEnv {
  /** 릴레이 cron API 베이스 URL. 예: `http://127.0.0.1:8793` (prod), `http://127.0.0.1:8803` (dev). */
  relayApi: string;
  /** `prk_…` 형식의 cron API 키. 로그에 남기지 않는다. */
  relayKey: string;
}

export function readEnv(env: NodeJS.ProcessEnv = process.env): CronEnv {
  const relayApi = env.PUSH_RELAY_API;
  const relayKey = env.PUSH_RELAY_KEY;
  if (!relayApi) {
    throw new Error(
      '환경변수 PUSH_RELAY_API 가 비어 있다. 릴레이 cron API 주소를 지정해야 한다 ' +
        '(prod: http://127.0.0.1:8793, dev: http://127.0.0.1:8803).'
    );
  }
  if (!relayKey) {
    throw new Error(
      '환경변수 PUSH_RELAY_KEY 가 비어 있다. 릴레이 cron API 키 (prk_… 형식) 를 지정해야 한다. ' +
        '~/apps/push-relay/<env>/data/keys/bigsix.env 를 EnvironmentFile 로 읽는지 확인한다.'
    );
  }
  return { relayApi, relayKey };
}
