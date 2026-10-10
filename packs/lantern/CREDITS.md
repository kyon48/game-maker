# 출처

- 이야기·대사·레이아웃: 이 프로젝트에서 작성한 창작 「등대지기의 약속」. 실존 작품의 인물·대사·게임 자원을 사용하지 않음.
- `assets/characters/sora.png`: demo의 `hero.png`를 복사. 프로젝트의 `tools/generate-character.ts`로 만든 16×24, 3열×4방향 스프라이트. CC0-1.0. 재생성: `npm run characters -- packs/lantern/assets/characters/sora.png`.
- `assets/tilesets/colors.png`: 프로젝트의 `tools/generate-tiles.ts`로 만든 단색 타일. CC0-1.0. 재생성: `npm run tiles -- packs/lantern/assets/tilesets/colors.png`.
- 촌장·불씨·안내판·뱃사공·옛 등대지기: characters.json의 단색 placeholder. 프로젝트 자체 구성, 외부 이미지 없음.
- `assets/fonts/Galmuri11.woff2`: Galmuri11, Lee Minseo(quiple), Copyright 2019–2025. SIL Open Font License 1.1(OFL-1.1). 출처: https://github.com/quiple/galmuri 및 npm galmuri 2.40.3. `npm run fonts -- lantern`으로 복사. 전문: `assets/fonts/OFL.txt`.
- `skin.json`: demo의 기본 UI 설정을 복사. 코드·단색 UI는 이 프로젝트에서 작성.

표정 이름은 스토리 원고에만 있으며 표정 이미지는 아직 복사하지 않았다(S3 범위).

- 음악 `assets/music/harbor.ogg`: 이 프로젝트에서 사인파 화음으로 직접 생성한 원본 루프. 저작자: game-maker 프로젝트 기여자. CC0-1.0으로 공개. 외부 음원 없음. 재생성: `node --import tsx tools/generate-film-music.ts lantern`.
