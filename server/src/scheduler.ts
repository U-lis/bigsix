// 발송 스케줄러. ADR-32.
//
// systemd timer 가 1분마다 이 파일을 부른다 (Phase 4). 이 페이즈에서는 CLI 진입점만.
// 매 실행마다 각 구독의 `tz` 로 지금 이 순간의 로컬 요일·시각을 구해 `notifyAt` 과 비교.
// 정확히 일치하고 그날 schedule 이 비어 있지 않으면 발송.
//
// - dedup 키: `${endpoint}|${로컬 YYYY-MM-DD}` — 하루 한 번.
// - 보존: 8일. 매 실행 끝에 오래된 sentLog 엔트리 정리.
// - 응답이 404/410 → 그 구독을 저장소에서 즉시 삭제 (FR-37.4 / EC-78 / EC-85).
// - 서버가 아는 것은 endpoint · keys · programId · notifyAt · tz 뿐. 종목명은
//   `progressions.json` + programId + 요일로 서버가 직접 계산 (FR-34.2).
//
// 시각 판정은 `now` 를 주입 가능하게 두어 결정적으로 테스트한다.
// 발송 함수(`send`)도 주입 가능. 테스트에서 web-push 스텁 없이 결과를 지시할 수 있다.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	loadStore,
	removeSubscription,
	saveStore,
	type Store,
	type Subscription
} from './subscriptions.ts';
import { loadConfig, type Config } from './config.ts';
import { buildPayload, type WeekdayKo } from './progressions.ts';
import { sendPush, type PushResult, type Vapid } from './push.ts';

export interface TickOptions {
	dataDir: string;
	now: Date;
	vapid: Vapid;
	retentionDays: number;
	/** 발송 함수. 기본값은 push.ts 의 sendPush — 테스트에서 스텁 주입. */
	send?: (
		endpoint: string,
		sub: Pick<Subscription, 'keys'>,
		payload: unknown,
		vapid: Vapid
	) => Promise<PushResult>;
}

export interface TickResult {
	sent: number;
	skipped: number;
	removed: number;
	prunedLogs: number;
}

export interface LocalMoment {
	date: string; // YYYY-MM-DD (로컬 tz)
	hhmm: string; // HH:MM (로컬 tz, 24h)
	weekday: WeekdayKo;
}

const WEEKDAY_MAP: Record<string, WeekdayKo> = {
	Mon: '월',
	Tue: '화',
	Wed: '수',
	Thu: '목',
	Fri: '금',
	Sat: '토',
	Sun: '일'
};

/**
 * `instant` (UTC) 를 IANA `tz` 기준 로컬 시각으로 환산. tz 가 잘못됐거나
 * 파싱 실패하면 null. `Intl.DateTimeFormat` 만 쓰기 때문에 별도 라이브러리 불필요.
 */
export function localizeToTz(instant: Date, tz: string): LocalMoment | null {
	try {
		const fmt = new Intl.DateTimeFormat('en-CA', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			weekday: 'short',
			hour12: false
		});
		const parts: Record<string, string> = {};
		for (const p of fmt.formatToParts(instant)) parts[p.type] = p.value;
		const weekday = WEEKDAY_MAP[parts.weekday];
		if (weekday === undefined) return null;
		if (parts.year === undefined || parts.month === undefined || parts.day === undefined) return null;
		if (parts.hour === undefined || parts.minute === undefined) return null;
		// hour12:false 에서도 자정이 '24' 로 나오는 로케일이 있어 정규화.
		const hh = parts.hour === '24' ? '00' : parts.hour;
		return {
			date: `${parts.year}-${parts.month}-${parts.day}`,
			hhmm: `${hh}:${parts.minute}`,
			weekday
		};
	} catch {
		return null;
	}
}

/**
 * sentLog 에서 오늘 로컬 날짜 기준 `retentionDays` 를 넘어선 엔트리를 지운다.
 * 키 규약 `"<endpoint>|YYYY-MM-DD"` — endpoint 안에 파이프가 있어도 마지막 파이프 이후가 날짜.
 * `retentionDays` 이내(경계 포함)는 유지.
 */
export function pruneSentLog(
	log: Record<string, string>,
	now: Date,
	retentionDays: number
): Record<string, string> {
	const cutoff = new Date(now.getTime());
	cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
	const cutoffStr = cutoff.toISOString().slice(0, 10);
	let changed = false;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(log)) {
		const pipe = k.lastIndexOf('|');
		const date = pipe === -1 ? '' : k.slice(pipe + 1);
		if (date >= cutoffStr) out[k] = v;
		else changed = true;
	}
	return changed ? out : log;
}

/**
 * 한 tick — 저장소를 열어 조건에 맞는 구독을 발송하고, 결과를 반영해 저장한다.
 * 순수 함수는 아니지만 `now` · `send` 를 주입할 수 있어 결정적으로 테스트된다.
 */
export async function runTick(opts: TickOptions): Promise<TickResult> {
	const send = opts.send ?? sendPush;
	const store = await loadStore(opts.dataDir);
	let next: Store = store;
	let sent = 0;
	let skipped = 0;
	let removed = 0;

	for (const [endpoint, sub] of Object.entries(store.subscriptions)) {
		// 이미 이 tick 안에서 gone 처리된 endpoint 는 건너뜀 (removeSubscription 은
		// 우리가 `next` 로 지웠어도 이 for-of 는 원본 store 를 순회하므로 방어적으로 재확인).
		if (next.subscriptions[endpoint] === undefined) {
			skipped++;
			continue;
		}
		const local = localizeToTz(opts.now, sub.tz);
		if (local === null) {
			skipped++;
			continue;
		}
		if (local.hhmm !== sub.notifyAt) {
			skipped++;
			continue;
		}
		const payload = buildPayload(sub.programId, local.weekday);
		if (payload === null) {
			// 휴식일(EC-83) 또는 알 수 없는 programId.
			skipped++;
			continue;
		}
		const key = `${endpoint}|${local.date}`;
		if (next.sentLog[key] !== undefined) {
			skipped++;
			continue;
		}

		let result: PushResult;
		try {
			result = await send(endpoint, { keys: sub.keys }, payload, opts.vapid);
		} catch (e) {
			// send 가 스스로 예외를 삼키지 않은 경우.
			console.error(`push 예외 ${endpoint}:`, e);
			skipped++;
			continue;
		}

		if (result.kind === 'ok') {
			next = {
				...next,
				sentLog: { ...next.sentLog, [key]: opts.now.toISOString() }
			};
			sent++;
		} else if (result.kind === 'gone') {
			next = removeSubscription(next, endpoint);
			removed++;
		} else if (result.kind === 'endpoint-rejected') {
			// 등록 시점 검사와 발송 시점 검사가 어긋난 경우 — 저장소에서 즉시 제거.
			// (파일 편집으로 임의 endpoint 가 끼어들거나, 허용 목록이 축소된 경우.)
			console.error(`endpoint 화이트리스트 밖 · 즉시 제거 ${endpoint}: ${result.reason}`);
			next = removeSubscription(next, endpoint);
			removed++;
		} else {
			// auth / network / other — 저장소는 건드리지 않는다. 다음 tick 재시도.
			console.error(`push 실패 ${endpoint}:`, result);
			skipped++;
		}
	}

	// dedup 로그 pruning (ADR-32 보존 8일).
	const prunedLog = pruneSentLog(next.sentLog, opts.now, opts.retentionDays);
	const prunedLogs = Object.keys(next.sentLog).length - Object.keys(prunedLog).length;
	if (prunedLog !== next.sentLog) next = { ...next, sentLog: prunedLog };

	if (next !== store) await saveStore(opts.dataDir, next);
	return { sent, skipped, removed, prunedLogs };
}

/** VAPID 비밀키 파일과 공개키 · subject 를 묶어 Vapid 로. 파일 부재 시 명확한 에러. */
export function readVapid(cfg: Config): Vapid {
	if (cfg.vapidPublicKey === '') {
		throw new Error(
			'VAPID 공개키가 설정되지 않았다. BIGSIX_VAPID_PUBLIC_KEY 환경변수를 지정하라.'
		);
	}
	let privateKey: string;
	try {
		privateKey = readFileSync(cfg.vapidPrivateKeyPath, 'utf8').trim();
	} catch (e) {
		const err = e as NodeJS.ErrnoException;
		throw new Error(
			`VAPID 비밀키 파일을 읽을 수 없다 (${cfg.vapidPrivateKeyPath}): ${err.message}. ` +
				'server/scripts/vapid-init.mjs 로 키를 생성하거나 BIGSIX_VAPID_PRIVATE_KEY_PATH 로 경로를 지정하라.'
		);
	}
	if (privateKey === '') {
		throw new Error(`VAPID 비밀키 파일이 비어 있다: ${cfg.vapidPrivateKeyPath}`);
	}
	return {
		subject: cfg.vapidSubject,
		publicKey: cfg.vapidPublicKey,
		privateKey
	};
}

function isEntry(): boolean {
	const argv1 = process.argv[1];
	if (typeof argv1 !== 'string') return false;
	try {
		const argvUrl = new URL(`file://${resolve(argv1)}`).href;
		return argvUrl === import.meta.url;
	} catch {
		return false;
	}
}

if (isEntry()) {
	const cfg = loadConfig();
	// CLI 진입점: VAPID 읽기 실패는 즉시 종료 (에러 메시지가 이유를 담고 있음).
	let vapid: Vapid;
	try {
		vapid = readVapid(cfg);
	} catch (e) {
		console.error((e as Error).message);
		process.exit(1);
	}
	const cwd = process.cwd();
	const dataDir = resolve(cwd, cfg.dataDir);
	const result = await runTick({
		dataDir,
		now: new Date(),
		vapid,
		retentionDays: 8
	});
	console.log(
		`tick { sent: ${result.sent}, skipped: ${result.skipped}, removed: ${result.removed}, prunedLogs: ${result.prunedLogs} }`
	);
}

