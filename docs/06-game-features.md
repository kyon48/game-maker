# 게임 요소 확장 설계 (G 트랙)

- 작성일: 2026-10-08
- 상태: **설계 초안**. 단계(G0~G5)마다 확정 후 Codex 프롬프트로 넘긴다
- 선행 문서: [02-architecture.md](02-architecture.md)(엔진 명세), [04-video-pipeline.md](04-video-pipeline.md)(V 트랙), `m8-gaps.md`(M8에서 확인한 제약)

---

## 1. 목표

엔진은 M8까지로 **쯔꾸르식 탐색 RPG의 뼈대**(맵·NPC·대화·선택지·플래그·컷신·세이브·플러그인)를 갖췄다. 영상 콘텐츠가 비주얼노벨 연출에만 머물지 않고 **실제로 돌아가는 게임 요소**를 쓸 수 있게 확장한다.

| 영상에서 쓰는 예 | 필요한 요소 |
|---|---|
| 오만과 편견: 엘리자베스와 다아시의 말싸움을 턴제 "논쟁 배틀"로 | 전투(G4) |
| 페스트: 전염 확산을 막는 퍼즐 | 플러그인 씬(G3) |
| 작품 해설 포인트를 단서처럼 모으는 수첩 | 인벤토리·메뉴(G2) |
| "단서 3/5", 이름·숫자가 들어가는 대사 | 텍스트 치환(G1) |
| 배회하다 말을 거는 NPC, 방 이름 표시, 결말 화면 | M8 제약 해소(G0, G3) |

**원칙**: 명세 P1~P6은 그대로다. 특히 새 요소도 **sim에서 상태를 만들고 platform은 그리기만** 한다. 그래야 헤드리스 테스트와 V 트랙의 녹화(프레임 단위 재현)가 계속 성립한다.

## 2. 단계와 순서

| 단계 | 내용 | 포맷 영향 |
|---|---|---|
| G0 | M8 제약 해소: 자율 이동 경로, 맵 이름 표시, 시나리오의 저장·재부팅 단계 | 선택 필드 추가 |
| G1 | 텍스트 치환·제어문자 | 없음(텍스트 해석만 확장) |
| G3 | 플러그인 씬 API와 기본 씬(결말·결과 화면) | API 추가(하위 호환) |
| G2 | 아이템·인벤토리·메뉴(단서 수첩) | 새 선택 파일, **saveVersion 2** |
| G4 | 데이터 구동 턴제 전투 | 새 선택 파일 |
| G5 | 사운드(BGM·효과음) | 새 선택 파일. V3와 공유 |

**V 트랙과 섞은 권장 순서**: V1(녹화) → G0 → G1 → V2(TTS) → G3 → G2 → V3(비주얼노벨 표현)+G5 → G4 → V4(콘텐츠)

- **V1을 가장 먼저 하는 이유**: 새 엔진 기능 없이 바로 가능하다. 녹화가 되면 이후 G 단계의 결과를 매번 영상으로 확인할 수 있다.
- **G1을 V2 앞에 두는 이유**: TTS에 넘길 문자열은 치환이 끝나고 제어문자를 걷어 낸 문장이어야 한다. 텍스트 규칙이 먼저 정해져야 음성 캐시 키(04 §5.1)가 안정된다.
- **G3를 G2·G4 앞에 두는 이유**: 메뉴와 전투 모두 "맵이 아닌 별도 화면"이라 씬 API 위에 올린다.

`formatVersion`은 이 문서의 모든 단계에서 **1을 유지**한다. 커맨드·선택 필드·선택 파일 추가는 명세 §13.2상 포맷 변경이 아니다. 세이브 형식은 G2에서 한 번 바뀐다.

## 3. G0: M8 제약 해소

### 3.1 자율 이동 경로 (배회하면서 말 걸 수 있는 NPC)

M8에서 막힌 점: 한 페이지에 트리거가 하나뿐이라 parallel(배회)과 action(대화)을 함께 지정할 수 없었다.

- 페이지 선택 필드 `wander`를 추가한다. 형식은 `move.route`와 같은 토큰 배열이고, 끝나면 처음부터 반복한다.

```json
{ "character": "gardener", "trigger": "action", "wander": ["left", "wait:60", "right", "wait:60"],
  "commands": [ { "cmd": "face", "target": "this", "dir": "player" }, { "cmd": "text", "speaker": "무진", "text": "…" } ] }
```

- **정지 규칙**: 메인 인터프리터가 실행 중이면 모든 이벤트의 `wander`는 진행 중인 한 칸만 마치고 멈춘다. 끝나면 이어서 진행한다.
- **우선순위**: `move` 커맨드가 경로를 주면 그 경로를 따르고, 그 경로가 끝나야 `wander`로 돌아간다.
- `wander`는 parallel 인터프리터가 아니므로 parallel 금지 커맨드 규칙(V7)과 상관없다.

### 3.2 맵 이름 표시

- `game.json`에 선택 필드 `mapNames: { "<맵ID>": "서재" }`를 추가한다.
- 맵에 들어올 때 화면 위쪽에 이름 띠를 90틱 동안 표시하고, 마지막 20틱 동안 서서히 사라진다. 이름이 없는 맵은 표시하지 않는다.
- 새 커맨드 `show_map_name`(인자 없음)로 다시 띄울 수 있다. 띠는 skin을 따른다.
- 문마다 붙는 표지판은 지원하지 않는다. 표지판은 이벤트(그래픽 + action 대사)로 만든다.

### 3.3 시나리오 러너 확장

- 단계 `reload: true`를 추가한다. 마지막 save 데이터로 §11.3 불러오기 절차를 거쳐 게임을 새로 만들고 "이어하기"로 시작한다. 저장한 적이 없으면 실패한다.
- 단계 `expectSave: { ...조건식 }`를 추가한다. 마지막 save 데이터에 대해 조건을 평가한다.
- Node 시나리오의 save 포트는 마지막 저장 데이터를 메모리에 보관한다.

## 4. G1: 텍스트 치환·제어문자

명세 §6에서 "MVP 밖"으로 둔 기능이다. 문법은 하나로 통일한다: `{종류:값}`

| 문법 | 의미 |
|---|---|
| `{var:gold}` | 변수 값 |
| `{plugin:x_clue_count}` | 플러그인이 등록한 텍스트 함수의 결과(§4.1) |
| `{wait:30}` | 글자 표시를 30틱 멈춤 |
| `{color:accent}` | 이후 글자 색. 이름은 skin의 `colors`에서. `{color}`로 원래 색 복귀 |
| `{speed:2}` | 이후 글자 표시 속도 배율 |
| `{{`, `}}` | 중괄호 글자 자체 |

- 해석은 메시지를 열 때 한 번만 한다(sim). 변수 값은 그 시점 값으로 고정된다.
- 검증기: 모르는 종류, 선언되지 않은 변수, 등록되지 않은 플러그인 텍스트 함수, 닫히지 않은 괄호는 V1/V3 오류로 잡는다.
- **TTS용 문장**: 치환을 마치고 `wait`·`color`·`speed`를 걷어 낸 문자열을 따로 만든다. 음성 캐시 키는 이 문자열로 만든다(04 §5.1). 변수가 들어간 대사는 값마다 음성이 따로 생성된다는 점을 문서화한다.

### 4.1 플러그인 텍스트 함수 (API 추가)

```ts
api.text.register('x_clue_count', { args: Type.Object({}), format(args, state) { return String(count(state)); } });
```

M8의 manor는 단서 개수를 보여 주려고 `showText`를 플러그인에서 직접 조립했다. 이 함수가 생기면 대사는 팩 데이터에 그대로 두고 숫자만 플러그인에서 가져올 수 있다.

## 5. G3: 플러그인 씬 API

### 5.1 개념

**씬**은 맵 대신 화면 전체를 차지하는 독립 화면이다. 예: 결말 화면, 메뉴, 퍼즐, 전투.

- 씬은 스택으로 쌓인다. 씬이 열려 있는 동안 맵 시뮬레이션(이동·parallel·wander)은 멈춘다.
- 씬은 **결과값 하나**를 남기고 닫힌다. 열었던 커맨드가 그 값을 변수에 넣는다.

```json
{ "cmd": "scene", "name": "x_plague_puzzle", "args": { "level": 2 }, "resultVar": "puzzle_result" }
```

### 5.2 헤드리스를 지키는 구조

씬이 캔버스에 직접 그리면 sim 원칙(명세 P3)이 깨지고 녹화도 재현되지 않는다. 그래서 씬은 **그릴 내용을 데이터로 돌려준다**.

```ts
interface SceneDefinition<A, S> {
  args: TSchema;
  init(args: A, ctx: SceneContext): S;                   // 상태 생성
  update(state: S, input: InputFrame, ctx: SceneContext): S | { done: number }; // 매 틱. done이면 닫힘
  view(state: S): DrawList;                              // 매 프레임. 순수 함수
}
type DrawCommand =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { kind: 'image'; asset: string; x: number; y: number; frame?: number }
  | { kind: 'text'; x: number; y: number; text: string; color?: string; align?: 'left' | 'center' }
  | { kind: 'window'; x: number; y: number; w: number; h: number };
```

- 좌표계는 `game.json.screen`이다. `image.asset`은 팩 상대경로이고 검증기가 V4로 확인한다.
- platform 렌더러가 `DrawList`를 그린다. 플러그인은 여전히 `@engine/api`와 typebox만 import한다.
- 씬의 `ctx`는 `GameStateAccess`, `showText`처럼 쓸 수 있는 메시지 창, `rng`(시드 고정 난수)를 제공한다. `rng`가 없으면 퍼즐·전투가 결정론을 지킬 수 없다.
- `api.scenes.register(name, definition)` — `x_` 접두사. API v1에 대한 하위 호환 추가다(명세 §9.2).

### 5.3 기본 씬: 결말 화면

엔진 내장 씬 `ending`을 제공한다(M8의 "결말 후 결과 화면" 제약 해소).

```json
{ "cmd": "scene", "name": "ending", "args": { "title": "공개 결말", "lines": ["…"], "image": "assets/endings/open.png" } }
```

결과: `0` = 처음부터, `1` = 마지막 세이브에서 이어하기. platform이 처리한다.

## 6. G2: 아이템·인벤토리·메뉴

### 6.1 데이터

`items.json` (선택 파일)

```json
{
  "letter": { "name": "찢어진 편지", "description": "…", "icon": "assets/items/letter.png", "category": "clue" },
  "key":    { "name": "서재 열쇠",   "description": "…", "category": "item" }
}
```

- `category`: `item` 또는 `clue`. 메뉴에서 탭을 나누는 데만 쓴다.
- 상태: 아이템별 정수 개수. 0이면 없는 것으로 친다.

### 6.2 커맨드와 조건

| 커맨드·조건 | 의미 |
|---|---|
| `give_item {item, count=1}` | 획득. 획득 알림 표시 여부는 `notify`(기본 true) |
| `take_item {item, count=1}` | 소모. 모자라면 0으로(오류 아님) |
| 조건 `{ "item": "key", "op": ">=", "value": 1 }` | 개수 비교 |
| 조건 `{ "itemCount": "clue", "op": ">=", "value": 3 }` | 카테고리 합계. M8의 단서 합산 플러그인이 하던 일을 데이터로 |
| `{var:...}`와 같은 문법의 `{item:key}` | G1 텍스트에서 개수 표시 |

### 6.3 메뉴

- `cancel` 키로 메뉴 씬(G3 기본 씬 `menu`)을 연다. 메인 인터프리터가 실행 중이거나 창이 열려 있으면 열리지 않는다.
- 탭: 아이템 / 단서 / 닫기. 항목을 고르면 설명을 보여 준다. **아이템 "사용"은 1차 범위에서 제외**하고, 사용은 이벤트의 조건으로 처리한다(열쇠를 가지고 문에 말을 걸면 열림).
- 메뉴 문구(탭 이름 등)는 `game.json.labels`에 추가한다(명세 P1).

### 6.4 세이브

`SaveData`에 `items: Record<string, number>`를 추가하고 **saveVersion을 2로** 올린다. 마이그레이션 1→2는 `items: {}`를 넣는 것이다(명세 §11.3, M6의 실행기 사용). 불러오기 3단계에 "items.json에 있는 아이템만" 규칙을 추가한다.

## 7. G4: 턴제 전투

### 7.1 범위

목적은 **연출용 짧은 전투**다(논쟁 배틀, 보스 한 판). 성장·장비·경험치는 범위 밖이다.

- 아군 1~3명 대 적 1~3명. 턴 순서는 `speed` 내림차순, 같으면 아군 먼저, 그다음 배열 순서.
- 행동: 기술 사용 / 방어. 기술 효과는 `damage`, `heal`, `buff`(한 능력치 배율, 턴 수) 세 가지.
- 피해 공식은 하나로 고정한다: `max(1, power + atk - def)`. 변동치는 `rng`로 ±10%, 끌 수 있다.
- 적 행동: 기술 목록과 가중치에서 `rng`로 고른다. 대본처럼 "3턴째에 이 기술"을 지정할 수 있는 `script` 필드도 둔다. 영상 연출에서는 전투가 **정해진 대로** 흘러가야 하기 때문이다.

### 7.2 데이터 (`battle.json`, 선택 파일)

```json
{
  "labels": { "hp": "설득력", "attack": "반박", "defend": "침묵" },
  "actors":  { "elizabeth": { "name": "엘리자베스", "hp": 30, "atk": 6, "def": 3, "speed": 5, "skills": ["wit", "irony"] } },
  "enemies": { "darcy": { "name": "다아시", "hp": 40, "atk": 5, "def": 5, "speed": 4, "skills": ["pride"], "script": { "3": "pride" } } },
  "skills":  { "wit": { "name": "재치", "effect": "damage", "power": 4, "text": "{user}의 재치 있는 한마디!" } },
  "troops":  { "ball_argument": { "enemies": ["darcy"], "background": "assets/battle/ballroom.png", "canLose": true } }
}
```

- `labels` 덕분에 같은 전투 시스템을 "논쟁", "추리 대결", 일반 전투로 바꿔 보여 줄 수 있다.
- 커맨드: `{ "cmd": "battle", "troop": "ball_argument", "resultVar": "argument_result" }` → 0 승리, 1 패배, 2 도주.
- 전투 화면은 G3 내장 씬 `battle`이다. 스탠딩(V3)이 있으면 전투 화면에 그대로 쓴다.

### 7.3 촬영과의 관계

촬영 대본(04 §4.3)에서 전투 입력도 `choose` 단계로 기술한다. 적 `script`와 고정 `rng` 시드로 전투 결과가 대본대로 재현된다. 리허설에서 `expect: { var: argument_result, op: "==", value: 0 }`으로 확인한다.

## 8. G5: 사운드

V3의 `bgm`/`sfx` 커맨드와 같은 것이다(04 §6). 여기서는 일반 플레이 쪽 요구만 덧붙인다.

- `audio.json`: `{ "<id>": { "file": "assets/audio/x.ogg", "volume": 0.8, "loop": true } }`
- platform이 Web Audio로 재생한다. 브라우저 자동 재생 제한 때문에 부팅 선택지에서 첫 입력을 받은 뒤 오디오를 시작한다.
- 녹화 모드에서는 재생하지 않고 타임라인에만 기록한다(04 §5.4에서 합성).
- 세이브에 현재 BGM ID를 넣을지는 G5에서 정한다(넣으면 saveVersion 3).

## 9. 단계별 완료 기준

| 단계 | 완료 기준 |
|---|---|
| G0 | manor의 정원사가 배회하면서 대화 가능. 방 이름 띠 표시. `reload` 시나리오로 저장→재부팅→이어하기를 JSON만으로 검증 |
| G1 | manor 수첩 대사가 `{plugin:x_clue_count}`로 바뀌고 플러그인의 showText 조립 코드가 사라짐. 잘못된 치환식은 검증 오류 |
| G3 | 결말이 `ending` 씬으로 표시. 예시 플러그인 씬 1개(간단한 퍼즐)가 시나리오에서 동작하고, 같은 입력으로 두 번 돌린 결과가 같음 |
| G2 | manor 단서가 아이템(`clue`)으로 바뀌고 메뉴에서 열람. `itemCount` 조건으로 결말 분기. saveVersion 1 세이브가 2로 이전돼 이어하기 성공 |
| G4 | 데모 또는 새 팩에 논쟁 배틀 1개. 대본 고정 전투가 시나리오에서 승리·패배 각각 재현 |
| G5 | BGM과 효과음 재생, 녹화 모드에서는 타임라인 기록만 |

각 단계는 지금처럼 `main`에서 새로 만든 `feature/g<n>` 브랜치로 진행하고, 리뷰한 뒤 머지한다. 단계마다 **엔진 minor 버전**을 올린다.

## 10. 결정 필요

| 항목 | 권장 |
|---|---|
| G4 전투의 기본 연출 | 프론트뷰(적만 보이고 아군은 상태 창). 화면 구성이 단순하고, 마스코트 스탠딩을 적 자리에 그대로 쓸 수 있음 |
| 메뉴 키 | `cancel`(X/Esc). 필드에서 cancel은 지금 쓰이지 않음 |
| 아이템 "사용" | 1차 제외(§6.3). 필요해지면 G2 후속으로 |
| 텍스트 치환이 들어간 대사의 TTS | 값이 적은 경우만 허용하고, 값이 계속 바뀌는 숫자는 자막으로만 보여 주는 규칙 검토 |
