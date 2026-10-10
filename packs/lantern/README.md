# 등대지기의 약속

장소 3개(선착장·등대·마당), 장면 5개, 선택 결말 2개인 창작 예시 팩.

```sh
npm run story -- compile lantern
npm run story -- check lantern
npm run dev
```

브라우저에서 `?pack=lantern`으로 시작한다. 방향키/WASD로 이동, Enter/Z로 대화·선택.
선착장 위쪽 촌장에게 열쇠를 받은 뒤 오른쪽 금빛 문으로 등대에 들어가 중앙 불씨를 밝힌다.
등대 오른쪽 아래 문을 지나 마당 안내판에서 함께 지킬지 소라가 남을지 고른다.
선착장 아래 안내판은 저장 지점이며, 결말 뒤에도 세 장소를 돌아다닐 수 있다.

## 사람이 작성하는 입력

- `story/main.story.md`: 유일한 스토리 원고. 인물·상태·레이아웃·앵커·장면·대사·선택·공통 이벤트.
- `story/tiles.json`: wall/floor/door GID와 외부 타일셋 경로.
- `story/story.config.json`: 현재 `{}`. artRoot가 없으므로 표정 이름 검사 생략 경고가 난다. 표정 이미지 복사는 S3에서 연결.
- `game.json`의 id/title/version/formatVersion/screen/tileSize/player/plugins/labels: 사람이 정하는 메타데이터.
- `characters.json`, `skin.json`, `assets/`, `CREDITS.md`, 이 README: 스프라이트·타일·UI·폰트·출처.
- `assets/tilesets/colors.tsj`: 사람이 정한 8개 단색 타일의 Tiled 타일셋 메타데이터.

## 컴파일 생성물

- `game.json`의 state/maps/start/mapNames 네 필드.
- `maps/pier.events.json`, `maps/tower.events.json`, `maps/garden.events.json`.
- `common-events.json`.
- `maps/pier.tmj`, `maps/tower.tmj`, `maps/garden.tmj`: 최초 ASCII 뼈대. 이후 Tiled로 손질 가능하며 앵커 위치는 원고와 일치해야 한다.
- `story/.compiled.json`: 생성 파일 해시와 맵의 최초/재생성 해시. 컴파일러의 소유권 기록.

생성물을 직접 고치면 다음 compile이 중단된다. 원고를 바꾸고 컴파일한다.
생성 파일을 의도적으로 덮어쓰려면 `--force`, 맵을 ASCII로 재생성하려면 `--force-maps`를 쓴다.
game.json도 전체 파일 해시로 보호하므로 사람이 메타데이터를 바꿨을 때는 `compile lantern --force`가 필요하다. 이때도 네 필드 외의 값은 보존한다.
`.tmj`는 파일 해시 검사와 내용 비교에서 제외하고, 앵커 좌표만 검사한다.

## 아직 연결하지 않은 것

표정은 원고에 남지만 엔진 대사 필드에는 넣지 않는다(V3a 전). 컴파일 경고는 팩당 한 번이다.
나레이션과 촬영 힌트는 팩에서 생략한다. film·scenario 자동 생성은 S1c에서 수행한다.
엔진에 결말 씬이 없으므로 결말은 대사와 두 플래그로 표현한다. 전용 결과 화면은 G3 범위다.

S1c 촬영 생성물: `films/main.film.json`, `films/main.narration.md`, `tests/story_main.scenario.json`도 사람이 편집하는 파일이 아니다.
`npm run story -- build lantern`으로 원고에서 팩과 촬영 경로를 갱신·검증하고, `npm run film -- lantern main`으로 무음 영상을 녹화한다.
기본 `*>` 경로는 함께 지키는 결말이다. 혼자 지키는 결말은 원고 선택 표시를 바꾼 메모리 변형 테스트로 전체 경로를 확인한다.

S1d 예시: 선착장의 뱃사공(`film=skip`)은 수동 플레이에서만 대화하고, 옛 등대지기(`when=any(ending_public,ending_kept)`)는 결말을 본 뒤 선착장에 나타난다.

V2a 대사 음성: `voices.json`과 수기 `films/voiced.film.json`은 입력, `voice-manifest.json`은 TTS 생성물이다.
`npm run tts -- lantern --film voiced` 후 `npm run film -- lantern voiced`로 한국어 대사 음성을 녹화한다.
macOS 한국어 음성이 필요하며 로컬 WAV는 .cache/voice/lantern에만 둔다. story 생성 main film은 S2 전까지 auto 형식을 유지한다.
