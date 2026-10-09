# 스토리 파서·lint·팩 컴파일 (S1a/S1b/S1c/S1d)

```sh
npm run story -- lint <packId>
```

현재 작업 디렉터리의 `packs/<packId>/story/*.story.md`를 파일명 순서로 읽는다.
파서와 lint는 팩이나 생성물을 쓰지 않는다. compile/check는 아래에 설명하며, film/build는 마지막 절에 설명하며 art는 S3 단계다.
오류가 있으면 종료 코드 1, 경고만 있거나 진단이 없으면 0이다.
`npm run check`는 story check --all을 포함한다. 파서·CLI·컴파일 단위 테스트도 check에 포함된다.

출력은 `파일:줄 S번호 메시지`이며, 경고 메시지는 `경고:`로 시작한다.

```text
packs/lantern/story/main.story.md:58 S002 미선언 플래그: missing
packs/lantern/story/main.story.md:1 S015 경고: artRoot가 없어 표정 이름 검사를 건너뜁니다
```

## 문법과 AST

문법은 `docs/08-story-to-game-plan.md` §2.3을 따른다.
`parseStory(text, file)`는 `{story, diagnostics}`를 반환하고, AST의 헤더·레이아웃 행·앵커·챕터·장면·이벤트·페이지·선택지·명령에 `file`과 1부터 시작하는 `line`을 보관한다.
빈 줄, CRLF, UTF-8 BOM이 있어도 원본 줄 번호를 유지한다.

- 최상위 선언과 `##`, `###`, `@event`, `@common`, `@page`는 들여쓰지 않는다. 이벤트/페이지/공통 이벤트 본문은 그 헤더보다 깊게 들여쓴다.
- 각 블록의 형제 줄은 같은 들여쓰기 폭을 쓴다. 2칸·4칸 모두 가능하며, 탭은 오류다. 선택지 본문과 `@if` 본문은 다시 한 단계 깊게 쓴다.
- `@else`, `@end`는 자신이 닫는 블록 헤더와 같은 깊이다. 선택지는 다음 옵션 또는 바깥 줄에서 끝나며 별도 `@end`가 없다.
- `@page when=조건`은 이벤트 안에서만 가능하다. 기본 페이지와 같은 이벤트 속성을 이어받으며, 페이지 조건과 각 본문을 AST에 구분해 둔다. `once`는 AST 속성으로만 보관한다.
- 조건은 `flag`, `!flag`, `var>=3`, `all(...)`, `any(...)`. 비교 연산은 `==`, `!=`, `<`, `<=`, `>`, `>=`; 값은 안전 정수 리터럴이다. 중첩·공백·빈 `all()`/`any()`를 허용하며 `eval`하지 않는다.
- ID는 엔진과 같은 소문자 ID 형식이다. 따옴표 문자열은 JSON 문자열 이스케이프를 지원한다. 긴 대사에 따옴표는 필요 없으며, 첫 `:` 뒤를 대사로 보관한다.
- `@move`/`wander`는 쉼표로 나눈 사방 이동·`face:<dir>`·`wait:<양의 정수>` 토큰이다. `trigger` 기본값은 action, 지정 가능한 값은 action/auto/touch다.
- `@shake`와 `@waitNarration`은 인자가 없다. `@go`의 방향은 선택 사항이다. `@wait`/`@fade` 틱은 1 이상, 촬영 pause는 0 이상의 초다.
- `>`·`@film`·`@waitNarration`은 장면 또는 이벤트/공통 이벤트 본문에 둘 수 있다. 게임 명령·대사는 이벤트/공통 이벤트 본문에 둔다.
- `@cmd`는 한 줄의 JSON을 파싱해서 `value: unknown`으로 보관한다. 객체 여부·커맨드 이름·인자·참조의 내용 검증은 하지 않는다. S1b의 엔진 validate가 담당한다.
- `*>`는 선택지마다 최대 하나다. 지정하지 않은 경우 첫 옵션을 고른다는 규칙은 S1c가 처리한다.

선언은 같은 팩의 모든 입력 파일에 공유되며 전방 참조를 허용한다.
동일한 pack/player/screen 헤더의 반복은 허용하고, 값이 다르면 오류다.
인물 ID·표시 이름·플래그·변수·장소·공통 이벤트는 중복 불가다.
이벤트 ID는 맵 안에서 유일하며 챕터 제목은 팩 전체에서 유일하다.

## 레이아웃과 도달성

`@layout`부터 `@end`까지의 행은 공백도 셀로 보존한다.
`#`와 `.` 외에는 한 글자 앵커로 선언해야 하고, 앵커 문자는 해당 레이아웃에 정확히 한 번 있어야 한다.
행 폭과 나레이션 길이는 UTF-16 코드 유닛이 아닌 유니코드 코드 포인트로 센다.
앵커의 선언 이름과 한 글자 모두 참조 가능하지만, 서로 다른 앵커의 별칭이 겹치면 오류다.

도달성은 첫 장면의 장소(장면이 없으면 첫 장소)를 시작점으로 한다.
방향 있는 `->` 문과 이벤트에서 실행 가능한 `@go`/`@call` 연결을 탐색한다.
조건·선택지는 가능한 모든 분기로 보고, 호출하지 않은 공통 이벤트의 이동은 연결에 넣지 않는다.
맵 내부의 이동 가능 경로나 상태 조건의 실제 성립 여부는 실행하지 않는다.
`@cmd`는 불투명한 JSON이므로 내부 transfer도 연결로 추정하지 않는다. 문 또는 `@go`로 연결을 표현해야 lint에서 도달성을 판정할 수 있다.
공통 이벤트 재귀의 내용 검증(V8)은 S1b에 남기며, lint는 순환을 만나도 종료한다.

## 표정 매니페스트

```json
{ "artRoot": "../../../my-art/characters" }
```

위 설정은 `packs/<packId>/story/story.config.json`이다.
`artRoot`는 설정 파일 디렉터리를 기준으로 해석하며, 절대 경로도 허용한다.
해당 폴더의 `expressions.json`을 읽는다. 캐릭터 폴더의 파일/표정 fallback 검사는 S3 범위다.

```json
{
  "expressions": [
    { "key": "neutral", "en": "Neutral", "ko": "무표정" },
    { "key": "startled", "en": "Startled", "ko": "깜짝" }
  ],
  "core": { "neutral": "neutral", "surprised": "startled" }
}
```

key/en/ko/core 별칭 모두 허용하며, 앞뒤 공백과 영문 대소문자는 정규화한다.
`expressionAliases()`는 별칭→key 조회표를 제공한다. 다른 key를 가리키는 별칭 중복이나 존재하지 않는 core 대상은 설정 오류다.
artRoot가 없으면 표정 검사만 생략하고 팩당 경고 1회를 출력한다.
설정 파일이 깨졌거나 지정한 매니페스트를 읽을 수 없으면 S019 오류로 종료한다.

## 진단 코드

| 코드 | 수준 | 의미 |
|---|---|---|
| S001 | 오류 | 알 수 없는 문법, 인자/JSON/조건 형식, 들여쓰기·블록 종료·필수 헤더/레이아웃 오류 |
| S002 | 오류 | 미선언 플래그(변경·페이지/분기 조건) |
| S003 | 오류 | 미선언 변수(연산·조건) |
| S004 | 오류 | 미선언 플레이어/이벤트 인물/대사 화자 |
| S005 | 오류 | 이벤트·촬영·go의 미선언 앵커 |
| S006 | 오류 | 장면 또는 go의 미선언 장소 |
| S007 | 오류 | 매니페스트에 없는 표정 이름 |
| S008 | 오류 | 선택지 7개 이상 |
| S009 | 오류 | 레이아웃 행 폭 불일치 |
| S010 | 오류 | 앵커 문자 중복(선언 또는 셀) |
| S011 | 오류 | 문 `->`의 대상 장소/앵커 없음 |
| S012 | 오류 | 시작점의 명시적 문/go 연결에서 도달 불가인 장소 |
| S013 | 오류 | 챕터 제목 중복 |
| S014 | 경고 | 나레이션 한 줄 90자 초과 |
| S015 | 경고 | artRoot 없음으로 표정 이름 검사 생략(팩당 1회) |
| S016 | 오류 | 선언/맵 이벤트 ID 중복, 다른 헤더 값, 앵커 참조 모호성 |
| S017 | 오류 | 미선언 move/face 대상 이벤트 |
| S018 | 오류 | 미선언 공통 이벤트 |
| S019 | 오류 | 파일/설정/표정 매니페스트 읽기·형식 오류 또는 CLI 사용 오류 |
| S020 | 오류 | 미선언 레이아웃 문자 또는 선언한 앵커 문자 셀 없음 |

## 테스트

기준 예시는 `tests/fixtures/story/valid.story.md` 하나다.
문법별 오류는 이 문자열을 메모리에서 일부만 바꿔 코드·파일·줄·심각도를 검사한다.
CLI는 임시 팩에 동일한 기준 파일을 써서 종료 코드, 상대 경로, 설정·경고 처리를 확인하고 임시 디렉터리를 삭제한다.

```sh
npm test -- --run tests/story.test.ts tests/story-cli.test.ts
```

## 팩 컴파일와 생성물 확인

```sh
npm run story -- compile <packId>
npm run story -- compile <packId> --force
npm run story -- compile <packId> --force-maps
npm run story -- check <packId>
npm run story -- check --all
```

compile은 기존 lint를 통과한 뒤 모든 변환·앵커·소유권 검사를 메모리에서 마친다.
오류가 있으면 생성 파일을 쓰지 않는다. 생성 후에는 기존 validatePack/플러그인 로더를 실행하고 기존 validate CLI와 같은 진단·종료 코드로 보고한다.
엔진 validate 오류가 있으면 이미 쓴 생성물은 남아 있으므로 원고/입력을 고친 뒤 다시 컴파일한다.

필수 수기 입력은 game.json, characters.json, skin.json, CREDITS.md, 에셋, story/tiles.json이다.
game.json은 state/maps/start/mapNames **네 필드만** 갱신한다. 제목·플레이어·해상도·버전·labels 등은 기존 값을 보존한다.
@pack/@player/@screen 헤더를 바꿔도 그 메타데이터를 자동 변경하지 않는다.
시작 장소는 첫 장면(없으면 첫 장소), 시작 앵커는 그 장소의 start다. 방향은 기존 start.dir, 없으면 down이다.

타일 역할표 형식:

```json
{
  "wall": 7,
  "floor": 2,
  "door": 8,
  "tileset": "assets/tilesets/colors.tsj",
  "firstgid": 1
}
```

GID는 양의 정수이며 tileset은 팩 내부 .tsj 경로다. firstgid 기본값은 1.
외부 .tsj/이미지는 사람이 준비하고, 타일·에셋 참조의 최종 검증은 기존 검증기가 수행한다.
맵에는 floor·collision·markers를 만든다. #는 wall 그림+충돌, .와 일반 앵커는 floor, 문 앵커는 door 그림이다.
모든 선언 앵커의 정식 이름을 point marker로 기록한다. 문자 별칭으로 참조한 대상도 정식 이름으로 정규화한다.

이벤트·변환 규칙:

- 장소별 events.json에 그 맵의 모든 장면 이벤트를 원고 순서대로 배치한다. 좌표는 앵커에서 가져온다.
- action+character 페이지의 첫 커맨드는 face this → player다. 속성은 후속 page에도 이어진다.
- once는 예약 셀프 플래그 story_once를 사용한다. 첫 페이지는 self=false 조건, face 다음/본문 앞에 true 설정을 넣어 stop·transfer 뒤에도 재실행되지 않는다.
- 명시한 후속 @page는 self=true와 원고 조건의 all이다. 조건이 모두 거짓이면 이벤트는 비활성이다. @page가 없으면 self=true의 trigger=none 페이지를 덧붙인다.
- 그래픽 없는 이벤트와 touch 이벤트는 through=true; 그래픽 있는 action/auto는 through=false다.
- @move는 경로 완료까지 wait=true다. 비대기 이동은 @cmd로 지정할 수 있다.
- 선택지는 원고 options 전체와 cancel=null을 만든다. *>는 팩 명령에 넣지 않으며 S1c가 촬영 선택에 사용한다.
- @go는 정식 marker 이름의 transfer다. 문은 앵커 이름 ID의 through=true touch transfer 이벤트다. 다른 이벤트 ID와 충돌하면 오류다.
- @common/@call과 @if/all/any/비교 조건은 기존 엔진 데이터로 변환한다. @cmd JSON은 그대로 넣고 기존 validate가 내용 검증한다.
- 표정이 있으면 S028 경고 팩당 1회, portrait/expression 필드는 생략한다. normalizeExpression(name, aliases)는 key/en/ko/core 별칭을 key로 반환하는 순수 함수이며 이후 V3a/S3에서 사용할 수 있다.
- 나레이션, @waitNarration, @film은 팩에서 생략한다. S1c/S2에서 film으로 연결한다.

생성 목록은 game.json, common-events.json, maps/<location>.events.json, 최초/강제 생성 maps/<location>.tmj, story/.compiled.json이다.
파일은 JSON 2칸 들여쓰기·LF·마지막 줄끝으로 쓰며 생성 시각·난수·절대 경로를 기록하지 않는다.

### Tiled 손질과 소유권

기존 .tmj는 **한 바이트도 덮어쓰지 않는다**. 정식 이름의 marker가 정확히 하나 있고 원고와 같은 타일 좌표인지 확인한다(좌표의 타일 내 픽셀 오프셋은 허용).
추가 marker/레이어/시각적 손질은 기존 검증기의 맵 규칙을 만족하는 한 가능하다.
--force는 일반 생성 파일만 덮어쓰며 앵커 불일치를 무시하지 않는다. --force-maps는 맵을 다시 만든다. 필요하면 둘을 함께 쓴다.

.compiled.json은 version/files/maps로 경로·SHA-256을 기록한다.
files는 game.json 전체·common-events.json·events.json의 해시 보호 대상이다. game의 수기 메타데이터를 고친 뒤에도 --force로 재컴파일해야 한다(수기 필드의 새 값은 보존).
maps는 최초/재생성 당시 해시만 기록하며 손질 검사의 비교 대상은 아니다. 맵을 보존하면 기존 기록도 유지한다.
소유권 없는 기존 생성 경로의 파일이 새 결과와 다르면 첫 컴파일도 --force가 필요하다.
이전 스토리에서 빠진 추적 events.json은 해시 검사를 통과한 뒤 삭제한다. Tiled 맵은 삭제하지 않는다.
손상되거나 팩 밖 경로를 담은 매니페스트는 --force로도 실행하지 않는다.

check는 쓰기/삭제 없이 lint·메모리 컴파일과 일반 생성 파일·매니페스트의 바이트를 비교한다.
맵은 내용/해시 비교에서 제외하지만 앵커 대조를 수행한다. 파일/manifest 누락·최신 원고와 차이·이전 생성 파일 잔존은 실패다.
--all은 story 폴더가 있는 팩만 검사하며 팩 심볼릭 링크도 찾는다.

### 추가 진단 코드

| 코드 | 수준 | 의미 |
|---|---|---|
| S021 | 오류 | 컴파일 필수 입력 JSON/타일 역할표/타일 크기 오류 |
| S022 | 오류 | 컴파일할 앵커 좌표 없음(시작 장소의 start 포함) |
| S023 | 오류 | 기존 .tmj의 JSON/marker 누락·중복·좌표 불일치 |
| S024 | 오류 | 시작할 장소 없음 |
| S025 | 오류 | 추적 생성 파일 변경/삭제 또는 소유권 없는 기존 출력 |
| S026 | 오류 | 소유권 매니페스트 형식·버전·경로·해시 오류 |
| S027 | 오류 | 자동 문 이벤트와 원고 이벤트 ID 충돌 |
| S028 | 경고 | V3a 전이라 표정 필드 생략(팩당 1회) |
| S029 | 오류 | check에서 생성물/매니페스트 누락·차이·이전 출력 잔존 |

V1~V12는 엔진의 기존 validate 진단을 그대로 출력한다.
검증기 오류를 S 코드로 바꾸거나 lint에 임의의 엔진 커맨드 검증을 추가하지 않는다.

## 촬영 대본·시나리오 생성 (S1c)

```sh
npm run story -- film lantern
npm run story -- film lantern --name main
npm run story -- film lantern --force
npm run story -- build lantern
npm run film -- lantern main
```

film은 lint·팩 메모리 컴파일·검증 후 장면 순서와 `*>`(없으면 첫 옵션)를 따라 실제 헤드리스 게임을 실행한다.
`films/<name>.film.json`, `films/<name>.narration.md`, `tests/story_<name>.scenario.json`을 생성하고 scenarios → films를 실행한다.
이 파일도 .compiled.json의 해시 보호 대상이며 `story check --all`은 리허설로 재생성한 바이트와 비교한다.
compile만 실행하면 기존 촬영 생성물은 유지한다. 원고를 바꾼 뒤 film 또는 build를 실행해야 check가 통과한다.
--force는 편집/삭제한 생성물을 덮어쓴다. --name은 파일 이름만 지정하며 별도 선택 경로 옵션은 없다.

build는 lint → compile → film → validate → scenarios → films 순서로 진행하고 실패한 단계에서 종료 코드 1로 중단한다.
art/TTS/음성 자동 진행은 이후 단계이며 이번에는 호출하지 않는다. 영상은 기존 `npm run film`으로 별도로 녹화한다.

- 장마다 chapter, action/touch 이벤트에는 walkTo·pause 0.35·확인/진입 입력을 넣는다. auto는 자동 시작하므로 확인 입력과 접근 이동을 생략한다.
- 문 연결 그래프를 선언 순서로 너비 우선 탐색한다. 각 문까지 walkTo한 뒤 현재 인접 위치에서 문을 향해 walk 한 칸·settle을 넣는다.
- 도착 맵에서 auto 대화가 시작되면 해당 장면을 진행한 뒤 settle한다. 열린 메시지를 settle로 기다리지 않는다.
- 메시지 준비 대기 단계가 현재 film 형식에 없어, 실제 리허설에서 메시지가 열릴 때까지 측정한 틱을 wait로 넣는다. 시작 auto·fade·wait·이동·공통 이벤트에도 같은 방식이다. 임의의 고정 pause로 준비 시간을 추정하지 않는다.
- advanceText auto·choose dwell 0.4로 대사를 진행하고, 선택한 분기의 set/unset 마지막 값을 장면 끝과 최종 시나리오에서 expect한다. 공통 이벤트의 선택 경로도 포함한다.
- 시나리오는 동일 리허설 입력의 hold/wait 압축 기록이다. 별도의 이동 경로·대사 타이밍 추정을 하지 않는다.
- 장면의 @film pause/walkTo는 그 위치에서 적용한다. 이벤트/공통 이벤트 안의 힌트는 선택 경로에서 모아 action/touch 직전, auto 완료 직후 적용한다. 연속 대사 사이 배치가 필요하면 장면 수준으로 옮긴다.
- 나레이션은 선택 경로의 `>` 줄을 장·장면 제목과 함께 Markdown으로 추출하며 게임/film 재생 커맨드에는 넣지 않는다.
- @cmd 내부의 선택지/분기 상태 변경은 경로 분석 대상이 아니다. 선택은 story 문법으로 작성한다. 실제 실행과 예상 선택지가 다르면 오류다.
- 동일 입력·에셋·엔진이면 두 번 생성한 바이트가 같다. 생성 시각·절대 경로·난수는 출력하지 않는다. 측정 대기는 콘텐츠/에셋/엔진을 변경하면 다시 생성해야 한다.

| 코드 | 수준 | 의미 |
|---|---|---|
| S030 | 오류 | 장소 간 문 경로 없음 또는 touch 대상에 인접하지 않음 |
| S031 | 오류 | 촬영 준비/검증 오류, 원고 선택지와 실행 결과 불일치, 호출 깊이 초과 |
| S032 | 오류 | 실행/메시지 준비 시간 초과 또는 입력 기록 표현 불가 |

테스트는 lantern 원고 하나의 메모리 변형으로 문 왕복·시작/진입 auto·fade/wait·대체 결말·첫 옵션 기본값·플래그 기대·힌트·나레이션·결정론을 확인한다.
별도 임시 작업 디렉터리에서는 생성물 편집 감지·--force·check·compile의 촬영 파일 보존도 검증한다.

## 이벤트 등장 조건과 촬영 제외 (S1d)

```text
@event elder_first at old_spot character=elder when=!met
  촌장: 처음 보는 얼굴이구나.
  @set met
@end
@event elder_later at new_spot character=elder when=met
  촌장: 다시 만났구나.
@end
@event sailor at dock character=sailor film=skip
  뱃사공: 밀물을 기다리고 있어요.
@end
```

`when=`은 기본 페이지 조건이며 플래그·변수 비교·all/any와 조건 내부 공백을 지원한다.
조건의 미선언 이름은 기존 S002/S003, 잘못된 문법은 S001이다.
후속 `@page`는 자체 조건만 사용한다. 첫 등장 조건이 사라진 뒤에도 후속 페이지를 독립적으로 표시할 수 있기 때문이다.
once와 함께 쓰면 기본 페이지는 `all(self=false, when)`, 후속 페이지는 기존 `all(self=true, page 조건)`이다.
once 완료 후 자동 추가되는 none 페이지도 기존대로 self=true를 사용한다.
촬영 시 현재 선택 가능한 페이지가 없으면 이벤트를 방문하거나 expect를 만들지 않는다. 명시한 @film walkTo 힌트는 여전히 실제 접근 요청이므로 비활성 이벤트를 가리키면 오류다.

`film=skip`은 이벤트 본문·게임 페이지를 바꾸지 않으며, 촬영 방문·선택·그 이벤트의 플래그 expect에서 제외한다.
본문, 분기, 선택지, 공통 호출에 set/unset이 있으면 촬영에서 실행되지 않음을 S033 경고로 알린다.
명시한 @film walkTo 힌트도 film=skip 이벤트를 가리키면 생략한다. 배경 action NPC에 사용한다. auto/touch의 게임 트리거 자체를 비활성화하는 옵션은 아니다.

이벤트 내부 @go도 문 이동과 같은 장면 경계를 사용한다.
맵이 바뀌면 앞 이벤트의 대사 진행을 종료하고, 도착 auto가 있으면 settle을 다음 장면의 대사·선택지 처리 뒤로 미룬다.
advanceText 실행 도중 맵이 바뀐 경우에는 그 지점까지의 hold/wait 입력으로 바꿔 재생 시 도착 대사를 앞 장면이 소비하지 않게 한다.
도착 맵의 auto는 원고상 다음 장면의 *> 선택과 플래그 expect를 사용한다.
힌트와 이어지는 이벤트가 같은 대상이면 연속 walkTo는 하나만 출력하며, 중간에 pause나 다른 단계가 있으면 유지한다.

| 코드 | 수준 | 의미 |
|---|---|---|
| S033 | 경고 | film=skip 이벤트의 플래그 변경은 촬영·장면 expect에서 제외됨 |
| S034 | 경고 | compile 후 보존된 촬영 생성물이 원고와 다름 — story film 필요 |

lantern의 선착장 뱃사공은 film=skip 예시, 옛 등대지기는 두 결말 중 하나를 본 후 나타나는 when 예시다.

촬영 생성 전 검증에서는 .compiled.json이 소유한 film/narration/story 시나리오만 제외한다.
메모리 컴파일의 보존 파일에도 같은 기준을 적용한다. 사람이 쓴 소유권 없는 film/시나리오는 이름이나 폴더가 같아도 제외하지 않는다.
compile 단독 실행은 기존 촬영 파일을 보존하고 재생성 결과와 다르면 S034 `story film 필요` 경고를 낸다.
`story film`/`story build`로 원고에서 다시 생성하면 새 film·시나리오를 정상 검증·리허설한다.
생성 파일을 손으로 지울 필요가 없으며 S025 소유권 검사는 그대로 유지한다. `story check`는 오래된 생성물을 S029 차이로 계속 실패 처리한다.
