/**
 * 단계별 시범 영상 (YouTube 외부 링크).
 *
 * 영상은 화면에 박지 않고 링크로만 연다 — 앱은 오프라인 PWA 이고, 세션 화면에
 * 플레이어를 두면 접힌 상태에서도 외부 스크립트가 따라온다.
 *
 * 공식 영상은 YouTube 에 없다 (Dragon Door 유료 DVD·VOD 뿐). 그래서 비공식
 * 채널 두 곳을 쓴다 — 5종은 Convicted Condition, 핸드스탠드 푸시업은 그 채널에
 * 없어서 Sollapps. 각 줄 주석은 영상 원제목이다 (2026-09-28 확인, 60건 모두 공개).
 */

import type { ProgressionId } from '$lib/domain/types';

export interface Video {
  /** `https://www.youtube.com/watch?v={id}` */
  url: string;
  /** 영상을 올린 채널 이름. 비공식임을 화면에 밝히는 근거. */
  channel: string;
}

const CONVICTED_CONDITION = 'Convicted Condition';
const SOLLAPPS = 'Sollapps';

const CHANNEL: Record<ProgressionId, string> = {
  pushup: CONVICTED_CONDITION,
  squat: CONVICTED_CONDITION,
  pullup: CONVICTED_CONDITION,
  legraise: CONVICTED_CONDITION,
  bridge: CONVICTED_CONDITION,
  hspu: SOLLAPPS,
};

/** 진행별 1~10단계 영상 ID. 인덱스 0 이 1단계. */
export const VIDEO_IDS: Record<ProgressionId, readonly string[]> = {
  pushup: [
    'N5C9NUHZ20U', // Pushups - Step 1 - Wall Pushups
    'Gv8y_prZBZY', // Pushups - Step 2 - Incline Pushups
    'NyzxeqY6CR8', // Pushups - Step 3 - Kneeling Pushups
    'bGuUODcwnHA', // Pushups - Step 4 - Half Pushups
    '1QJICN6udbs', // Pushups - Step 5 - Full Pushup
    '3-1vRVuWgBc', // Pushups - Step 6 - Close Pushups
    'o1abTRdwpUs', // Pushups - Step 7 - Uneven Pushups
    '63077t3I4Zc', // Pushups - Step 8 - Half One-Arm Pushups
    'Hwq5zdb-owA', // Pushups - Step 9 - Lever Pushups
    'ReKZry7JQEQ', // Pushups - Step 10 - One-Arm Pushup
  ],
  squat: [
    'a-JNXY_hnSs', // Squats - Step 1 - Shoulderstand Squats
    'QhyRsrPOkoY', // Squats - Step 2 - Jackknife Squats
    'cLQS5mZmXN0', // Squats - Step 3 - Supported Squats
    'tIHNkW0nGFg', // Squats - Step 4 - Half Squats
    'S3bNmmxkh_k', // Squats - Step 5 - Full Squats
    'MiNzsa9MIpI', // Squats - Step 6 - Close Squats
    'UhslmLWprQg', // Squats - Step 7 - Uneven Squats
    'dZON2MCVdfg', // Squats - Step 8 - Half One Legged Squats
    '9Mcs9M1HORQ', // Squats - Step 9 - Assisted One Legged Squats
    'fNCTWGl1Q8A', // Squats - Step 10 - One Legged Squat
  ],
  pullup: [
    'F8kIJMeqCMs', // Pullups - Step 1 - Vertical Pulls
    'YN0vvoqssfw', // Pullups - Step 2 - Horizontal Pulls
    '58ss6OF4fmQ', // Pullups - Step 3 - Jackknife Pullups
    'vsRRJGHhKnA', // Pullups - Step 4 - Half Pullups
    '9HBukpLkZIM', // Pullups - Step 5 - Full Pullups
    'Om_3c0jozTc', // Pullups - Step 6 - Close Pullups
    'fCHcb4MB1FM', // Pullups - Step 7 - Uneven Pullups
    've0EIQdRLag', // Pullups - Step 8 - Half One Arm Pullups
    'W8DBEewoDmY', // Pullups - Step 9 - Assisted One Arm Pullups
    '2tHTY6ZKzkc', // Pullups - Step 10 - One Arm Pullups
  ],
  legraise: [
    'N8k-SeCkR0s', // Leg Raises - Step 1 - Knee Tucks
    '98ragSP4gC8', // Leg Raises - Step 2 - Flat Knee Raises
    'qq69_MifXAc', // Leg Raises - Step 3 - Flat Bent Leg Raises
    'esoUyks3PZM', // Leg Raises - Step 4 - Flat Frog Raises
    'hav89ezKkPA', // Leg Raises - Step 5 - Flat Straight Leg Raises
    't2MU4Q4V3Xk', // Leg Raises - Step 6 - Hanging Knee Raises
    'CtFMjDbU0P4', // Leg Raises - Step 7 - Hanging Bent Leg Raises
    'GsZGSxGhcWk', // Leg Raises - Step 8 - Hanging Frog Raises
    'y4cCwSpScPo', // Leg Raises - Step 9 - Partial Straight Leg Raises
    '7jI6fDNY_yM', // Leg Raises - Step 10 - Hanging Straight Leg Raises
  ],
  bridge: [
    'JQFddjAFWZw', // Bridges - Step 1 - Short Bridges
    'gkTVDJHHIZ0', // Bridges - Step 2 - Straight Bridges
    'o9yKAjvUQlM', // Bridges - Step 3 - Angled Bridges
    'BIq3sAZAekg', // Bridges - Step 4 - Head Bridges
    'JXHnTtE9NSk', // Bridges - Step 5 - Half Bridges
    'qnU9LoO5Cyg', // Bridges - Step 6 - Full Bridges
    'LD1h45ArqcY', // Bridges - Step 7 - Wall Walking Bridges Down
    'sc_hsEM7xnA', // Bridges - Step 8 - Wall Walking Bridges Up
    'tGv50Whxouk', // Bridges - Step 9 - Closing Bridges
    'wZnixqvk-24', // Bridges - Step 10 - Stand to Stand Bridges
  ],
  hspu: [
    'z1hEO2zHo_0', // Stands - Step 1 - Wall Headstands
    'oeVMpfOqdQQ', // Stands - Step 2 - Crow stands
    'fOBpqE6LxTo', // Stands - Step 3 - Wall Handstands
    'ovP1GnUgf4c', // Stands - Step 4 - Half Handstand Pushups
    'voxgsXY0Aqo', // Stands - Step 5 - Handstand Pushups
    'mLUrxJoj8qI', // Stands - Step 6 - Close Handstand Pushups
    'hwjJL-jRoo4', // Stands - Step 7 - Uneven Handstand Pushups
    'CB-vbKfOCCw', // Stands - Step 8 - 1/2 One-Arm Handstand Pushups
    'B-HrBgJ2WPo', // Stands - Step 9 - Lever Handstand Pushups
    'ZpQcZ1upV_Q', // Stands - Step 10 - One-arm Handstand Pushups
  ],
};

/** 단계 영상. 범위를 벗어나면 `undefined`. */
export function videoFor(progressionId: ProgressionId, step: number): Video | undefined {
  const id = VIDEO_IDS[progressionId][step - 1];
  if (id === undefined) return undefined;
  return { url: `https://www.youtube.com/watch?v=${id}`, channel: CHANNEL[progressionId] };
}
