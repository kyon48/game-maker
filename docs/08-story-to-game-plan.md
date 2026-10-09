# 스토리 → 게임 → 영상 자동화 계획 (S 트랙)

- 작성일: 2026-10-09
- 상태: **계획 초안**. 확정 후 단계마다 Codex 프롬프트로 넘긴다
- 선행 문서: [02-architecture.md](02-architecture.md)(엔진), [04-video-pipeline.md](04-video-pipeline.md)(V 트랙), [06-game-features.md](06-game-features.md)(G 트랙), [07-narration-style.md](07-narration-style.md)(나레이션)
- 답하려는 질문: "표정 시트와 게임 분석이 있으니 게임 구성은 갖춰진 건가? 플롯을 쓰면 어떻게 게임이 되나? 자동화할 수 있으면 도구를 만들자."

---

## 1. 현재 준비 상태 진단

**짧은 답: 아니다.** "스토리를 쓰면 → 인물이 표정 그림과 함께 말하는 게임이 돌고 → 그걸 녹화한 영상이 나온다"까지 가려면 아래 빈칸 네 개가 남아 있다. 표정 시트(64종 PNG)는 **그림 파일이 준비된 것**이지 엔진이 그릴 수 있는 상태가 아니다. 지금 엔진의 메시지 창은 화자 이름과 글자만 그린다.

| 필요 | 상태 | 근거 | 닫는 단계 |
|---|---|---|---|
| 맵·이동·대화·선택지·플래그·컷신·세이브 | **있음** | M1~M8, manor 팩 18개 시나리오 통과 | — |
| 배회 NPC·맵 이름 띠·저장 재부팅 테스트 | **있음** | G0 (엔진 0.5.0) | — |
| 촬영 대본 자동 플레이 → 무음 mp4·SRT·챕터 | **있음** | V1, `npm run film -- manor truth` | — |
| 대화 중 인물 얼굴(표정) 표시 | **없음**. `text`에 얼굴 필드가 없고 `portraits.json`도 없음 | 명세 §6 `text`는 `text`, `speaker`만 | **V3a**(§5) |
| 스탠딩(전신) 일러스트·배경 CG | **없음**. 에셋도 1080p용으로는 저해상도(스탠딩 161×221) | 04 §6, 에셋 README | V3b |
| 나레이션 음성·대사 TTS·오디오 합성 | **없음**. `narrate` 단계·`voices.json`·`npm run tts` 미구현 | 04 §5, 07 §7 | V2 |
| 대사 안 변수 치환(`{var:…}`), 글자 속도·색 | **없음**. 명세 §6에서 "구현하지 말 것" | 06 §4 | G1 |
| 결말·결과 화면(씬), 메뉴, 전투, 사운드 | **없음** | 06 §5~§8 | G3·G2·G4·G5 |
| **스토리 → 팩 데이터·촬영 대본 변환 도구** | **없음**. 지금은 events.json·film.json을 사람이 손으로 씀 | manor는 전부 수기 | **S1~S3**(이 문서) |
| 표정 에셋 → 팩 연결(복사·fallback·표정 이름 검증) | **없음** | 에셋 README "V3에서 연결" | S3 |

참고 게임 분석(hp4-report)은 **구조 참고**로만 쓴다. 거기서 얻은 것은 "장면 단위 = 맵 + 그 맵의 이벤트 + 공통 이벤트", "대화 1,468블록 중 스토리는 771블록", "action 트리거가 압도적" 같은 규모 감각이고, 에셋·대사·스크립트는 가져오지 않는다.

## 2. 스토리 → 게임 변환 파이프라인

### 2.1 전체 흐름

```mermaid
flowchart LR
  plot["플롯·시놉시스<br/>(사람)"] -->|GPT 초안| story["story.md<br/>스토리 스크립트"]
  story -->|story lint| story
  story -->|story compile| pack["팩 데이터<br/>game.json state·events·common·maps(.tmj)·portraits"]
  story -->|story film| film["films/*.film.json<br/>+ narration"]
  pack -->|validate·scenarios| ok1[검증]
  film -->|films(리허설)| ok2[검증]
  ok1 --> rec["npm run film → mp4"]
  ok2 --> rec
  art["표정 에셋<br/>(Plush characters/)"] -->|story art| pack
```

핵심 결정 세 가지.

1. **중간 형식은 사람이 쓰는 텍스트 한 파일**(`packs/<id>/story/<name>.story.md`)이다. 팩 JSON은 생성물이다. 사람과 GPT는 story.md만 고친다.
2. **컴파일러는 결정론적 코드**다(`tools/story/`). LLM은 story.md 초안을 쓰는 데만 쓰고, 그 결과는 반드시 `story lint` → `compile` → `validate` → `scenarios` → `films`를 통과해야 한다. LLM 출력이 검증 없이 팩에 들어가는 경로는 없다.
3. **story.md 하나에서 팩과 촬영 대본을 함께 만든다.** 장면을 쓴 순서가 곧 플레이 순서이자 촬영 순서다. 나레이션(`>` 줄)은 팩이 아니라 film 층으로 간다(07 §7).

### 2.2 맵: ASCII 레이아웃으로 뼈대 생성, Tiled는 손질용

| 선택지 | 판단 |
|---|---|
| Tiled로 전부 수작업 | 맵 8~10개를 매번 그리는 것이 한 편 제작에서 가장 큰 수작업. 영상의 가치는 맵 그림이 아니라 나레이션·인물·대사에 있다 |
| 절차적 맵 생성기 | 과설계. 결과를 사람이 통제하기 어렵고, 이벤트 위치가 매번 바뀌면 촬영 대본이 흔들린다 |
| **ASCII 레이아웃 → .tmj 뼈대 생성 (채택)** | story.md 안에 `#`(벽) `.`(바닥) 글자 격자로 방을 그리고, 앵커 글자로 이벤트·문·시작 위치를 찍는다. 컴파일러가 floor/collision/markers 레이어가 든 `.tmj`를 만든다. 사람과 GPT 모두 쓸 수 있고 diff가 읽힌다 |

- 타일셋은 지금 manor처럼 생성 타일(`npm run tiles`) 또는 팩이 가진 타일셋의 **역할표**(`story/tiles.json`: `wall`, `floor`, `door` → GID)를 쓴다.
- `.tmj`는 **없을 때만** 생성한다. Tiled로 손질한 뒤에는 컴파일러가 건드리지 않는다. 앵커 좌표만 `markers` 레이어와 대조해 어긋나면 오류(사람이 앵커를 옮겼으면 story.md의 레이아웃도 고쳐야 한다). `--force-maps`로 재생성.
- 이벤트 좌표는 story.md에 숫자로 쓰지 않는다. 앵커 이름으로만 가리키고 컴파일러가 좌표를 넣는다.

### 2.3 스토리 스크립트 형식 (`.story.md`)

줄 단위 DSL이다. YAML은 들여쓰기·따옴표 실수가 잦고 긴 대사에 불리해서 채택하지 않았다. 문법은 아래가 전부이고, DSL에 없는 것은 `@cmd {JSON}` 한 줄로 엔진 커맨드를 그대로 넣는다(탈출구). 문법을 늘리기보다 `@cmd`로 해결한다.

| 줄 | 의미 |
|---|---|
| `@pack id "제목"` `@player id` `@screen 480x270` | 팩 헤더 |
| `@character id "표시 이름" art=<에셋 폴더> voice=<voices.json 키>` | 인물. `art`는 표정 에셋의 캐릭터 폴더 ID(§5) |
| `@flag name` `@var name 0` | 상태 선언 → `game.json.state` |
| `@location id "이름"` + `@layout … @end` + `@anchor 글자 = 이름 [-> 맵:앵커]` | 장소와 레이아웃. `->`가 있으면 문(touch transfer + 양쪽 marker) |
| `## 장 제목` | 챕터 → film `chapter`, 유튜브 챕터 |
| `### 장면 제목 @ location` | 장면. 이 장면의 이벤트는 그 맵에 놓인다 |
| `> 문장` | 나레이션(film 층). 기본은 진행을 막지 않음. `@waitNarration`으로 대기 |
| `@event id at 앵커 [trigger=action\|auto\|touch] [once] [character=id] [wander=…]` … `@end` | 이벤트. `once`면 셀프 플래그로 1회 실행 후 두 번째 페이지(`@page`가 없으면 `trigger=none`) |
| `@page when=<조건>` | 같은 이벤트의 다음 페이지. 조건은 `flag`, `!flag`, `var>=3`, `all(...)`, `any(...)` |
| `이름(표정): 대사` | `text`. 이름은 `@character`의 표시 이름. 표정은 key·영문·한글·핵심 별칭 모두 허용(§5). 표정 생략 가능 |
| `: 대사` | 화자 없는 지문 |
| `? 질문` + `* 선택지` / `*> 선택지`(촬영 시 고르는 것) + 들여쓴 하위 줄 | `choice`. 옵션은 최대 6개(엔진 제약) |
| `@set flag` `@unset flag` `@add var 1` `@sub var 1` | 상태 변경 |
| `@if 조건` … `@else` … `@end` | 분기 |
| `@go 맵:앵커 [dir]` `@move 대상 up,up,wait:30` `@face 대상 player` `@fade black 30` `@wait 60` `@shake` | 연출 |
| `@common id` … `@end` / `@call id` | 공통 이벤트 |
| `@film pause 1.5` `@film walkTo 앵커` | 촬영 전용 힌트(팩에는 안 들어감) |
| `@cmd {"cmd":"show_map_name"}` | 엔진 커맨드 직접 삽입 |

### 2.4 예시: story.md 일부 → 생성물

```
@pack lantern "등대지기의 약속"
@player sora
@character sora "소라" art=base voice=sora
@character elder "촌장" art=base voice=elder
@flag met_elder
@var trust 0

@location pier "선착장"
@layout
############
#..........#
#...e......x
#.s........#
############
@end
@anchor s = start
@anchor e = elder_spot
@anchor x = to_tower -> tower:w

## 1장. 꺼진 불빛
### 촌장을 만나다 @ pier
> 안개 낀 선착장. 소라는 등대의 불이 꺼진 이유를 아는 단 한 사람을 찾고 있었습니다.
@event elder at elder_spot trigger=action character=elder
  촌장(의심): 등대 열쇠를 찾는다고? 자네가?
  소라(결의): 불을 다시 켜야 합니다.
  ? 뭐라고 답할까
    *> 사정을 말한다
      @set met_elder
      @add trust 1
      촌장(부드러운 미소): 그렇다면 도와주지.
    * 돌아선다
      촌장(시큰둥): 마음대로 하게.
@page when=met_elder
  촌장(무표정): 열쇠는 탑 안에 있네.
@end
```

생성되는 `maps/pier.events.json`(발췌). 표정 필드는 V3a 이후에만 쓰고, 그 전에는 경고와 함께 생략한다.

```json
{ "id": "elder", "x": 4, "y": 2, "pages": [
  { "trigger": "action", "character": "elder", "commands": [
      { "cmd": "face", "target": "this", "dir": "player" },
      { "cmd": "text", "speaker": "촌장", "text": "등대 열쇠를 찾는다고? 자네가?", "portrait": "elder", "expression": "suspicious" },
      { "cmd": "text", "speaker": "소라", "text": "불을 다시 켜야 합니다.", "portrait": "sora", "expression": "determined" },
      { "cmd": "choice", "prompt": "뭐라고 답할까", "options": [
        { "label": "사정을 말한다", "commands": [
          { "cmd": "set_flag", "flag": "met_elder", "value": true },
          { "cmd": "set_var", "var": "trust", "op": "add", "value": 1 },
          { "cmd": "text", "speaker": "촌장", "text": "그렇다면 도와주지.", "portrait": "elder", "expression": "soft_smile" } ] },
        { "label": "돌아선다", "commands": [
          { "cmd": "text", "speaker": "촌장", "text": "마음대로 하게.", "portrait": "elder", "expression": "unimpressed" } ] } ] } ] },
  { "when": { "flag": "met_elder", "is": true }, "trigger": "action", "character": "elder", "commands": [
      { "cmd": "face", "target": "this", "dir": "player" },
      { "cmd": "text", "speaker": "촌장", "text": "열쇠는 탑 안에 있네.", "portrait": "elder", "expression": "neutral" } ] } ] }
```

함께 생성되는 것: `game.json`의 `maps`·`start`·`state`·`mapNames`, `pier.tmj`(floor·collision·markers `start`/`to_tower`/`w`), `to_tower` touch 이벤트, `films/main.film.json`:

```json
{ "chapter": "1장. 꺼진 불빛" },
{ "narrate": "안개 낀 선착장. 소라는 …" },
{ "walkTo": { "event": "elder" } }, { "pause": 0.35 }, { "press": "ok" },
{ "advanceText": "voice" }, { "choose": 0, "dwell": 0.4 }, { "advanceText": "voice" }, { "settle": true },
{ "expect": { "flag": "met_elder", "is": true } }
```

`narrate`·`advanceText: "voice"`는 V2 이후다. 그 전에는 `advanceText: "auto"`로 내고 나레이션은 `films/main.narration.md`로만 뽑는다. `*>`가 없는 선택지는 첫 번째 옵션을 고른다. 장면이 끝날 때 그 장면에서 `@set`한 플래그를 `expect`로 자동 확인한다.

### 2.5 자동과 수동의 경계

| 자동(코드) | 사람 또는 GPT가 정함 |
|---|---|
| 좌표, 마커, 문 이벤트, 페이지 조건, 셀프 플래그, `face player`, 상태 선언, 챕터·walkTo·expect, 표정 key 해석과 에셋 복사, 나레이션 분리 | 무엇을 어느 장면에 넣을지, 방 모양(ASCII), 대사와 표정 선택, 촬영에서 고를 선택지(`*>`), 인물↔에셋 폴더 대응, 타일 역할표, CREDITS |

## 3. 자동화 도구 목록

모두 `tools/story/` 아래 Node CLI이며 `npm run story -- <하위 명령> <packId> [옵션]`으로 부른다. `engine/`은 건드리지 않는다(AGENTS 규칙 8).

| 명령 | 입력 | 출력 | 검증·실패 |
|---|---|---|---|
| `story lint` | `story/*.story.md` | 진단 목록(파일:줄, 코드) | 문법 오류, 미선언 플래그·인물·앵커, 모르는 표정 이름, 선택지 7개 이상, 레이아웃 폭 불일치, 앵커 중복, 도달 불가 장소, 챕터 제목 중복. 종료 코드 1 |
| `story compile` | story.md, `story/tiles.json`, 기존 `.tmj` | `game.json`(state·maps·start·mapNames 갱신), `maps/*.events.json`, `common-events.json`, 없는 `.tmj`, `story/.compiled.json`(생성 파일 해시) | lint 통과 후 실행. 마지막 컴파일 이후 **손으로 고친 생성 파일**이 있으면 중단(`--force`로 덮어씀). 끝나면 `validate`를 호출 |
| `story film` | story.md | `films/<name>.film.json`, `films/<name>.narration.md`, `tests/story_<name>.scenario.json`(촬영 경로 전체) | 끝나면 `films`(리허설)와 `scenarios` 호출 |
| `story art` | story.md의 `@character art=…`, 에셋 루트(`--art-root`, 기본은 `story/story.config.json`) | `assets/portraits/<char>/<expr>.png`(**쓰인 표정만** 복사), `portraits.json` | fallback 체인으로도 못 찾는 표정은 오류. CREDITS.md에 에셋 출처 항목이 없으면 경고 |
| `story build` | 위 전부 | — | `lint → compile → art → film → validate → scenarios → films` 한 번에 |
| 기존 `film`, `tts`(V2) | 생성물 | mp4, 음성 | 변경 없음 |

LLM이 끼는 지점은 두 곳이고 둘 다 **파일을 입력받아 파일을 내는** 방식이다.

| 작업 | 입력 | 출력 | 그다음 |
|---|---|---|---|
| 플롯 → story.md 초안 | 시놉시스·장 구성표·인물표·이 문서 §2.3 문법·07 작법 | story.md | `story lint`. 오류를 LLM에 되돌려 고치게 한다 |
| 표정 배정 | 표정이 빈 story.md + `expressions.json`의 ko 목록 | 같은 파일에 `(표정)`만 채운 것 | `story lint`가 이름을 검증 |
| 나레이션 초안 | 장면 목록(07 §6 프롬프트) | `>` 줄로 story.md에 붙임 | 문장 길이(90자) 경고를 lint가 낸다 |

Codex에게 story.md를 직접 쓰게 해도 된다. 어느 쪽이든 검증 명령이 심판이다.

#### 3.1 초안은 단계로 나눠 만든다

"플롯 → story.md"를 한 번에 시키지 않는다. 참고한 AI 비주얼노벨 생성기(vina-ai/vina, 2023)처럼 단계마다 **JSON으로 형식을 고정**하고, 사람이 각 단계 결과를 확인·수정한 뒤 다음 단계에 넣는다. 한 번에 시키면 형식 오류와 설정 붕괴가 섞여서 어디를 고칠지 알기 어렵다.

| 단계 | 입력 | 출력(JSON) | 사람이 볼 것 |
|---|---|---|---|
| 1 줄거리 | 기획 메모, 원작 범위 | `synopsis`, `chapters[]`(제목·요약·결말 갈림) | 분량(첫 영상 8~10분), 결말 수 |
| 2 인물표 | 1 | `characters[]`(id·표시 이름·성격·말투·에셋 폴더·목소리) | 말투가 서로 구별되는가 |
| 3 장소표 | 1 | `locations[]`(id·이름·묘사·시간대·분위기 `mood`·주요 사물) | 장소 수(맵 5개 안팎) |
| 4 장면 목록 | 1~3 | `scenes[]`(장·제목·장소·등장인물·목적·선택지와 플래그·`mood`) | 플래그 흐름, 촬영할 선택(`*>`) |
| 5 장면별 대본 | 2~4 + §2.3 문법 + 07 작법 | 장면 하나의 story.md 조각 | `story lint` 통과까지 오류를 되돌려 고침 |

- 레이아웃(ASCII)은 3단계 결과를 보고 사람이 그리거나 5단계와 별도로 요청한다. 대사 생성과 섞지 않는다.
- 5단계는 장면 하나씩 요청하고, 직전 장면의 마지막 몇 줄을 함께 넣어 이어지게 한다.
- **초안 단계의 표정은 핵심 8종(`expressions.json`의 `core`)만 쓰게 한다.** 64종을 다 주면 고르는 일 자체가 품질을 떨어뜨린다. 세분은 사람이 다듬을 때 또는 별도 "표정 배정" 단계에서 64종 ko 목록으로 한다.
- `mood`(calm, tense, sad, bright, mystery, warm 등 짧은 목록)는 지금은 기록만 한다. G5(사운드)에서 장면 BGM 선택 문법으로 연결한다.
- 프롬프트 템플릿: `docs/prompts/story-draft.md`.
- 가져오지 않는 것: 음악을 외부 영상에서 무작위로 받아 쓰는 방식(저작권), "실존 인물을 닮게" 하는 그림 지시(초상권), 무작위 시드(재현 불가).

## 4. 캐릭터 이미지 연결

### 4.1 표정 이름

- 정본은 에셋의 `expressions.json`(64종 `key`, `en`, `ko`, 핵심 8종 `core` 별칭). 팩에는 `portraits.json`에 **key만** 남긴다.
- story.md에서는 `촌장(의심)`, `촌장(suspicious)`, `촌장(surprised)`(core → `startled`) 모두 허용. 한글 이름 64개는 서로 다르므로 모호성이 없다. 컴파일러가 key로 정규화한다.
- 표정을 생략하면 이전 줄의 같은 화자 표정을 잇고, 장면 첫 줄이면 `neutral`.
- 인물은 `@character … art=<폴더>`로 에셋 캐릭터 폴더에 대응한다. 그 폴더의 `character.json`에 없는 표정은 `fallback` 체인(의상 캐릭터 → `base`)을 따라 찾는다. 지금은 `base`만 있으므로 모든 인물이 같은 얼굴이다. 의상 캐릭터는 에셋 README 절차로 추가한다.

### 4.2 해상도: 지금은 얼굴 칸, 전신은 나중에

| 용도 | 필요 크기(1080p 기준) | 에셋 | 판단 |
|---|---|---|---|
| 메시지 창 얼굴 칸 | 약 220×240px | portrait 185×191 | **지금 쓸 수 있다.** 1.2배 확대는 눈에 띄지 않는다 |
| 스탠딩(전신) | 높이 500~700px | standing 161×221 | 3배 확대라 뭉개진다. 최종 영상에는 쓰지 않는다 |

따라서 V3를 둘로 나눈다. **V3a는 메시지 창 얼굴 칸**(지금 에셋으로 가능), **V3b는 스탠딩·배경 CG**(05 바이블 규격 1024×1024로 다시 생성한 뒤). 첫 영상은 V3a까지만 쓴다.

### 4.3 V3a에서 엔진에 들어가는 것

- `portraits.json`(선택 파일): `{ "<characterId>": { "<expressionKey>": "assets/portraits/elder/suspicious.png" } }`. 검증기 V3·V4로 참조와 파일 존재 확인.
- `text`의 선택 필드 `portrait`(캐릭터 ID), `expression`(key). 둘 다 있을 때만 얼굴 칸을 그린다. formatVersion은 올리지 않는다(명세 §13.2).
- 그리기: 얼굴은 **HD 레이어**(04 §6.1)에 그린다. 480×270 픽셀 레이어에 넣으면 56×64로 줄였다가 4배로 키우게 되어 표정 차이가 사라진다. HD 레이어는 화면 크기의 두 번째 캔버스이고, V3a에서는 얼굴 칸만 그린다(글자·창은 아직 픽셀 레이어). 녹화는 두 캔버스를 합성한 1080p 프레임을 캡처한다. 전송량이 16배가 되지만 오프라인 작업이라 허용한다. 대안으로 검토한 "ffmpeg overlay로 후합성"은 플레이어가 보는 화면과 영상이 달라지므로 채택하지 않는다.
- 메시지 창 배치: 얼굴 칸은 창 왼쪽, 본문 폭은 그만큼 줄어든다. sim의 줄바꿈 폭이 바뀌므로 `MessageState`가 얼굴 유무를 알아야 한다(상태만, 그리기 없음).
- 헤드리스(시나리오·리허설)에서는 얼굴을 그리지 않고 상태만 유지한다. 결정론에 영향 없음.

## 5. 로드맵 재정렬

기존: `G0(완료) → G1 → V2 → G3 → G2 → V3+G5 → G4 → V4`

사용자의 당면 목표는 "스토리 한 편을 영상으로"다. 이 목표에 **G3·G2(씬·메뉴)는 필요 없고, V3 전체도 필요 없다.** 반면 스토리 컴파일러와 얼굴 표시는 순서에 없었다. 재정렬한다.

**새 순서**: `S1 → G1 → V2 → S2 → V3a → S3 → [첫 영상] → G3 → G2 → V3b+G5 → G4 → V4`

| 변경 | 이유 |
|---|---|
| S1(스토리 컴파일러)을 맨 앞에 | 엔진 변경이 없어 지금 바로 가능하고, 이게 생기면 **사용자는 story.md 작성을, Codex는 V2를 병행**할 수 있다. 가장 큰 병목(수기 events.json)을 먼저 없앤다 |
| G1은 V2 앞에 유지 | 06의 근거 그대로: TTS 캐시 키는 치환이 끝난 문장이어야 한다. 한 프롬프트 분량이라 미루는 이익이 없다 |
| V3를 V3a(얼굴 칸)와 V3b(스탠딩·배경·공유 팩)로 분리, V3a를 앞으로 | 사용자가 원하는 "말할 때 얼굴이 나온다"는 V3a로 충족된다. V3b는 고해상도 에셋이 먼저 필요해 지금은 막혀 있다 |
| G3·G2를 첫 영상 뒤로 | 첫 영상에 결과 화면·메뉴가 없어도 된다. 결말은 지금처럼 대사·페이드로 처리한다 |
| V4(콘텐츠 파이프라인)는 S 트랙이 대체 | 04 §7의 1~5단계가 S1~S3와 같다. V4는 "검수 문서·운영 절차"로 축소한다 |

**첫 영상 마일스톤 정의**: 다음을 모두 만족하는 10분 안팎 영상 한 편.

1. story.md 한 파일에서 `story build`로 팩·촬영 대본·나레이션이 생성되고 `npm run check`를 통과한다.
2. 나레이터 음성과 인물 대사 음성이 들어 있다(V2). 자막 SRT·챕터 파일이 나온다(V1).
3. 대사마다 화자의 표정 얼굴이 메시지 창에 나온다(V3a). 표정은 story.md에서 고른 것이다.
4. 스탠딩·배경 CG·BGM·메뉴·전투 없음. 맵은 ASCII 뼈대 + 생성 타일.
5. 같은 입력으로 두 번 녹화한 프레임 해시가 같다(`film:verify`).

## 6. 단계별 작업 정의

각 Codex 단계는 프롬프트 하나, `feature/<단계>` 브랜치, `npm run check` 통과, 엔진 변경이 있으면 minor 버전 증가. S 단계는 `tools/story/`와 테스트만 바꾸고 `engine/`을 건드리지 않는다.

| 단계 | 담당 | 범위 | 완료 기준 |
|---|---|---|---|
| **S1a** 파서·lint | Codex | `.story.md` 파서(줄 번호 보존), §2.3 문법, `story lint`, 단위 테스트(문법별 오류 코드) | 예시 story(§2.4를 확장한 3장면)가 lint 통과. 깨뜨린 변형 10종이 각각 지정 코드로 실패 |
| **S1b** 팩 컴파일 | Codex | `story compile`: game.json state·maps·start·mapNames, events·common 생성, ASCII → `.tmj`(floor·collision·markers), 문 이벤트, `once` 셀프 플래그, `.compiled.json` 소유권 검사, 끝에 validate 호출 | 새 예시 팩 `packs/lantern`(장소 3, 장면 5, 결말 2)이 story.md만으로 생성되어 `validate` 통과. 같은 입력 두 번 컴파일 시 바이트 동일 |
| **S1c** 촬영 대본·시나리오 생성 | Codex | `story film`: chapter·walkTo·press·advanceText(auto)·choose(`*>`)·settle·expect, `narration.md` 추출, 전체 경로 scenario | lantern이 `films --all`·`scenarios --all` 통과, `npm run film -- lantern main`으로 무음 mp4 생성 |
| **G1** 텍스트 치환 | Codex | 06 §4 그대로 | 06 §9 기준 |
| **V2a** TTS·길이 동기화 | Codex | voices.json, `tts` 도구와 제공자 1개, 매니페스트, sim 음성 길이표·자동 진행, `advanceText: "voice"` | 대사 음성이 든 mp4. 대사 하나 고치면 그 줄만 재생성 |
| **V2b** 나레이션·합성 | Codex | film `narrate`/`waitNarration`/`music`, 오디오 합성·덕킹·LUFS | 나레이션+대사 음성이 든 mp4, SRT에 나레이션 포함 |
| **S2** 나레이션 연결 | Codex | `story film`이 `>` 줄을 `narrate`로, `@waitNarration`을, `advanceText: "voice"`를 내도록 | lantern 영상에 나레이션이 흐름 |
| **V3a** 얼굴 칸 | Codex | §4.3: `portraits.json` 스키마·검증, `text.portrait/expression`, MessageState 폭 반영, HD 레이어와 얼굴 그리기, 녹화 1080p 합성 캡처 | lantern 대화에 표정 얼굴 표시. `film:verify` 통과. 헤드리스 시나리오 결과 불변 |
| **S3** 표정·에셋 연결 | Codex | `story art`: 표정 이름 정규화(key·en·ko·core), fallback 체인, 쓰인 표정만 복사, `portraits.json` 생성, 컴파일러가 `portrait/expression` 필드 출력 | lantern이 base 에셋으로 얼굴을 바꿔 가며 대화. 모르는 표정 이름은 lint 오류 |
| **첫 영상 제작** | 사용자+GPT | 비공개 팩의 story.md 작성(§7 IP), 표정 배정, 나레이션, `story build` → `tts` → `film` | §5 마일스톤 5개 항목 |
| 이후 G3 → G2 → V3b+G5 → G4 → V4 | — | 기존 설계. V3b 전에 05 바이블 규격의 고해상도 표정 세트를 생성한다(사용자) | 06·04 기준 |

사용자·GPT가 S1 동안 미리 할 수 있는 것: 시놉시스와 장 구성표 확정, 인물표(표시 이름·에셋 폴더·목소리), 장소 목록과 ASCII 레이아웃 초안, 타일 역할표. 이 넷이 있으면 S1b가 끝나는 날 바로 팩이 나온다.

## 7. 위험과 결정 필요 항목

| 항목 | 내용 | 권장 |
|---|---|---|
| **IP** | 원작 IP가 들어간 패러디 팩·스토리는 공개 레포에 두지 않는다 | 비공개 레포(예: 형제 디렉터리 `game-packs-private/`)에 팩을 두고 `packs/<id>` 심볼릭 링크로 연결, `.gitignore`에 그 링크 추가. 엔진·도구·예시 팩(lantern)만 공개 레포. `check --all`은 링크된 팩도 검사하므로 로컬에서는 같이 검증된다 |
| 표정 에셋 출처 | 에셋 생성 방법·라이선스가 README에 없다 | 팩 CREDITS.md에 기록할 수 있는 수준으로 출처(생성 도구·프롬프트·권리)를 정리한다. 수익화 전에 확인 |
| 얼굴 칸 해상도 | portrait 185×191을 1.2배 → 허용. 이후 스탠딩은 재생성 필요 | V3b 전에 05 §2 규격으로 핵심 8종 먼저 생성해 겹치기/통짜 결정 |
| HD 레이어 캡처 비용 | 1080p 프레임 전송으로 녹화 시간 증가 | 30fps 기본 유지, `--chapter` 부분 렌더링으로 반복 작업 |
| DSL 비대화 | 장면마다 "이것도 문법에" 요구가 생긴다 | 문법 추가 대신 `@cmd` 탈출구. 같은 `@cmd`가 세 번 반복되면 그때 문법으로 승격 |
| 생성 파일 손편집 | events.json을 직접 고치면 다음 컴파일에 사라진다 | `.compiled.json` 해시로 감지해 중단. 손편집이 필요하면 story.md에 `@cmd`로 쓴다. `.tmj`만 예외(손질 허용) |
| 촬영 경로 결정론 | `wander` NPC가 길을 막으면 walkTo가 실패할 수 있다 | 리허설이 잡는다. 촬영 경로에 걸리는 NPC는 `wander` 범위를 레이아웃에서 떨어뜨린다 |
| 선택지 6개·텍스트 길이 | 엔진 제약 | lint가 막는다. 긴 대사는 lint가 `\n`·분할을 경고 |
| TTS 제공자·비용·약관 | 04 §9 미결 | V2a 전에 같은 대사 10줄로 2곳 비교해 결정 |
| 나레이션 대사 비율 | 07 §4 밀도(분당 120~170자) | `story film`이 narration.md에 분당 글자 수·무나레이션 비율 추정치를 적어 준다(영상 길이는 리허설 틱으로 계산) |
| 맵의 단조로움 | ASCII 뼈대 + 단색 타일은 밋밋하다 | 첫 영상은 감수한다. 영상 가치는 나레이션·표정에 둔다. 이후 Tiled 손질 또는 타일셋 교체 |
| 결정 1 | 예시 팩 이름·소재(공개 레포, 저작권 소멸 소재 또는 창작) | `lantern`(등대지기, 창작) 권장 |
| 결정 2 | 표정 생략 시 기본값 | 직전 같은 화자 표정 → 없으면 `neutral` |
| 결정 3 | V3a 얼굴 칸 위치·크기 | 창 왼쪽, 창 높이에 맞춤. skin.json에 `portrait: { width }` 선택 필드 |
| 결정 4 | S1a~S1c를 프롬프트 세 개로 나눌지 두 개로 합칠지 | 세 개. 각각 테스트가 독립적이고 리뷰가 짧다 |

## 8. 엔진 명세와의 관계

- 명세 P1~P6은 그대로다. S 트랙은 `tools/story/`에만 있고 `engine/`을 import하되 반대 방향은 없다.
- 엔진에 들어가는 변경은 V3a의 `portraits.json`·`text` 선택 필드·HD 레이어뿐이며 formatVersion·API_VERSION·saveVersion은 유지한다.
- V3a 확정 후 `portraits.json`과 `text` 필드는 02 명세에 정식 절로 옮기고, 04 §6은 V3b 범위로 고쳐 쓴다. 06 §2의 권장 순서도 §5의 새 순서로 갱신한다.
