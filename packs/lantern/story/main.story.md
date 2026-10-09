@pack lantern "등대지기의 약속"
@player sora
@screen 480x270
@character sora "소라" art=base voice=sora
@character elder "촌장" art=base voice=elder
@character lamp "등대 불씨"
@character sign "안내판"
@flag met_elder
@flag lamp_lit
@flag ending_public
@flag ending_kept
@var trust 0

@location pier "선착장"
@layout
########################
#......................#
#......................#
#......................#
#.......e..............x
#......................#
#..s...................#
#......................#
#......................#
#......b...............#
#......................#
#......................#
#......................#
########################
@end
@anchor s = start
@anchor e = elder_spot
@anchor b = board
@anchor x = to_tower -> tower:entry

@location tower "등대"
@layout
################
#..............#
#..............#
#..............#
w..............#
#..............#
#......l.......#
#..............#
#..............#
#..............x
#..............#
#..............#
#..............#
################
@end
@anchor w = entry -> pier:to_tower
@anchor l = lamp_spot
@anchor x = to_garden -> garden:entry

@location garden "등대 뒤 마당"
@layout
########################
#......................#
#......................#
#......................#
#......................#
#......................#
#........c.............#
#......................#
#......................#
x......................#
#......................#
#......................#
#......................#
########################
@end
@anchor x = entry -> tower:to_garden
@anchor c = bench

@common relight
  @fade black 12
  @wait 12
  @fade clear 12
  : 소라가 심지를 정리하자 창 너머로 따뜻한 빛이 퍼졌다.
@end

@common public_ending
  촌장: 함께 지킬 사람이 생겼으니 이제 밤길이 덜 외롭겠구나.
  소라: 돌아가면 이웃들과 불을 지킬 순서를 정할게요.
  : 결말 — 함께 켜는 불. 선착장은 누구나 돌아올 수 있는 길이 되었다.
@end

@common kept_ending
  소라: 오늘 밤은 제가 남아 있을게요. 준비가 되면 다른 사람도 초대하고 싶어요.
  촌장: 서두르지 않아도 좋다. 약속을 지키는 첫날이니까.
  : 결말 — 오래 지키는 불. 한 사람의 작은 약속이 먼 바다까지 닿았다.
@end

## 1장. 돌아오는 길
### 안개 속 도착 @ pier
> 소라는 오래 꺼져 있던 등대를 찾아 선착장으로 돌아왔습니다.
@event arrival at start trigger=auto once
  : 등대지기의 약속
  소라: 불이 꺼진 뒤로 돌아오는 배들이 길을 잃었다고 들었어요.
  : 위쪽의 촌장을 바라보고 Enter 또는 Z로 대화하자. 오른쪽 금빛 문은 등대 입구다.
@end

### 촌장의 열쇠 @ pier
@film walkTo elder_spot
@event elder at elder_spot trigger=action character=elder
  촌장(의심): 오래 비워 둔 등대를 다시 켜겠다고? 누가 불을 지킬지 생각해 보았나?
  소라(결의): 우선 제가 불을 밝히고, 그다음 약속을 정하고 싶어요.
  ? 열쇠를 받으며 뭐라고 약속할까?
    *> 이웃들과 함께 지킬 방법을 찾는다
      @set met_elder
      @add trust 1
      촌장(부드러운 미소): 서로의 밤을 나누면 불도 오래 갈 게다.
    * 먼저 혼자 지킬 준비를 한다
      @set met_elder
      @sub trust 1
      촌장: 서두르지 말고 네가 감당할 수 있는 약속부터 시작하렴.
@page when=met_elder
  촌장(무표정): 열쇠는 받았지? 오른쪽 문 너머 등대 중앙의 노란 불씨를 살펴보렴.
@end

## 2장. 불씨와 약속
### 등대를 다시 켜다 @ tower
> 불을 켜는 일은 어렵지 않았습니다. 어려운 것은 그다음 밤을 맡기는 일이었지요.
@event light at lamp_spot trigger=action character=lamp
  @if met_elder
    @call relight
    @set lamp_lit
    소라: 이제 불빛이 보여요. 등대 뒤 마당에서 앞으로의 약속을 생각해 봐야겠어요.
  @else
    : 아직 열쇠가 없다. 선착장의 촌장에게 먼저 말을 걸자.
  @end
@page when=lamp_lit
  : 심지는 고르게 타고 있다. 오른쪽 아래 금빛 문으로 나가면 마당이다.
@end

### 밤을 맡길 사람 @ garden
@event conclusion at bench trigger=action character=sign
  @if lamp_lit
    소라: 불을 다시 켰어요. 이제 누구와 이 약속을 나눌까요?
    @if trust>=1
      : 촌장이 나눠 준 열쇠에는 여러 사람의 손때가 남아 있다.
    @else
      : 열쇠를 꼭 쥐니 오늘 밤의 책임이 손바닥에 남았다.
    @end
    ? 앞으로 등대를 어떻게 지킬까?
      *> 마을 사람들과 함께 지킨다
        @set ending_public
        @unset ending_kept
        @call public_ending
      * 당분간 소라가 남아 지킨다
        @set ending_kept
        @unset ending_public
        @call kept_ending
  @else
    : 등대는 아직 어둡다. 먼저 중앙의 불씨를 밝혀야 한다.
  @end
@page when=ending_public
  : 함께 켜는 불 — 여러 사람의 약속이 등대를 지킨다.
@page when=ending_kept
  : 오래 지키는 불 — 소라의 첫 약속이 등대를 지킨다.
@end

## 3장. 선착장의 기록
### 약속을 남기다 @ pier
@event record at board trigger=action character=sign
  @if any(ending_public,ending_kept)
    : 등대의 불은 다시 켜졌다. 선착장에는 오늘의 약속을 적은 쪽지가 걸렸다.
  @else
    : 선착장 안내 — 촌장에게 열쇠 받기, 등대 불씨 밝히기, 뒤 마당에서 약속 정하기.
  @end
  @cmd {"cmd":"save"}
  : 여정을 기록했다. 다음에는 이 자리에서 이어갈 수 있다.
@end
