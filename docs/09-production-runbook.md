# 영상 제작 운영 절차

## 1. 아이디어와 초안

[단계별 초안 프롬프트](prompts/story-draft.md)로 장·장면·인물·선택지를 정리하고, [나레이션 작법](07-narration-style.md)을 따른다. 원작과 번역본의 권리는 별도로 확인한다. 번역문을 그대로 옮기는 대신 허용된 자료를 바탕으로 요약·재서술하고 출처를 CREDITS에 남긴다.

## 2. 새 팩 시작

레포 루트에서 다음을 실행한다. 기존 폴더는 덮어쓰지 않는다.

```sh
npm run story -- new lantern2 --title "새 이야기"
npm run story -- build lantern2
```

기본 원고·480×270 화면·생성 타일과 스프라이트·Galmuri11·macos-say 목소리 설정이 들어간다. macos-say는 macOS에서 실행한다. 얼굴 원본을 준비하면 story/story.config.json에 설정 파일 기준 상대 artRoot를 넣고 인물에 art를 배정한다. 기본 설정의 주석은 자리 표시이며 존재하지 않는 에셋 경로를 요구하지 않는다.

## 3. 비공개 팩

심볼릭 링크를 만들지 않고 외부 부모 폴더를 등록한다. 팩 폴더 자체를 등록해도 된다. 여러 경로는 콜론으로 구분하며 같은 ID가 서로 다른 폴더에 있으면 오류다.

```sh
npm run story -- new private_episode --dir "$HOME/private-games/private_episode" --title "비공개 이야기"
export GAME_PACKS_PATH="$HOME/private-games"
npm run dev
npm run validate -- private_episode
npm run release -- private_episode
```

외부 플러그인은 Node 22.15 이상이 필요하다. dev의 `?pack=private_episode`도 동일한 팩을 읽는다. 서버 시작 뒤 새 폴더를 추가하면 재시작한다. `--all`과 check는 기본적으로 레포 내부 팩만 처리하며 외부까지 검사하려면 `--all --include-external`을 쓴다.

외부 팩의 영상은 팩/out/<film>/, 음성은 팩/.cache/voice/<id>/, 임시 빌드는 팩/.cache/build/에 둔다. 외부 경로 설정은 셸에만 두고 커밋하지 않는다. 공개 레포에 비공개 작품 고유명사·대사·캐시·산출물을 복사하지 않는다. 배포 빌드에는 story 원고·tests·films·plugins 원본·out·.cache를 복사하지 않는다.

## 4. 원고와 에셋 검수

story/main.story.md를 수정하고 `npm run story -- lint <팩>`으로 검사한다. 인물별 voice 키와 narrator를 config에 연결하고 표정을 배정한다. `story build`는 lint → compile/art → film → 필요한 TTS → validate → scenarios → films 순서로 진행하며 실패한 단계에서 멈춘다. 원고를 바꾼 뒤 생성물은 직접 수정하지 않고 다시 build한다. `npm run check`는 say를 호출하지 않는다.

story.config.json의 선택 필드 targetMinutes로 목표 분량을 정할 수 있다. story/release.md는 설명란 템플릿이며 `{title}`, `{chapters}`, `{credits}`, `{duration}`을 지원한다. 없으면 TTS 사용 안내가 있는 기본 템플릿을 쓴다.

## 5. 납품 만들기

```sh
npm run release -- lantern
npm run release -- lantern --film main
```

story 팩이면 build하고, 음성을 준비한 뒤 녹화·음량 및 길이 측정까지 실행한다. 레포 팩은 out/<팩>/<film>/release/, 외부 팩은 팩/out/<film>/release/에 다음 여섯 파일을 만든다.

| 파일 | 용도 |
|---|---|
| video.mp4 | 1920×1080 영상 |
| subtitles.srt | 대사·나레이션 자막 |
| chapters.txt | 챕터 시간 |
| script.md | 시간순 검수 대본 |
| description.md | 설명란 초안 |
| review.md | 실측 길이·LUFS·피크·장별 분량·경고·에셋 누락 검수 |

처음 녹화할 때 `npx playwright install chromium --no-shell`을 실행한다. 음성 캐시를 잃으면 재생성하되 기존 매니페스트 길이가 기준이다. 작업 중단 시 서버·브라우저·인코더는 종료된다.

## 6. 사람이 확인하고 업로드

review.md의 체크박스를 직접 확인한다. 맞춤법·발음·자막, 얼굴과 플레이스홀더, 챕터 전환, 목표 분량, 음량을 영상에서 검수한다. CREDITS의 빈 칸과 원작·번역본 권리, 2차 창작 표기, TTS 및 에셋 이용 조건을 확인한다. 썸네일·제목·설명란을 작성하고 업로드 시 유튜브의 현재 합성 콘텐츠 표시 요구사항을 확인한다. 자동 검수 결과는 권리 확인이나 편집 판단을 대신하지 않는다.
