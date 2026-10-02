# 붙여넣은 기획 글 출처 검증

- 검증일: 2026-10-02
- 대상: "Pro 200 업그레이드 축하 + 쯔꾸르식 데이터 구동 엔진" 안내 글
- 방법: 원문 링크 직접 확인, YouTube oEmbed/페이지 메타, npm 레지스트리, GitHub 커밋 이력, 공식 공지

## 요약

| # | 주장 | 판정 | 근거 |
|---|---|---|---|
| A | Codex Astra Ultrafast, 토큰 생성 최대 8배 | **사실** (단, 요금제 조건 틀림) | OpenAI 공식 공지 2026-09-30 |
| B | Pro 200으로 Ultrafast 사용 가능 | **틀림** | Ultrafast는 Enterprise 또는 신규 **Pro 500** 전용 |
| C | Drew Conley 튜토리얼 (Overworld/GameObject/Person/Sprite) | **사실** | Pizza Legends 시리즈, 무료 YouTube 재생목록 |
| D | "Reusable 2D Game Engine in JavaScript" 2026 강의 | **사실** | FnsTutor, 2026-05-04 공개, 약 1시간 42분 |
| E | RPGJS v5 메이저 업데이트 | **사실** | npm `@rpgjs/server@5.0.0` 2026-09-28 정식 |
| F | RPGJS: JSON만 바꾸면 게임이 바뀌는 구조 | **과장** | 맵은 Tiled(TMX/TSX), 이벤트는 TypeScript 클래스 |
| G | RPGJS v5 "AI 워크플로우에 최적화되도록 재설계" | **과장** | 블로그 원문은 "개발에 AI를 활용해 가속됐다"는 회고 |
| H | IceCreamYou 보일러플레이트 = 깔끔한 도화지 | **부적합** | 마지막 커밋 2012-02-05, 커밋 4개 |
| I | 쯔꾸르는 데이터가 JSON/텍스트로 분리 | **부분 사실** | RPG Maker MV/MZ는 `data/*.json`. XP/VX/VXAce는 Ruby Marshal 바이너리 |

## 항목별 상세

### A·B. Codex Astra Ultrafast

- OpenAI 공지(2026-09-30): "up to 8x faster token generation (300 tokens per second) in Codex and up to 6x in the API"
- OpenAI Devs: Codex에서 **Astra Standard 대비 최대 8배, Astra Fast 대비 4배**
- 이용 조건: "available for Astra in Codex and ChatGPT Work on **Enterprise plans**, and through the new **Pro 500 plan**"
- 3자 보도에 따르면 Pro 500은 월 $500, Plus 대비 25배 사용량. API는 표준가의 약 6배($60 / $300 per 1M 토큰). 3자 출처라 참고만 할 것.

→ **"Pro 200 + Ultrafast"를 전제로 한 3단계 전략은 성립하지 않을 수 있다.** 지금 쓰는 요금제가 Ultrafast를 포함하는지 먼저 확인해야 한다.
(글의 "Pro 200"이 Claude 요금제를 말하는지 ChatGPT 요금제를 말하는지도 원문만으로는 알 수 없다.)

### C. Drew Conley — Pizza Legends

- 바닐라 JS + HTML/CSS + Canvas로 탑다운 턴제 RPG를 만드는 시리즈. 오버월드, 그리드 이동, 컷신, 배틀, 메뉴까지 다룬다.
- 무료 YouTube 재생목록이 있고, coopmode.dev에는 유료 묶음과 별도의 "Canvas RPG Kit" 시리즈가 있다.
- 글이 인용한 [3] jackyscript/rpg-game, [4] m-stein/LittleRpg은 **스타 1개짜리 개인 학습 레포**다. [4]는 Drew Conley 강의를 따라 만들었다고 밝히고 있고, [3]은 그런 언급이 없다. 레퍼런스로 삼을 수준은 아니다.
- 원본 구조를 보려면 Drew Conley의 공식 강의나 재생목록을 직접 보는 편이 낫다.

### D. "Build a Reusable 2D Game Engine in JavaScript"

- 채널 FnsTutor, 2026-05-04 업로드, 길이 약 102분, 조회수 553 (확인 시점 기준)
- 소개글: "A reusable foundation for any 2D game, built from scratch in vanilla JavaScript, no frameworks, no libraries" — 렌더링, 루프, 타이밍, UI, 에셋 로딩, 입력 처리
- 글이 말한 내용과 일치한다. 다만 조회수가 적은 소규모 채널이라 품질은 직접 봐야 판단할 수 있다.

### E·F·G. RPGJS v5

- npm `@rpgjs/server`·`@rpgjs/tiledmap` **5.0.0 정식: 2026-09-28** (확인일 기준 나흘 전). v4.0.0은 2023-09.
- 성격: TypeScript 기반, 같은 코드로 싱글 RPG와 MMORPG를 만드는 프레임워크. 비주얼 편집기인 RPGJS Studio의 백엔드 역할도 한다.
- v5 주요 변화: 클라이언트 커스터마이징 확대, HTTP로 맵·이벤트 런타임 갱신(서버 재시작 없음), 백엔드 무관(Express/Fastify/Cloudflare Workers), 맵 스트리밍, 핫바, 계정 GUI 등
- **데이터 구조**
  - 맵: **Tiled 에디터의 TMX/TSX**. JSON이 아니다.
  - 이벤트·대사: `RpgEvent`를 상속한 **TypeScript 클래스**에 `player.showText(...)` 형태로 작성. 문서 가이드 기준으로는 코드를 수정해야 바뀐다.
  - Studio를 쓰면 맵과 이벤트를 비주얼로 편집하는 흐름이 생기지만, "JSON 파일만 교체하면 게임이 바뀐다"는 글의 설명과는 다르다.
- **AI 관련**: 블로그 원문은 "AI did not replace the engineering effort, but it clearly accelerated it". 엔진이 AI용으로 재설계됐다는 뜻이 아니다. 별도로 RSamaium이 배포한 **RPGJS 에이전트 스킬**(skills.rest)은 있다. 프로젝트 감지, 스캐폴딩, 최신 문서 조회 기능이 있어서 RPGJS를 쓰기로 하면 유용하다.

### H. IceCreamYou / HTML5-Canvas-Game-Boilerplate

- MIT, 스타 264개. 커밋은 **4개뿐이고 마지막 커밋은 2012-02-05**다.
- HTML5 Boilerplate 기반에 jQuery 시대 코드다. ES 모듈, 번들러, 최신 Canvas API 관례와 맞지 않는다.
- 지금 시작점으로 쓰면 이점보다 걷어낼 것이 더 많다.

### I. 쯔꾸르 데이터 포맷 / 기타 출처

- [2] 네이버 블로그(biud436, 2015-10-02): "RPG Maker MV, HTML5 샘플 게임 공개". MV부터 HTML5/JS로 바뀌었고 데이터가 `data/*.json`(Map001.json, Actors.json, CommonEvents.json 등)이다. 이 점은 맞다.
- [6] save-point.org: **2011년** 게시글로, 초기 RPG JS(EaselJS 기반, RPG Maker XP 맵 임포트) 소개다. v5의 근거로 인용한 것은 잘못이다.

## 이전 답변 정정

이 검증 전에 Claude가 A(Ultrafast 8배)와 D(2026 강의)를 "확인할 수 없는 주장"으로 분류했는데, **둘 다 사실이었다.** 실제로 틀린 부분은 요금제 조건(B)과 RPGJS 데이터 구조 설명(F·G)이다.

## 설계에 주는 시사점

1. **"코드는 고정, 데이터만 교체"를 그대로 해 주는 기성 엔진은 RPGJS가 아니라 RPG Maker MV/MZ 쪽이다.** 직접 만든다면 MV/MZ의 JSON 구조, 특히 이벤트 커맨드 리스트(`code` + `parameters` 배열)를 스키마 레퍼런스로 삼는 것이 가장 실용적이다.
2. 맵 편집기는 직접 만들지 말고 **Tiled를 쓰고 JSON 내보내기(.tmj)를 읽는 방식**을 권한다. RPGJS도 Tiled를 쓰고, Tiled JSON 포맷은 공개 명세다.
3. 아키텍처 학습용으로는 Drew Conley Pizza Legends(클래스 구조, 컷신/이벤트)와 FnsTutor 강의(엔진 계층 분리)를 같이 보면 된다. IceCreamYou는 제외한다.
4. Codex Ultrafast를 쓸 계획이면 요금제 확인이 먼저다. 없어도 이 규모의 엔진은 Claude Code만으로 충분히 구현할 수 있다.

## 출처

- OpenAI 공지: https://community.openai.com/t/build-ultrafast-with-astra-in-codex-and-the-api/1402393
- OpenAI Devs: https://x.com/OpenAIDevs/status/2104996045482778973
- Ultrafast 요금 3자 정리: https://nerdschalk.com/gpt-6-astra-ultrafast-vs-standard-speed-and-usage-rates/
- FnsTutor 강의: https://www.youtube.com/watch?v=4xx9ky3n8U8
- Pizza Legends 재생목록: https://www.youtube.com/playlist?list=PLcjhmZ8oLT0r9dSiIK6RB_PuBWlG1KSq_
- Co-Op Mode (Drew Conley): https://www.coopmode.dev/series/pizza-legends-rpg
- RPGJS v5 블로그: https://rpgjs.dev/blog/rpgjs-v5-open-source-engine/
- RPGJS 레포: https://github.com/RSamaium/RPG-JS
- RPGJS 이벤트 가이드: https://docs.rpgjs.dev/guide/create-event.html
- RPGJS 에이전트 스킬: https://skills.rest/skill/rpgjs-rsamaium
- npm @rpgjs/server: https://registry.npmjs.org/@rpgjs/server
- IceCreamYou 커밋 이력: https://github.com/IceCreamYou/HTML5-Canvas-Game-Boilerplate/commits/master
- 네이버 블로그(MV): https://m.blog.naver.com/biud436/220497686807
- save-point.org (2011): https://save-point.org/thread-3389-nextoldest.html
- jackyscript/rpg-game: https://github.com/jackyscript/rpg-game
- m-stein/LittleRpg: https://github.com/m-stein/LittleRpg
