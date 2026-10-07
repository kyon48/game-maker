# 마스코트 캐릭터 바이블과 이미지 생성 프롬프트

- 작성일: 2026-10-08
- 상태: 초안. 기본형 디자인이 확정되면 확정 이미지를 `packs/_shared/mascot/`에 두고 이 문서의 "확정값"을 채운다
- 선행 문서: [04-video-pipeline.md](04-video-pipeline.md) §6.2

---

## 1. 디자인 원칙: 최대한 단순하게

단순함은 취향이 아니라 **파이프라인 요구사항**이다. 아래 기준을 넘는 요소는 넣지 않는다.

| 기준 | 이유 |
|---|---|
| **2등신 이하**, 머리와 몸이 하나로 이어진 둥근 실루엣 | 16×24 도트 스프라이트에서도 같은 캐릭터로 읽혀야 한다 |
| **눈은 점 2개, 입은 선 1개**. 코·눈썹·속눈썹 없음 | 표정 세트를 모든 의상에 덧씌우는 "겹치기" 방식(04 §6.2)이 가능해진다 |
| **기본색 1색 + 외곽선 1색** (+ 볼 터치 정도) | 원작 의상의 색이 돋보이고, 도트 시트의 색 바꾸기가 쉬워진다 |
| 손가락·발가락 없음, 팔다리는 짧은 뭉툭한 형태 | 포즈가 바뀌어도 모양이 무너지지 않는다 |
| 음영·질감·그라데이션 없음, 균일한 굵기의 외곽선 | 생성할 때마다 달라지는 요소를 없앤다 |
| 실루엣만 보고도 알아볼 수 있는 특징 **딱 하나** (예: 머리 위 작은 돌기, 귀 모양, 꼬리) | 의상을 입혀도 "그 마스코트"로 보이게 하는 장치 |

**원작 인물은 이 위에 다음만으로 구분한다**: 머리 모양(또는 모자), 옷의 형태와 색, 소품 하나. 얼굴과 몸 비율은 절대 바꾸지 않는다.

**피할 것**: 기존 캐릭터(치이카와, 산리오, 포켓몬 등)와 닮은 외형. 프롬프트에 기존 캐릭터 이름이나 "~풍"을 넣지 않는다. 의상은 소설 원작과 시대 고증을 바탕으로 하고, 영화·드라마판 의상 디자인을 따라 하지 않는다.

## 2. 고정 규격

| 항목 | 값 |
|---|---|
| 스탠딩 캔버스 | 1024×1024 PNG, 투명 배경 |
| 캐릭터 크기 | 캔버스 높이의 약 75% |
| 발밑 기준선 | y = 960 (모든 의상 동일) |
| 얼굴 중심 | 확정 후 기록 (예: x = 512, y = 430). 겹치기 방식의 기준점 |
| 포즈 | 정면, 차렷에 가까운 기본 자세 1종. 동작은 표정과 연출(흔들기 등)로 표현 |
| 표정 8종 | `neutral` `smile` `laugh` `surprised` `sad` `angry` `flustered` `thinking` |
| 도트 스프라이트 | AI로 만들지 않는다. 확정 디자인을 보고 16×24 기본 시트를 한 번 만들고, 의상은 스크립트로 색 바꾸기 + 소품 덧그리기 |

생성 이미지는 투명 배경이 정확히 나오지 않을 수 있다. 배경 제거, 크기 맞추기, 기준선 정렬은 후처리 스크립트(`tools/art/`, V3)에서 한다.

## 3. 프롬프트 템플릿

영문 프롬프트를 기본으로 하고 `{ }` 부분만 바꿔 쓴다. 이미지 생성 도구에 **참조 이미지를 첨부할 수 있으면 2단계부터 항상 확정 기본형을 첨부**한다.

### 3.1 기본형 후보 만들기 (1회, 여러 번 돌려 고르기)

```
Original mascot character design sheet, 6 different candidates in a grid.
Extremely simple chibi creature: round body and head as one soft blob, under 2 heads tall,
two dot eyes, one short line mouth, no nose, no eyebrows, no fingers, stubby limbs.
Flat colors only: one base color plus one uniform dark outline, optional small blush.
No shading, no gradients, no texture. Each candidate has exactly one distinctive silhouette
feature (e.g. a small sprout, unusual ear shape, short tail).
Front view, neutral standing pose, white background, clean vector-like line art.
Must not resemble any existing character or brand.
```

고를 때 확인할 것: 실루엣만 봐도 구분되는가 / 손으로 30초 안에 따라 그릴 수 있는가 / 16px로 줄여도 알아볼 수 있는가.

### 3.2 모델 시트 (기본형 확정)

```
Character model sheet of the attached mascot. Keep exactly the same proportions,
face, line weight and colors. Show: front view, 3/4 view, back view, and a size
comparison silhouette. Flat colors, uniform outline, no shading.
Plain white background, evenly spaced, labeled views.
```

### 3.3 표정 시트

```
Expression sheet of the attached mascot, front view, same pose and same size in every cell.
8 cells in a 4x2 grid, in this order: neutral, smile, laugh, surprised, sad, angry,
flustered (sweat drop), thinking. Change ONLY the dot eyes, line mouth and small
symbols (sweat drop, blush, question mark). Body, outline and colors identical.
Flat colors, no shading, plain white background.
```

### 3.4 원작 의상 입히기 (인물마다)

```
The attached mascot dressed as {인물 역할 설명, 예: "a witty young woman of the English
country gentry in the early 1800s"}. Keep the mascot's body shape, face, proportions,
line weight and base color exactly the same; do not add a human face or human body.
Costume: {의상 묘사 — 옷 형태, 색 2~3개, 머리 모양 또는 모자, 소품 하나}.
Front view, neutral standing pose, {표정 이름} expression, centered, full body,
flat colors, uniform outline, no shading, plain white background.
```

- `{인물 역할 설명}`에는 **원작 소설과 시대 고증**만 쓴다. 특정 배우, 영화·드라마판 이름을 넣지 않는다.
- 같은 작품의 인물끼리는 의상 색이 겹치지 않게 미리 팔레트를 정한다.
- 겹치기 방식이면 `{표정 이름}`은 `neutral`로 고정하고, 얼굴은 표정 세트를 덧씌운다.

### 3.5 배경 CG

```
Background illustration for a visual novel, 16:9, {장소와 시대 묘사}.
Simple flat illustration style matching a minimal chibi mascot: clean shapes,
limited palette of {색 4~6개}, no characters, no text, soft even lighting,
no photorealism.
```

## 4. 생성 기록

이미지를 채택하면 같은 이름의 `.prompt.md`를 옆에 둔다. 다시 만들거나 의상을 추가할 때 그대로 쓰기 위해서다.

```
assets/portraits/elizabeth.png
assets/portraits/elizabeth.prompt.md   # 도구·모델 이름, 날짜, 전체 프롬프트, 첨부한 참조 이미지, 후처리 내용
```

팩의 `CREDITS.md`에는 "AI 이미지 생성(도구 이름)으로 제작, 프롬프트는 각 `.prompt.md` 참조"를 적는다. 유튜브 수익화 전에 사용한 생성 도구의 상업적 이용 조건을 확인한다.

## 5. 채택 체크리스트

- [ ] 기본형과 나란히 놓았을 때 몸 비율·얼굴·외곽선 굵기가 같다
- [ ] 얼굴 중심과 발밑 기준선이 규격과 같다(후처리 후 기준)
- [ ] 같은 작품의 다른 인물과 실루엣·색으로 구분된다
- [ ] 16×24로 줄였을 때도 인물이 구분된다(머리 모양·모자·주요 색)
- [ ] 기존 캐릭터·영상화 작품 의상과 닮지 않았다
- [ ] `.prompt.md`를 남겼다

## 6. 확정값 (디자인 확정 후 채움)

| 항목 | 값 |
|---|---|
| 마스코트 이름 | |
| 기본색 / 외곽선색 (HEX) | |
| 특징 요소 | |
| 얼굴 중심 좌표 | |
| 확정 기본형 이미지 | `packs/_shared/mascot/base.png` |
| 표정 세트 | `packs/_shared/mascot/faces/*.png` |
