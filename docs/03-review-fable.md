# 02-architecture.md 검토 결과 (Fable)

- 검토일: 2026-10-02
- 검토 모델: Claude Fable 5.1 (읽기 전용)
- 중점: 여러 게임 개발·장기 유지보수 구조, Codex에 넘길 명세로서의 완성도

## 총평

- 게임 하나짜리 MVP 설계로는 앞뒤가 맞는다. 그러나 "엔진 1개 + 게임 N개를 수년간 유지"하려면 네 가지가 필요한데 사실상 없다.
  - 엔진·팩·세이브의 버전 호환 정책
  - 팩 쪽에서 기능을 확장할 지점
  - 세이브 마이그레이션
  - 모든 팩에 대한 회귀 검증
- §1 "엔진은 팩을 모른다"와 §3.6 "커맨드 추가 = 엔진 폴더와 스키마 수정"이 서로 충돌한다. 두 번째 게임이 고유 기능을 요구하는 순간 엔진에 게임 코드가 쌓이거나 포크가 생긴다.
- Codex 명세로 보면 인터프리터 동시성, 트리거, 이동 충돌, transfer 이후 흐름 같은 런타임 의미가 산문 수준에 머문다. 구현자가 임의로 결정할 지점이 많다. `selfFlags`처럼 정의 없이 등장하는 용어도 있다.
- 지금 구조적으로 바꿔야 할 것 하나: 시뮬레이션(update)과 렌더/DOM을 분리해 Node에서 헤드리스로 돌릴 수 있게 해야 한다. 이것 없이는 여러 게임의 회귀 검증이 성립하지 않는다.

## 발견 사항

| 심각도 | 영역 | 문제 | 제안 |
|---|---|---|---|
| 높음 | 확장성 §1, §3.6, §6(M6) | 게임 고유 기능(미니게임, 커스텀 커맨드, UI)이 들어갈 자리가 없다. §3.6은 커맨드 추가를 엔진 수정으로 정의해서, 게임별 커맨드가 엔진에 쌓이거나 포크가 생긴다. | 팩 로컬 플러그인을 둔다. `game.json.plugins: ["plugins/fishing.js"]`로 등록하고, 각 모듈은 `export function register(api)` 안에서 `api.commands.register(name, handler, argsSchema)`, `api.conditions.register`, `api.hooks.on('mapEnter'\|'update'\|'renderUI')`, `api.scenes.push()`(미니게임)을 쓴다. 팩 커맨드 이름에는 `x_` 접두사를 강제하고, 커맨드를 등록할 때 스키마 조각도 함께 등록해 validate-pack이 검증하게 한다. `engine/api/`를 유일한 공개 진입점으로 두고 semver로 관리하며, 플러그인이 엔진 내부를 import하면 lint로 막는다. M6 완료 기준을 "엔진 코어 수정 없이"로 고친다. |
| 높음 | 버전 정책 §3.1, §4.2 | `formatVersion` 정수 하나에 "불일치 시 거부" 규칙이면, 엔진이 포맷을 올리는 순간 출시된 모든 팩과 세이브가 거부된다. 엔진 버전(코드), 포맷 버전(데이터), 세이브 버전이 구분되지 않는다. | 셋을 분리한다: 엔진은 semver, `formatVersion`은 정수, `saveVersion`도 정수. formatVersion을 올리는 커밋에는 반드시 `tools/migrate-pack.mjs N→N+1`을 함께 넣고, CI가 모든 팩에 마이그레이션과 검증을 실행한다. 엔진은 현재 버전 N만 지원하면 된다(여러 버전 범위를 지원할 필요 없음). 커맨드 추가나 버그 수정으로는 formatVersion을 올리지 않는다. |
| 높음 | 회귀 검증 §6, §4.1 | "렌더링은 직접 플레이로 확인"은 게임이 3개만 돼도 불가능하다. 또 §4.1에서 Interpreter가 MessageWindow/ChoiceWindow에 직접 의존해서 Node에서 실행할 수 없다. | 설계 요구사항으로 명시한다. DOM/Canvas 접근은 `render/`, `ui/`, `platform/`에서만 허용하고, Interpreter와 MapScene은 `ctx.ui`(text/choice 인터페이스)와 주입된 `Input`만 쓴다. 팩마다 `tests/*.scenario.json`(입력 시퀀스와 상태 단언)을 두고 `node --test`로 헤드리스 실행한다. CI는 모든 팩 검증 + 모든 팩 시나리오 실행. |
| 높음 | 세이브 호환 §4.2 | 출시한 게임을 패치하면(맵 수정, 플래그 추가·삭제, 마커 이동) 기존 세이브가 깨진다. 로드할 때의 병합 규칙이 없다. | 로드는 `initialState` 기본값 위에 세이브 값을 덮어쓰는 방식으로 한다. 새로 생긴 플래그는 기본값을 쓰고, 삭제된 플래그는 경고 후 버린다. 저장된 맵이 없어졌으면 `start` 위치로 돌려보낸다. 세이브에 `gameVersion`을 기록하고, 게임별 보정은 플러그인 훅 `onLoadSave(save, fromVersion)`으로 처리한다. "이벤트 실행 중에는 저장 불가"도 명시한다. |
| 높음 | 레포 구조 §2 | 단일 레포 자체는 혼자 개발하기에 적합하다. 하지만 "게임 A 핫픽스와 엔진 리팩터링이 동시에 진행되는" 상황의 정책이 없고, 에셋 바이너리 때문에 레포가 커진다. | 아래 권장안 참고 (모노레포 + evergreen + 게임별 태그). |
| 높음 | 명세 §4.1, §4.2 | `selfFlags`가 GameState와 세이브에 등장하지만 정의, 커맨드, 조건식이 없다. | RPG Maker의 셀프 스위치로 정의한다. 키는 `<map>:<eventId>:<name>`, 조건은 `{ "self": "opened", "is": true }`, 커맨드는 `set_self_flag`. 이벤트 로컬이라 사전 선언이 필요 없는지도 명시한다. |
| 높음 | 명세 §4.2 동시성 | 다음이 정해져 있지 않다. (a) 메인 실행 중 set_flag 때문에 다른 auto 페이지가 활성화되면 언제 시작하나 (b) parallel이 `text`/`transfer`/`lock_player`를 써도 되나 (c) 실행 중인 이벤트의 페이지가 재계산되면 실행이 중단되나 (d) parallel에 대기 커맨드가 없으면 한 틱에 몇 번 도나 | (a) 메인이 끝난 뒤 다음 틱의 트리거 검사에서 시작하고, 후보가 여럿이면 이벤트 배열 순서를 따른다. (b) parallel에서는 `text/choice/transfer/lock_player`를 금지하고 검증기가 오류로 잡는다. (c) 실행 중인 인터프리터는 시작 시점의 commands 스냅샷을 끝까지 실행한다. 페이지 변경은 외형과 이후 트리거에만 반영한다. (d) 틱당 1회 실행. |
| 중간 | 명세 §3.4 트리거 | touch가 진입 시 1회인지 머무는 동안 반복인지, transfer로 도착한 칸이 touch면 즉시 발동하는지, `through:false`인 touch(부딪힘)도 발동하는지 정해져 있지 않다. action도 발밑(`through`) 이벤트가 대상인지, 후보가 둘일 때 우선순위가 무엇인지 없다. | touch는 이동이 끝난 틱에 1회 발동한다. transfer 직후에는 발동하지 않는다(떠났다가 돌아와야 함). `through:false`는 이동을 시도할 때 발동한다. action은 정면 칸 → 발밑 칸 순으로 찾고, 같은 칸에 여러 개면 배열의 첫 번째를 쓴다. |
| 중간 | 명세 §3.6, §4.2 move/transfer | move 경로가 막혔을 때의 처리(건너뜀/대기/중단), `wait`의 기본값, 이동한 이벤트의 위치가 페이지 재계산·맵 재진입·세이브에서 어떻게 되는지가 없다. transfer 뒤에 남은 커맨드가 새 맵에서 계속 실행되는지도 없다(컷신에 필수). | 막히면 그 토큰을 건너뛰고 계속 진행한다. `wait` 기본값은 false. 이벤트 위치는 맵에 다시 들어올 때 정의값으로 초기화하고 세이브하지 않는다. transfer 뒤 남은 커맨드는 새 맵 로드가 끝난 뒤 메인 인터프리터에서만 계속 실행한다. `fade` 기본값은 true. |
| 중간 | 설계 §4.2 | async/await 인터프리터는 Promise가 마이크로태스크로 해결돼서 고정 60Hz 틱과 어긋난다. `AbortSignal`로 취소해도 await 중인 핸들러는 다음 await까지 진행된다. 리플레이 재현과 헤드리스 테스트가 어려워진다. | 제너레이터(코루틴) 기반으로 바꾼다. `interpreter.update()`가 틱마다 `next()`를 호출하고, 핸들러는 `function*(args, ctx)` 형태로 `yield ctx.waitFrames(n)` / `yield ctx.waitUntil(fn)`으로 대기한다. 취소는 `return()`. 결정론적이고 저장 가능한 시점을 판단하기도 쉽다. |
| 중간 | 설계 §4.3 | 다른 맵은 transfer 시점에 지연 로드하면서, 런타임에 마커와 맵 참조의 무결성을 검사하겠다고 한다. 서로 모순이다. | 시작할 때 모든 `*.events.json`(크기가 작음)을 읽고 `.tmj`와 이미지만 지연 로드한다. 또는 런타임 검증은 현재 맵 내부로 한정하고, 맵 사이의 참조 검증은 오프라인 도구에서만 한다고 명시한다. |
| 중간 | 공유 콘텐츠 §2, §3.7, §3.8 | 여러 게임이 공통 스킨, 폰트, 공통 이벤트를 쓰는 방법이 없다. 복사하면 수정할 때 N번 고쳐야 한다. | `packs/_shared/<lib>/` 라이브러리 팩을 두고 `game.json.include: ["_shared/ui-pixel"]`로 가져온다. characters, common-events, skin은 얕게 병합하되 팩 쪽이 우선한다. 경로는 `@ui-pixel/...` 접두사로 쓰고 build.mjs가 해석해 복사한다. MVP는 "복사" 정책으로 시작해도 되지만 그 선택을 문서에 기록한다. |
| 중간 | 빌드/배포 §5 | dist에 버전 표시, 캐시 무효화, base path가 없다. GitHub Pages에서 `engine/main.js`가 캐시되면 구버전 엔진과 신버전 팩이 섞일 수 있다. | `build-info.json`(gameVersion, engineVersion, 커밋, 빌드 시각)을 생성하고 오류 화면에 표시한다. 파일명 해시나 `?v=`로 캐시를 무효화한다. `--base` 옵션을 추가하고, dist에서는 `?pack=` 대신 팩을 고정한다. 릴리스 태그는 `<game>/v1.2.0` 형식. |
| 중간 | 범위 §1, §4.2 | 세이브 기능은 있는데 플레이어가 저장·로드할 수단(메뉴, 타이틀, 커맨드)이 범위에 없다. `bgm` 필드는 있는데 사운드 커맨드가 없다. 세이브 키에 쓸 `packId`가 game.json에 없다. | `save`/`load` 커맨드를 둘지, "메뉴 키 = 자동 저장"으로 할지 정한다. `bgm` 필드는 제거하거나 `play_bgm`을 범위에 넣는다. game.json에 `id`와 `version`을 추가한다. |
| 낮음 | 명세 §3.6 세부 | `choice.when`이 숨김인지 비활성인지, `cancel`의 의미, 공통 이벤트 안에서 `stop`을 호출했을 때의 범위, `call` 재귀 깊이, `text`의 줄바꿈·제어문자(`\v[gold]`) 지원 여부, `set_var.value`가 리터럴만 되는지, `wait.frames`의 단위가 정해져 있지 않다. | 각각 한 줄로 확정한다. 제어문자는 "MVP 미지원, `{var}` 치환은 v2"처럼 명시해서 Codex가 임의로 넣지 않게 한다. |
| 낮음 | 명세 §3.3, §4.2 | Tiled 마커 좌표 변환(픽셀→타일, point 객체만인지), 맵 ID의 정본이 `.events.json`의 `"map"` 필드인지 파일명인지, 입력 키 매핑, `screen.scale`이 고정인지 창에 맞춘 정수배인지, 백그라운드 탭에서 돌아왔을 때 누적된 dt 처리가 없다. | 맵 ID는 파일명(확장자 제외)으로 하고 `map` 필드는 제거한다. 마커는 point 객체만 쓰고 `floor(x/tileSize)`로 변환한다. 키는 화살표/WASD 이동, Z/Enter/Space 확인, X/Esc 취소. dt는 최대 0.25초로 자른다. |
| 낮음 | 검증기 §3.4 | auto 무한루프 경고가 `transfer`나 `call`로 끝나는 auto 페이지를 잘못 잡는다. | 종료 조건에 `transfer`, `stop`, 호출된 공통 이벤트 안의 set_flag도 포함한다. |
| 낮음 | 스택 §7 | 팩 스크립트에 플러그인 API를 공개하고 수년간 유지하려면, API 계약을 타입으로 정의해 두는 것이 가장 확실한 보호 장치다. Codex도 TS에서 더 일관되게 구현한다. | TypeScript + Vite를 권장한다. "빌드 없이 실행"은 `vite dev`로 대신하고, build.mjs는 Vite 설정으로 흡수한다. 팩 플러그인은 JS로 쓰되 `engine-api.d.ts`로 검사한다. |

## 다중 게임 운영 구조 권장안

```
rpg-engine/                       # 레포 1개 (모노레포, evergreen 정책)
├── engine/                       # package.json version = semver
│   └── api/index.(js|ts)         # 플러그인에 공개하는 유일한 진입점 (+ .d.ts)
├── schemas/
├── tools/   validate-pack · migrate-pack · build · run-scenarios
├── packs/
│   ├── _shared/ui-pixel/         # 라이브러리 팩 (include 대상, 단독 실행 불가)
│   ├── game-a/
│   │   ├── game.json             # id, version, formatVersion, include[], plugins[]
│   │   ├── plugins/*.js          # x_ 접두사 커맨드·훅·미니게임 씬
│   │   └── tests/*.scenario.json # 헤드리스 리플레이
│   └── game-b/
└── dist/<game>/                  # gitignore, build-info.json 포함
```

- **Evergreen**: `main`에서는 모든 팩이 항상 최신 엔진으로 통과해야 한다. CI는 모든 팩 검증 + 시나리오 실행. 엔진 변경은 모든 팩이 통과할 때만 머지하고, 큰 리팩터링은 브랜치에서 한다. 출시한 게임의 핫픽스는 `main`에 커밋한 뒤 해당 게임만 빌드한다.
- **예외 경로**: 엔진 HEAD가 불안정한데 급한 핫픽스가 필요하면, 마지막 태그(예: `game-a/v1.3.0`)에서 `release/game-a-1.x` 브랜치를 만들어 체리픽한다. 평소에는 쓰지 않는다.
- **버전 3종**: 엔진은 semver(코드), formatVersion은 정수(올릴 때 마이그레이션 스크립트 필수), saveVersion은 정수(로드할 때 기본값과 병합).
- **확장**: 플러그인 `register(api)` 모델. 엔진 내부 import 금지, `x_` 접두사, 스키마 조각 등록. API가 바뀌면 엔진 major 버전을 올린다.
- **대안 비교**
  - 게임별 레포 + npm 패키지 엔진: 독립 릴리스는 확실하지만, 엔진을 고칠 때마다 N개 레포를 갱신하고 import map이나 빌드가 필요해 혼자 운영하기엔 과하다.
  - git 서브모듈: 운영 비용이 크다.
  - npm workspaces: 브라우저에서 ESM을 직접 실행하는 방식과 맞지 않아, TS+Vite를 택할 때만 의미가 있다.
  - 에셋이 커지면 png/woff2에 git LFS를 쓴다.

## Codex에 넘기기 전 문서에 추가할 항목

1. `selfFlags` 정의 (키 형식, 조건식, 커맨드, 세이브 포함 여부)
2. 인터프리터 동시성 규칙(위 표의 a~d)과 코루틴/async 중 무엇을 쓸지
3. 트리거별 발동 조건 표 (touch의 진입/도착/부딪힘, action의 정면/발밑, 우선순위, 같은 틱에 후보가 여럿일 때)
4. move 충돌 처리, 이벤트 위치 유지 여부, transfer 이후 남은 커맨드 실행 규칙, 맵 로드 실패 시 동작
5. 커맨드별 필드 기본값과 경계 조건 (`choice.when`, `cancel`, `stop` 범위, `call` 깊이 제한, `set_var` 리터럴 한정, 텍스트 제어문자 미지원 선언)
6. 입력 키 매핑, dt 클램프, `screen.scale` 정책, 화면이 맵보다 클 때의 카메라 처리
7. 헤드리스 경계: DOM/Canvas 접근이 허용되는 모듈 목록과 `ctx.ui`/`Input` 인터페이스 시그니처
8. 플러그인 API 명세 (`register(api)`의 메서드 목록, 훅 이름, 커맨드 등록 시 스키마 조각 형식, `x_` 규칙)
9. 버전 정책(엔진 semver / formatVersion / saveVersion)과 `migrate-pack.mjs`의 입출력 계약
10. 세이브 로드 병합 규칙, 저장할 수 없는 시점, 플레이어의 저장·로드 수단
11. `game.json`에 `id`, `version`, `include`, `plugins` 필드 추가. `.events.json`의 `map` 필드는 제거하거나 정본을 명시. `bgm` 필드 처리
12. 시나리오 테스트 파일 형식(입력 시퀀스와 단언 스키마)과 CI 흐름 (모든 팩 검증 → 시나리오 → 빌드)
13. build.mjs 출력 규격 (`build-info.json`, 캐시 무효화, base path, 팩 고정)
14. 공유 라이브러리 팩의 병합 규칙, 또는 "MVP는 복사" 결정
15. 스택 결정(TS+Vite 권장)과 그에 맞춰 §1 "빌드 없이" 원칙 수정
