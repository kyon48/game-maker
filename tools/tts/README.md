# 대사·나레이션 TTS (V2a/V2b)

```sh
npm run tts -- lantern --film voiced
npm run tts -- lantern --film voiced --prune
npm run film -- lantern voiced
```

`--film` 기본값은 main이다. voices.json의 화자 표시 이름을 사용하며 화자가 없는 대사는 narrator다.
기본 추출은 film을 리허설해 실제 열린 메시지의 G1 plainText를 수집한다. voice 단계는 추출 시에만 auto로 진행하므로 처음 매니페스트가 없어도 생성할 수 있다.
변수/플러그인 치환은 실제 값에 따른 대사마다 별도 캐시가 생긴다. 전체 정적 text 수집 함수도 맵·공통 이벤트·if·choice 본문을 순회하며, 정적 값이 없는 대사를 임의의 초기값으로 음성화하지 않는다.
플러그인 ctx.showText에서 수집한 대사도 포함하되 경고한다. 목소리가 없는 화자는 경고 후 건너뛴다.

voices.json은 화자 → `{ provider, voice, speed? }`이며 speed 기본값은 1이다.
macos-say는 macOS 전용이다. voice ID는 Yuna, Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley를 사용한다.
시스템 음성 목록에서 해당 ID의 ko_KR 음성을 선택한다. 한국어 음성이 설치되지 않았거나 시스템 음성 서비스가 차단되면 명확한 오류를 낸다.
`/usr/bin/say`의 AIFF를 ffmpeg-static으로 24kHz mono PCM WAV로 변환한다. 테스트는 say를 호출하지 않고 fake의 길이 비례 무음 WAV만 쓴다.

캐시 키는 `[provider, voice, speed(default=1), plainText]` JSON의 SHA-256이다. engine/data/voice.ts를 sim과 Node가 공유한다.
캐시는 `.cache/voice/<pack>/<hash>.wav`, 매니페스트는 `voice-manifest.json`이다. 매니페스트는 키순 정렬·2칸 들여쓰기·LF이며 생성 시각을 기록하지 않는다.
대사 하나만 바꾸면 새 키 하나만 생성한다. 기존 항목은 유지하며 --prune을 명시했을 때만 현재 촬영 경로에서 쓰이지 않는 매니페스트 항목을 제거한다(캐시 WAV는 유지).
캐시를 잃어 재생성한 WAV의 길이가 달라지면 경고하고 기존 매니페스트 frames를 유지한다. frames는 30fps 기준이며 녹화가 60fps여도 같은 값이다.
비어 있지 않은 대사에 빈 WAV가 반환되면 저장하지 않는다.

voice film은 길이표가 없으면 실패하며 먼저 tts를 실행해야 한다. 헤드리스 films는 매니페스트만 있으면 실행 가능하다.
실제 오디오 녹화에는 로컬 WAV 캐시도 필요하다. 렌더링 후 음성을 adelay/amix로 배치하고 manifest 길이에 맞춰 자르거나 무음으로 채운다.
여백은 skin.message.voiceGap(초, 기본 0.4)이다. 일반 플레이와 auto/press 대본은 수동 진행을 유지하며 voice 대본의 녹화 모드에서만 길이 동기화를 켠다.
waitFor: message는 실제 메시지/선택지 준비를 최대 36000틱 기다린다. S2 전에는 story 생성기의 측정 wait를 자동으로 바꾸지 않는다.

## 제공자 추가

1. tools/tts/provider.ts의 TtsProvider 인터페이스를 구현하고 providers 맵에 등록한다.
2. 엔진 검증기의 지원 provider 목록에 ID를 추가한다. 키 계산 함수와 매니페스트 형식은 바꾸지 않는다.
3. fake/주입한 가짜 제공자로 캐시·길이·실패 테스트를 추가한다. 테스트에서 실제 API/유료 합성을 호출하지 않는다.
4. 인증·네트워크·파일 작업은 tools에서 처리하며 sim에는 길이표만 전달한다.

film의 narrate도 실제 진행 시점의 G1 평문으로 추출한다. 첫 생성에는 아직 길이가 없으므로 추출용 리허설만 매니페스트 누락 나레이션에 읽기 시간 추정치를 사용한다. 실제 리허설·녹화는 반드시 매니페스트 길이를 사용한다. 나레이션은 narrator 목소리로 캐시한다.

최종 합성은 음성·음악 덕킹과 2-pass loudnorm을 적용하고 48kHz 스테레오 AAC로 출력한다. 원본 캐시의 24kHz mono WAV는 그대로 유지하고 합성에서 변환한다.
