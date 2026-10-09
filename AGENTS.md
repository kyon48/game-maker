# AGENTS.md

데이터 구동형 2D RPG 엔진. 엔진 하나로 여러 게임(팩)을 만들고 유지보수하며, 최종적으로는 **게임을 촬영 대본대로 자동 플레이해 유튜브 영상**을 만든다.

## 기준 문서

| 문서 | 역할 |
|---|---|
| `docs/02-architecture.md` | **엔진 명세(정본).** 엔진 동작은 이 문서가 기준이다 |
| `docs/04-video-pipeline.md` | 영상 파이프라인 V1~V4(녹화·TTS·비주얼노벨 표현·콘텐츠) |
| `docs/06-game-features.md` | 게임 요소 G0~G5(배회 NPC·텍스트 치환·씬·아이템·전투·사운드) |
| `docs/08-story-to-game-plan.md` | 스토리 → 게임 → 영상 자동화(S 트랙)와 **현재 진행 순서**. `.story.md` 문법(§2.3) |
| `docs/07-narration-style.md` | 나레이션 작법. 나레이션은 게임 대화창이 아니라 촬영 대본(film) 층에 둔다 |
| `docs/05-mascot-bible.md` | 아트 기준(구현과 무관) |
| `docs/decisions.md` | 구현 중 결정 기록 |

문서끼리 충돌하면 02 → 04/06/08 → 07 순으로 우선한다. 배경 자료(01, 03, archive)는 읽기만 한다.

## 진행 순서

M1~M8(엔진 MVP), V1(녹화), G0, S1a는 완료됐다. 이후 순서(08 §5):

`S1b → S1c → G1 → V2 → S2 → V3a → S3 → [첫 영상] → G3 → G2 → V3b + G5 → G4 → V4`

- 프롬프트 하나에 단계 하나만 진행한다.
- 브랜치는 **main에서 새로 만든 `feature/<단계>`**(예: `feature/g0`). 끝나면 그 브랜치에 커밋하고 `git branch --show-current` 결과와 함께 요약한다. 푸시하지 않는다.
- 단계가 끝나면 `npm run check`가 통과해야 한다. 실패를 테스트 skip이나 규칙 완화로 넘기지 않는다.
- 명세에 없거나 모호한 부분은 가장 단순한 쪽으로 구현하고 `docs/decisions.md`에 `날짜 / 단계 / 결정 / 이유` 한 줄로 기록한다. 명세와 다르게 구현해야 하면 먼저 기록한다.
- 명세에 "MVP 밖", "구현하지 말 것"으로 표시된 것과 아직 순서가 오지 않은 단계는 만들지 않는다.
- 기능을 추가하면 엔진 minor, 버그 수정만이면 patch 버전을 올린다(명세 §13.2).

## 절대 규칙

1. `engine/sim`, `engine/data`, `engine/api`, `packs/*/plugins`에서 DOM·Canvas·`window`·`document`·`localStorage`를 쓰지 않는다. (명세 §4.2)
2. 시뮬레이션에서 `Math.random`, `Date.now`, `performance.now`를 직접 호출하지 않는다. 난수가 필요하면 시드 고정 rng를 쓴다. (P4)
3. `engine/` 아래에 특정 팩의 ID·문자열·경로를 넣지 않는다. 사용자에게 보이는 문구는 팩 데이터(`labels`, 이벤트)에서 온다. (P1)
4. 플러그인은 `@engine/api`와 `@sinclair/typebox`만 import한다.
5. 내장 커맨드는 1파일 1커맨드로 `engine/sim/commands/`에 두고, 플러그인과 같은 `CommandRegistry.register()`로 등록한다.
6. 팩 JSON 포맷을 바꾸는 변경은 명세 §13.3(마이그레이션 동반) 없이는 하지 않는다. 선택 필드·선택 파일·커맨드 추가는 포맷 변경이 아니다.
7. 런타임 의존성은 TypeBox 하나다. 개발 의존성을 추가하면 `docs/decisions.md`에 근거를 남긴다.
8. **`engine/`은 `tools/`를 import하지 않는다.** 브라우저와 Node 도구가 함께 쓰는 코드는 `engine/` 안에 두고 `tools/`가 가져다 쓴다.
9. **녹화·TTS·오디오 합성은 sim에 넣지 않는다.** sim에 들어가는 영상 관련 기능은 04 §5.3(음성 길이표를 받아 메시지 자동 진행)뿐이다.
10. 작업 중 띄운 개발 서버·미리보기 서버·브라우저·ffmpeg 프로세스는 작업이 끝나면 종료한다. 사용자가 같은 폴더에서 작업한다.

## 명령

```
npm run dev                      # http://localhost:5173/?pack=demo
npm run check                    # typecheck → lint → test → schemas --check → validate → scenarios → films → build:all
npm run validate -- <packId>|--all
npm run scenarios -- <packId>|--all
npm run films -- <packId>|--all  # 촬영 대본 헤드리스 리허설
npm run film -- <packId> <film> [--fps 30|60] [--chapter <제목>] [--out <dir>]   # mp4 녹화
npm run film:verify              # 같은 대본 두 번 녹화해 프레임 해시 비교(check 미포함)
npm run build -- <packId>|--all
npm run migrate-pack -- <packId>|--all
```

녹화를 처음 하기 전에 `npx playwright install chromium --no-shell`을 한 번 실행한다.

## 테스트

- 엔진 로직: `tests/` (Vitest). 버그를 고치면 재현 테스트를 먼저 추가한다.
- 게임 동작: `packs/<id>/tests/*.scenario.json` (명세 §12). 새 커맨드나 트리거 동작을 추가하면 팩에 시나리오를 추가한다.
- 촬영 대본: `packs/<id>/films/*.film.json`은 `npm run films`로 리허설한다. 녹화 결과물(`out/`)은 커밋하지 않는다.
- 검증 규칙: 유효한 기준 팩 하나(`tests/fixtures/base`)를 두고, 규칙마다 그 팩을 메모리에서 일부만 바꾼 변형으로 기대하는 오류 코드를 단언한다. 팩 전체를 복사한 픽스처 폴더는 만들지 않는다.
- 문서(`docs/`) 문구를 테스트로 단언하지 않는다.
- 데모 팩(`packs/demo`)은 새 게임이 복사해 시작하는 예시다. 테스트용 장치를 넣지 않는다.
