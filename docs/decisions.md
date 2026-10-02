# 구현 결정

- 2026-10-03 / M1 / check는 typecheck(두 tsconfig) → lint → test만 실행 / schemas·validate·scenarios는 M5, build:all은 M6에서 구현하므로 미구현 명령 제외.
- 2026-10-03 / M1 / 방향 입력으로 카메라 목표점을 틱마다 2 논리 픽셀 이동하는 임시 platform 동작 사용 / M2 플레이어 구현 후 보간 위치 추종으로 교체.
- 2026-10-03 / M1 / 시작 game.json과 맵·타일셋만 로드하고 기본 형태를 검사 / 전체 팩 검증 및 나머지 부팅 순서는 M5 이후 구현.
- 2026-10-03 / M1 / sim은 sim·data를 실행 시 import할 수 있고 api는 import type만 허용 / §4.2의 타입 제한은 api에 적용하는 것으로 해석; sim 내부 클래스와 이후 PackLoader 호출에 필요.
- 2026-10-03 / M1 / 단색 16px 타일 PNG를 Node 내장 모듈로 생성하고 데모 맵은 직접 JSON 작성 / 외부 에셋 및 런타임 의존성 추가 없이 확인 가능.
- 2026-10-03 / M1 / Tiled tilelayer는 숫자 배열만 지원하고 압축·base64는 로드 오류 / 명세에 인코딩이 없어 가장 단순한 Tiled 기본 JSON 사용.
- 2026-10-03 / M1 / no-restricted-imports에 경로 해석 ESLint 규칙을 병행 / 상대경로 우회와 동적 import에도 같은 계층 경계 적용.
