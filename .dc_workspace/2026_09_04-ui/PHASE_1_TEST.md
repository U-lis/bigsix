# Phase 1 검증

**목적**: Phase 1 커밋이 (a) 파일 이동을 완전히 반영했고 (b) 내용을 바꾸지 않았고 (c) git 이 이를
rename 으로 인식했음을 증명한다.

**주의**: 이 페이즈에서는 **테스트 러너를 돌리지 않는다.** 러너는 아직 옛 경로를 본다. Phase 2 가
러너와 경로를 함께 세팅한 뒤에 474개 전 통과가 검증된다 (FR-0.5 / EC-20 해석은 GLOBAL.md 「SPEC 과의
불일치」1 참조).

---

## 위치 검증

- [ ] `find src/lib/domain -maxdepth 1 -name '*.ts' | wc -l` == **14**
- [ ] `find src/lib/data -maxdepth 1 -name '*.json' | wc -l` == **1**
- [ ] `find tests/unit -maxdepth 1 -name '*.ts' | wc -l` == **14** (12 test + helpers + tz-probe)
- [ ] `find src -maxdepth 1 -type f -name '*.ts' | wc -l` == **0** (옛 위치 비었다)
- [ ] `find data -maxdepth 1 -type f 2>/dev/null | wc -l` == **0** 또는 `data/` 자체가 없다
- [ ] `find test -maxdepth 1 -type f 2>/dev/null | wc -l` == **0** 또는 `test/` 자체가 없다

## 내용 무변경 검증

- [ ] `git diff --cached --stat HEAD~1..HEAD` 의 마지막 요약 라인이 `0 insertions(+), 0 deletions(-)` 다
- [ ] 임의 파일 스팟 체크 — `git show HEAD -- src/lib/domain/types.ts` 이 옛 `src/types.ts` 의 마지막
      커밋 내용과 정확히 같다 (`git diff HEAD~1:src/types.ts HEAD:src/lib/domain/types.ts` 출력이 비어야 함)
- [ ] 데이터 파일도 동일 — `git diff HEAD~1:data/progressions.json HEAD:src/lib/data/progressions.json`
      출력이 비어야 함
- [ ] 헬퍼도 동일 — `git diff HEAD~1:test/helpers.ts HEAD:tests/unit/helpers.ts` 출력이 비어야 함

## rename 인식 검증 (Risk 1)

- [ ] `git log --stat -M -C -1` 의 각 라인이 `renamed:` 또는 `rename …` 형태로 표시된다
- [ ] `git log --diff-filter=A -1 --stat` 이 **새 추가 파일 0** (전부 rename 이므로 add 없음)
- [ ] `git log --diff-filter=D -1 --stat` 이 **삭제 파일 0** (전부 rename 이므로 delete 없음)
- [ ] `git log --numstat -M -C -1 | awk '$1 != 0 || $2 != 0'` 이 헤더 외 출력을 내지 않는다
      (numstat 상 추가·삭제 라인 0)

## 의도 확인

- [ ] 이 커밋 메시지의 첫 줄이 `refactor(structure): src → src/lib/domain, ...` 로 시작한다
- [ ] 커밋 메시지 본문에 "파일 이동만" 과 "npm test 가 돌지 않는다" 문구가 있다 (다음 페이즈가 그 상태에서
      시작한다는 사실을 다음 개발자·리뷰어가 안다)

## 다음 페이즈 준비

- [ ] `src/lib/ui/` 는 **아직 없다** (Phase 4 에서 생성)
- [ ] `src/routes/` 는 **아직 없다** (Phase 4 에서 생성)
- [ ] `svelte.config.js` / `vite.config.ts` / `vitest.config.ts` / `tsconfig.json` 은 **아직 없다** (Phase 2)
- [ ] `package.json` 은 **원본 그대로다** — `name: "bigsix-engine"`, `test: "node --experimental-strip-types ..."`

---

## 실패 시 대처

- rename 인식 실패 (파일이 delete + add 로 표시): 커밋을 `git reset HEAD~1` 로 되돌리고 `git mv` 만
  사용해서 다시 커밋. `mv` + `git add` 조합은 크기·해시가 유지되면 인식되지만 확실하지 않으므로
  `git mv` 를 쓴다.
- 내용이 바뀐 파일 발견: `git checkout HEAD~1 -- <경로>` 로 옛 내용을 이관 후 파일에 복사하고 재커밋.
- 이관 대상 누락 발견: 누락 파일만 추가 이관하고 amend 하지 않는다 — **새 커밋으로 잇는다**. 이미
  Phase 1 커밋이 있으면 amend 는 하지 않고 (도구 신뢰성) 후속 커밋으로 처리하되, 그 후속도 rename
  으로 인식되어야 한다.


---

## 검증 지적 반영 (spec-validator, 2026-09-05)

- **EC-20 은 Phase 1 에서 확인할 수 없다** (Info 14). 이 커밋 시점에는 테스트 러너가 없어
  실행 자체가 불가능하다. EC-20 의 실질 검증은 **Phase 2 완료 시점**이며, GLOBAL 합의 #2
  ("FR-0.5 의 474개 통과 = Phase 2 끝") 와 같은 해석이다.
  Phase 1 이 확인하는 것은 **`git mv` 가 rename 으로 인식되는가** 하나뿐이다.
