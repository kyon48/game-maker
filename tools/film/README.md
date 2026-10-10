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

녹화 전에 리허설과 팩 빌드를 수행한다. films는 배포 팩에서 제외하며, 도구가 검증한 film을 페이지의 초기화 데이터로 넣는다. 개발 모드는 `?pack=<id>&record=<film>`으로 파일을 직접 읽을 수 있다. 녹화 모드는 저장 슬롯을 읽거나 쓰지 않고, 키보드/rAF 없이 `window.__recorder.next()`를 기다린다. 반환값은 `{ rgba, events, frame, done }`, rgba는 논리 해상도의 base64 RGBA다. 30fps는 한 호출당 2틱, 60fps는 1틱이다. 완료 확인 호출의 rgba는 null일 수 있다.

출력은 기본 `out/<pack>/<film>/`이고 --out을 주면 그 디렉터리에 바로 저장한다. video.mp4는 항상 1920×1080이며 음성·음악이 있으면 오디오 트랙을 합성한다. 논리 화면에 들어가는 최대 정수배 최근접 확대 후 검정 여백을 넣는다. 자막은 번인하지 않은 SRT, chapters.txt는 설명란용 시간+제목, script.md는 관찰한 대사·선택지, timeline.json은 프레임/원래 틱이 있는 이벤트 배열이다. 숨겨진 선택지는 목록에 나오지 않으며, 선택 확정은 원래 인덱스로 기록한다.

--chapter는 앞부분을 픽셀 추출 없이 진행하고 선택한 챕터부터 다음 챕터 직전까지 찍는다. 프레임은 전체 영상의 해당 구간과 같고 타임라인·자막·챕터 시간은 0부터 시작한다. 경계에 이미 열린 메시지·선택지는 유지하고 잘린 구간 끝에서 닫는다.

film:verify는 짧은 demo를 두 번 녹화해 RGBA SHA-256 목록을 비교한다. MP4 바이트는 비교하지 않는다. 추가로 부분 녹화 프레임이 전체 녹화의 해당 구간과 같은지도 검사한다. 기본 check에 이 브라우저 검사는 포함하지 않는다.

## V2b 나레이션·음악

`narrate: "문장"`은 G1 평문을 narrator 목소리로 읽는다. 기본 비차단이며 `wait: true`로 완료까지 기다린다. 새 나레이션은 앞 음성 뒤에 이어지고 `waitNarration: true`는 대기열 전체를 기다린다. 마지막 단계 뒤에도 남은 나레이션은 끝까지 진행한다. 길이가 없으면 `npm run tts -- <pack> --film <film>`부터 실행한다. 음성 대사와 겹치면 리허설 경고만 출력한다.

`music: {file: "assets/music/x.ogg", volume: 0.3, fadeIn: 1, loop: true}`는 팩 안 음악을 시작한다. `music: null, fadeOut: 1`로 정지한다. 지원 확장자는 ogg/wav/mp3/flac/m4a이며 페이드 단위는 초다. 새 음악은 기존 트랙을 즉시 교체한다. 페이드 아웃을 영상 끝까지 담으려면 뒤에 그 길이만큼 pause를 둔다.

타임라인은 narration-start/end와 music-start/stop을 기록한다. 나레이션 SRT는 `[나레이션]`으로 구분하며 script.md에도 별도 문단을 만든다. --chapter는 이미 재생 중인 음성·음악과 페이드의 진행 위치를 유지한다.

오디오 합성은 음성 구간 기반 음악 덕킹(-12dB, 앞뒤 0.15초 램프)과 2-pass loudnorm(-14 LUFS, -1dBTP)을 적용한다. 최종 오디오는 48kHz 스테레오 AAC 192kbps다. 디지털 무음은 유한 LUFS가 없으므로 정규화 없이 유지한다. 음성·음악이 전혀 없으면 오디오 트랙을 추가하지 않는다.
