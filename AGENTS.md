# AGENTS.md

데이터 구동형 2D RPG 엔진. 엔진 하나로 여러 게임(팩)을 만들고 유지보수한다.

## 기준 문서

- **명세: `docs/02-architecture.md`** — 구현의 유일한 기준. 이 파일과 충돌하면 명세가 이긴다.
- 배경: `docs/01-source-verification.md`, `docs/03-review-fable.md` (읽기만, 구현 기준 아님)

## 작업 방식

- 명세 §15의 단계(M1~M8)를 **순서대로** 진행한다. 한 번에 한 단계만 한다.
- 단계가 끝나면 `npm run check`가 통과해야 한다. 실패를 테스트 skip이나 규칙 완화로 넘기지 않는다.
- 명세에 없거나 모호한 부분을 결정해야 하면 가장 단순한 쪽으로 구현하고, `docs/decisions.md`에 `날짜 / 단계 / 결정 / 이유` 한 줄로 기록한다. 명세와 다르게 구현해야 하면 먼저 기록하고 이유를 남긴다.
- 명세에 "MVP 밖" 또는 "구현하지 말 것"으로 표시된 것은 만들지 않는다.

## 절대 규칙

1. `engine/sim`, `engine/data`, `engine/api`, `packs/*/plugins`에서 DOM·Canvas·`window`·`document`·`localStorage`를 쓰지 않는다. (명세 §4.2)
2. 시뮬레이션에서 `Math.random`, `Date.now`, `performance.now`를 직접 호출하지 않는다. (P4)
3. `engine/` 아래에 특정 팩의 ID·문자열·경로를 넣지 않는다. 사용자에게 보이는 문구는 팩 데이터(`labels`, 이벤트)에서 온다. (P1)
4. 플러그인은 `@engine/api`와 `@sinclair/typebox`만 import한다.
5. 내장 커맨드는 1파일 1커맨드로 `engine/sim/commands/`에 두고, 플러그인과 같은 `CommandRegistry.register()`로 등록한다.
6. 팩 JSON 포맷을 바꾸는 변경은 명세 §13.3(마이그레이션 동반) 없이는 하지 않는다.
7. 런타임 의존성은 TypeBox 하나다. 다른 라이브러리를 추가해야 하면 `docs/decisions.md`에 근거를 남긴다.

## 명령

```
npm run dev                      # http://localhost:5173/?pack=demo
npm run check                    # typecheck → lint → test → schemas → validate --all → scenarios --all → build:all
npm run validate -- <packId>
npm run scenarios -- <packId>
npm run build -- <packId>
```

## 테스트

- 엔진 로직: `tests/` (Vitest). 버그를 고치면 재현 테스트를 먼저 추가한다.
- 게임 동작: `packs/<id>/tests/*.scenario.json` (명세 §12). 새 커맨드나 트리거 동작을 추가하면 데모 팩에 시나리오를 추가한다.
- 검증 규칙: 규칙마다 일부러 깨뜨린 팩 픽스처를 `tests/fixtures/`에 두고, 기대하는 오류 코드를 단언한다.
