# V1 촬영 도구

설치 후 `npx playwright install chromium --no-shell`을 한 번 실행한다. 녹화는 Playwright의 Chromium과 npm의 ffmpeg-static만 사용한다. 시스템 ffmpeg는 필요 없다.

```sh
npm run films -- --all
npm run film -- manor truth
npm run film -- manor truth --chapter '약속을 함께 읽다' --fps 60 --out out/manor/finale
npm run film:verify
```

대본은 `packs/<pack>/films/<id>.film.json`, 에디터 스키마는 `schemas/film.schema.json`이다. 기존 시나리오의 start/state/press/hold/walk/wait/settle/expect를 그대로 쓴다. 추가 단계는 pause(초), walkTo({event} 또는 {x,y}), chapter(제목)다. choose는 원래 options 인덱스와 선택적인 dwell(초)을 받고, advanceText는 기존 true와 press/auto를 받는다. readingSpeed는 `{ "base": 0.6, "perCharacter": 0.07 }` 형식이며 생략하면 이 값이다.

auto는 각 페이지의 글자가 모두 표시된 뒤 읽기 시간을 기다린다. press는 빠르게 확인 키를 반복한다. 화면 측정은 녹화 브라우저에서 수행하므로 헤드리스 리허설과 줄바꿈·총 길이는 다를 수 있다. 같은 브라우저·OS·에셋·대본에서는 프레임이 같다. V2 음성 길이 정책은 driver의 자동 읽기 정책 자리에서 교체한다.

walkTo는 현재 맵만 탐색한다. 문은 먼저 좌표로 걸어 들어가고 settle 및 expect.map으로 맵 전환을 확인한다. 이벤트 대상은 활성 이벤트의 인접 칸에서 그 이벤트를 바라본다. 막힌 경로·진행 시간 초과·숨겨진 선택지·기대값 불일치는 단계 번호·틱·맵·좌표를 포함한 오류다. 챕터 이름은 중복할 수 없다.

녹화 전에 리허설과 팩 빌드를 수행한다. films는 배포 팩에서 제외하며, 도구가 검증한 film을 페이지의 초기화 데이터로 넣는다. 개발 모드는 `?pack=<id>&record=<film>`으로 파일을 직접 읽을 수 있다. 녹화 모드는 저장 슬롯을 읽거나 쓰지 않고, 키보드/rAF 없이 `window.__recorder.next()`를 기다린다. 반환값은 `{ rgba, events, frame, done }`, rgba는 recorder.encoding에 따라 원본 RGBA 또는 deflate 압축 RGBA의 base64다. 도구 부팅의 기본 encoding은 deflate이며 Node의 inflateSync로 원본 1920×1080 RGBA를 복원한다. frame('rgba')는 같은 상태의 무압축 비교 캡처를 제공한다. 30fps는 한 호출당 2틱, 60fps는 1틱이다. 완료 확인 호출의 rgba는 null일 수 있다.

출력은 기본 `out/<pack>/<film>/`이고 --out을 주면 그 디렉터리에 바로 저장한다. video.mp4는 항상 1920×1080이며 음성·음악이 있으면 오디오 트랙을 합성한다. 브라우저에서 픽셀 캔버스를 최대 정수배 최근접 확대하고 HD 얼굴 캔버스를 겹친 1920×1080 RGBA를 캡처한다. 남는 공간은 검정 여백이다. ffmpeg는 합성된 프레임을 인코딩한다. 자막은 번인하지 않은 SRT, chapters.txt는 설명란용 시간+제목, script.md는 관찰한 대사·선택지, timeline.json은 프레임/원래 틱이 있는 이벤트 배열이다. 숨겨진 선택지는 목록에 나오지 않으며, 선택 확정은 원래 인덱스로 기록한다.

--chapter는 앞부분을 픽셀 추출 없이 진행하고 선택한 챕터부터 다음 챕터 직전까지 찍는다. 프레임은 전체 영상의 해당 구간과 같고 타임라인·자막·챕터 시간은 0부터 시작한다. 경계에 이미 열린 메시지·선택지는 유지하고 잘린 구간 끝에서 닫는다.

film:verify는 얼굴이 표시되는 짧은 demo를 두 번 녹화해 RGBA SHA-256 목록을 비교한다. MP4 바이트는 비교하지 않는다. 추가로 부분 녹화 프레임이 전체 녹화의 해당 구간과 같은지도 검사한다. 기본 check에 이 브라우저 검사는 포함하지 않는다.

## V2b 나레이션·음악

`narrate: "문장"`은 G1 평문을 narrator 목소리로 읽는다. 기본 비차단이며 `wait: true`로 완료까지 기다린다. 새 나레이션은 앞 음성 뒤에 이어지고 `waitNarration: true`는 대기열 전체를 기다린다. 마지막 단계 뒤에도 남은 나레이션은 끝까지 진행한다. 길이가 없으면 `npm run tts -- <pack> --film <film>`부터 실행한다. 음성 대사와 겹치면 리허설 경고만 출력한다.

`music: {file: "assets/music/x.ogg", volume: 0.3, fadeIn: 1, loop: true}`는 팩 안 음악을 시작한다. `music: null, fadeOut: 1`로 정지한다. 지원 확장자는 ogg/wav/mp3/flac/m4a이며 페이드 단위는 초다. 새 음악은 기존 트랙을 즉시 교체한다. 페이드 아웃을 영상 끝까지 담으려면 뒤에 그 길이만큼 pause를 둔다.

타임라인은 narration-start/end와 music-start/stop을 기록한다. 나레이션 SRT는 `[나레이션]`으로 구분하며 script.md에도 별도 문단을 만든다. --chapter는 이미 재생 중인 음성·음악과 페이드의 진행 위치를 유지한다.

오디오 합성은 음성 구간 기반 음악 덕킹(-12dB, 앞뒤 0.15초 램프)과 2-pass loudnorm(-14 LUFS, -1dBTP)을 적용한다. 최종 오디오는 48kHz 스테레오 AAC 192kbps다. 디지털 무음은 유한 LUFS가 없으므로 정규화 없이 유지한다. 음성·음악이 전혀 없으면 오디오 트랙을 추가하지 않는다.

## Story 대기 지점 (S2)

생성 film은 `advanceText: "voice", count: 1`로 한 메시지만 진행하고 `waitFor: "message"`로 준비를 기다린다. 목소리 없는 화자는 auto로 진행한다. count를 생략한 기존 대본은 이전처럼 연속 메시지를 처리한다.

`narrate: "문장", cue: "story_cue_1"`은 이벤트의 film_cue에 도달할 때까지 기다린다(최대 36000틱). 그 위치에서 앞 나레이션 뒤에 음성을 배치하고 완료 후 대기 지점을 해제해 다음 대사를 시작한다. `waitNarration: true, cue: "…"`도 같은 위치에서 대기열 전체를 기다린 뒤 해제한다. 일반 플레이·시나리오에서는 cue가 즉시 통과한다.

S3: text-start/end에는 portrait·expression을 기록하고 script.md 화자는 `이름(표정 key)`로 표시한다. 얼굴 없는 메시지·SRT 형식은 그대로다.


## V3a-perf 전송과 측정 (2026-10-11)

브라우저 합성과 getImageData는 그대로 유지한다. RGBA를 네이티브 CompressionStream(deflate)으로 먼저 압축한 뒤 작은 결과만 base64로 전송한다. Node 표준 zlib로 크기 제한을 두고 복원하며, ffmpeg에 보내는 픽셀은 바뀌지 않는다. 별도 합성·GL 설정·개발 의존성은 추가하지 않았다. film:verify는 얼굴 대화 샘플에서 무압축 브라우저 캡처와 복원 프레임의 바이트 일치도 검사한다.

같은 Chromium, 30fps, 첫 대화 이후 30프레임 평균이다. V2b(a47e251)의 lantern voiced 대본·팩을 공통 기준으로 사용했다. 현재 main에는 V2b가 지원하지 않는 film_cue가 있으므로 옛 대본을 고정했고, HD 비교에는 화자의 neutral 얼굴 필드·이미지만 추가했다. 렌더 시간은 next 시작부터 읽기 직전까지로 2틱 진행을 포함한다. 전송 시간은 page.evaluate 왕복에서 브라우저 처리 시간을 뺀 값이다.

| 단계 (프레임당 ms) | V2b 480×270 | V3a 1080p 얼굴, 수정 전 | 수정 후 |
|---|---:|---:|---:|
| 렌더·틱 | 0.22 | 1.09 | 0.90 |
| getImageData | 0.69 | 3.05 | 2.65 |
| 인코딩 (수정 후 압축 포함) | 8.27 | 127.17 | 15.19 |
| 전송·직렬화 | 8.41 | 99.40 | 1.97 |
| Node 복원 | 0.12 | 1.02 | 2.26 |
| ffmpeg 쓰기·backpressure | 1.15 | 9.55 | 7.82 |
| 전체 | 18.88 | 241.30 | 30.81 |
| 처리 fps | 52.96 | 4.14 | 32.46 |

이 환경에서는 보고된 0.4fps 대신 4.14fps가 재현됐다. 수정 전 인코딩·전송이 전체의 약 94%여서 소프트웨어 GL 읽기보다 전송 경로가 병목이었다. 얼굴 없는 같은 팩의 수정 후 결과는 30.82fps(32.44ms)로 실시간 녹화 범위를 유지한다. V2b보다 큰 1080p 읽기·인코더 입력 비용은 남는다.

실제 lantern main 전체 녹화는 3967프레임, 영상 132.23초에 총 125.98초(31.49fps, 실시간의 0.95배)였다. 총 시간에는 리허설·빌드·오디오 합성·정리도 포함한다. 수정 전 전체 녹화 시간은 이 측정에서 재지 않았다. 이전 V3a demo visit 79프레임과 수정 후 RGBA SHA-256은 모두 일치했다.

## G3 씬

`waitFor: "scene"`은 씬이 열릴 때까지 기다린다(36000틱 상한). 퍼즐은 press 단계로 입력하고 `expect: {scene: "ending"}`으로 열린 화면을 확인할 수 있다. 맵이 정지한 동안에도 씬은 고정 틱으로 진행하고 픽셀 캔버스에 그린다. film:verify는 얼굴 demo에 더해 manor lamps 씬 대본을 두 번 녹화해 RGBA 해시를 비교한다.

## G5 게임 BGM·효과음

게임의 audio.json/mapBgm과 bgm/sfx 커맨드를 매 틱 관찰한다. bgm-start/stop·sfx는 timeline.json에 남고 일반 녹화 페이지에서는 AudioContext를 만들지 않는다. film music과 게임 BGM은 하나의 음악 채널에서 요청 순서대로 교체한다. BGM은 음성 구간에서 덕킹하고 SFX는 원래 볼륨으로 섞은 뒤 전체를 2-pass -14 LUFS·48kHz 스테레오 AAC로 정규화한다. 챕터에서 앞서 시작한 BGM·SFX는 이미 지난 샘플을 잘라 재생 위상을 유지한다.

음악 정지 이벤트의 종류는 요청 출처를 따른다(게임 요청 bgm-stop, film 요청 music-stop). 트랙은 공통 id로 연결하므로 서로의 음악도 정지시킨다. 게임 틱 이벤트는 frameOf, film 단계는 틱 경계로 환산해 같은 출력 프레임에서 교체한다.

G5 실제 녹화 확인(2026-10-12, ffmpeg-static loudnorm 분석의 input_i, 최종 AAC 기준):

| 팩/대본 | 길이 | 영상 | 오디오 | 음량 | 타임라인 |
|---|---:|---|---|---:|---|
| manor truth | 530.133초 | 1920×1080 / 30fps | 48kHz 스테레오 AAC | -14.01 LUFS | 대사 51개·BGM 시작 3개·SFX 11개 |
| lantern main | 134.200초 | 1920×1080 / 30fps | 48kHz 스테레오 AAC | -14.03 LUFS | 대사 16개·나레이션 3개·BGM 시작 5개·SFX 2개 |

일반 manor 페이지에서 5파일 디코딩, 첫 입력 전 suspended, 입력 후 running, loop BGM 및 단서 획득 one-shot SFX의 실제 Web Audio source 시작을 Playwright로 확인했다. 결과 mp4는 out/에만 보관하며 커밋하지 않는다.

G4: 내장 battle 씬은 일반 choice/press·진행 메시지로 입력하고 resultVar expect로 확인한다. film:verify는 debate win 전투도 두 번 녹화하여 프레임 RGBA 해시를 비교한다.

## 외부 팩과 납품 (V4)

GAME_PACKS_PATH에 외부 팩 부모 폴더(또는 팩 자체)를 콜론으로 구분해 등록한다. 같은 ID는 오류이며 외부 플러그인은 Node 22.15 이상이 필요하다. 모든 도구의 명시적 팩 ID와 dev 서버가 이 경로를 사용한다. --all은 기본 레포 팩만, --include-external을 함께 쓰면 외부도 처리한다. 외부 팩의 out·.cache·임시 빌드는 팩 폴더 안에 남는다.

`npm run story -- new <id> [--dir <팩 폴더>] [--title "제목"]`은 덮어쓰기 없이 최소 원고·에셋·목소리 설정을 만든다. `npm run release -- <id> [--film main]`은 build·TTS·녹화·측정과 여섯 파일 납품을 실행한다. story/story.config.json의 targetMinutes로 목표 분량, story/release.md의 {title}/{chapters}/{credits}/{duration}으로 설명란을 지정한다. 기본 설명란은 TTS 사용을 알린다.

상세 순서와 검수는 [제작 운영 절차](../../docs/09-production-runbook.md)를 따른다.
