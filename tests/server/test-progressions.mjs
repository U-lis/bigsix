// server/src/progressions.ts — 요일별 종목 · 프로그램 이름 · 알림 본문 (FR-34, H-9, H-10).
//
// 서버가 아는 것은 programId 와 요일뿐이며, 여기서 종목명을 계산해 알림 본문을 만든다.
// 단계 번호는 넣지 않는다 (FR-34.2). 휴식일에는 null 을 돌려 스케줄러가 스킵할 신호.

import {
	programName,
	progressionsForDay,
	buildPayload,
	WEEKDAYS
} from '../../server/src/progressions.ts';
import { section, eq, ok, ng, assertTrue, summary } from './helpers.mjs';

section('progressions — programName · progressionsForDay · buildPayload (FR-34)');

// --- programName ---
eq("programName('good_behavior') = '모범수'", '모범수', programName('good_behavior'));
eq("programName('new_blood') = '신참'", '신참', programName('new_blood'));
eq("programName('veterano') = '베테랑'", '베테랑', programName('veterano'));
eq(
	"programName('solitary_confinement') = '독방 감금'",
	'독방 감금',
	programName('solitary_confinement')
);
eq("programName('supermax') = '슈퍼맥스'", '슈퍼맥스', programName('supermax'));
eq("programName('unknown') = null", null, programName('unknown'));

// --- progressionsForDay: 대표 케이스 ---
{
	const out = progressionsForDay('good_behavior', '월');
	eq('good_behavior 월요일 종목 수', 2, out.length);
	eq('good_behavior 월요일 첫 종목', '푸시업', out[0]);
	eq('good_behavior 월요일 둘째 종목', '레그 레이즈', out[1]);
}
eq(
	"good_behavior 화요일 → [] (휴식)",
	0,
	progressionsForDay('good_behavior', '화').length
);
{
	const out = progressionsForDay('good_behavior', '수');
	eq('good_behavior 수요일 첫 종목', '풀업', out[0]);
	eq('good_behavior 수요일 둘째 종목', '스쿼트', out[1]);
}
{
	const out = progressionsForDay('good_behavior', '금');
	eq('good_behavior 금요일 첫 종목', '핸드스탠드 푸시업', out[0]);
	eq('good_behavior 금요일 둘째 종목', '브리지', out[1]);
}
{
	const out = progressionsForDay('new_blood', '목');
	eq('new_blood 목요일 종목 수', 2, out.length);
	eq('new_blood 목요일 첫 종목', '풀업', out[0]);
	eq('new_blood 목요일 둘째 종목', '스쿼트', out[1]);
}

// --- 일요일: 모든 프로그램에서 휴식 ---
for (const pid of ['good_behavior', 'new_blood', 'veterano', 'solitary_confinement', 'supermax']) {
	eq(`${pid} 일요일 휴식`, 0, progressionsForDay(pid, '일').length);
}

// --- veterano 는 요일마다 한 종목 (교차 반복 스타일) ---
{
	const mon = progressionsForDay('veterano', '월');
	eq('veterano 월요일 종목 수 1', 1, mon.length);
	eq('veterano 월요일 = 풀업', '풀업', mon[0]);
	const tue = progressionsForDay('veterano', '화');
	eq('veterano 화요일 = 브리지', '브리지', tue[0]);
}

// --- solitary_confinement 는 요일별 3종목 · 4종목 혼합 ---
{
	const mon = progressionsForDay('solitary_confinement', '월');
	eq('solitary_confinement 월요일 종목 수', 3, mon.length);
	assertTrue('solitary_confinement 월요일에 풀업 포함', mon.includes('풀업'));
	assertTrue('solitary_confinement 월요일에 악력 운동 포함', mon.includes('악력 운동'));
}

// --- 알 수 없는 programId ---
eq(
	'unknown programId → []',
	0,
	progressionsForDay('not_a_program', '월').length
);

// --- buildPayload ---
{
	const p = buildPayload('good_behavior', '월');
	if (p === null) ng('good_behavior 월요일 payload 는 null 이면 안 됨');
	else {
		eq('buildPayload title', '빅6', p.title);
		eq('buildPayload body', '모범수 · 푸시업, 레그 레이즈', p.body);
		eq('buildPayload icon', '/icon-192.png', p.icon);
	}
}
{
	const p = buildPayload('new_blood', '목');
	if (p === null) ng('new_blood 목요일 payload null');
	else eq('new_blood 목요일 body', '신참 · 풀업, 스쿼트', p.body);
}
{
	const p = buildPayload('veterano', '수');
	if (p === null) ng('veterano 수요일 payload null');
	else eq('veterano 수요일 body (단일 종목)', '베테랑 · 핸드스탠드 푸시업', p.body);
}
eq('buildPayload 휴식일 → null', null, buildPayload('good_behavior', '화'));
eq('buildPayload 일요일 → null', null, buildPayload('supermax', '일'));
eq('buildPayload 알 수 없는 programId → null', null, buildPayload('unknown', '월'));

// --- 알림 본문에 단계 번호는 절대 안 들어간다 (FR-34.2) ---
for (const day of WEEKDAYS) {
	for (const pid of ['good_behavior', 'new_blood', 'veterano', 'solitary_confinement', 'supermax']) {
		const p = buildPayload(pid, day);
		if (p === null) continue;
		assertTrue(
			`${pid}/${day} body 에 단계 번호 없음`,
			!/step\s*\d|단계\s*\d|\bn\d/.test(p.body),
			`실제: ${p.body}`
		);
	}
}

// --- WEEKDAYS 상수 자체 ---
eq('WEEKDAYS 길이 = 7', 7, WEEKDAYS.length);
eq('WEEKDAYS[0] = 월', '월', WEEKDAYS[0]);
eq('WEEKDAYS[6] = 일', '일', WEEKDAYS[6]);
assertTrue('WEEKDAYS 는 frozen', Object.isFrozen(WEEKDAYS));

ok('progressions 로더가 요일별 종목·이름·payload 를 안정적으로 계산');

summary();
