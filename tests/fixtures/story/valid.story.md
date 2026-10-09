@pack lantern "등대지기의 약속"
@player sora
@screen 480x270
@character sora "소라" art=base voice=sora
@character elder "촌장" art=base voice=elder
@flag met_elder
@flag lamp_lit
@var trust 0

@location pier "선착장"
@layout
############
#..........#
#...e......x
#.s........#
############
@end
@anchor s = start
@anchor e = elder_spot
@anchor x = to_tower -> tower:w

@location tower "등대"
@layout
########
w......x
#..l...#
########
@end
@anchor w = entry -> pier:to_tower
@anchor l = lamp
@anchor x = exit -> garden:entry

@location garden "마당"
@layout
#######
x....s#
#######
@end
@anchor x = entry -> tower:exit
@anchor s = bench

@common light_room
  @fade black 30
  @wait 60
  @fade clear 30
  @shake
  : 잠시 바람이 잦아들었다.
@end

## 1장. 꺼진 불빛
### 촌장을 만나다 @ pier
> 안개 낀 선착장. 소라는 불이 꺼진 등대를 바라보았습니다.
@film pause 1.5
@film walkTo elder_spot
@event elder at elder_spot trigger=action character=elder wander=left,wait:60,right,wait:60
  촌장(의심): 등대 열쇠를 찾는다고? 자네가?
  소라(결의): 불을 다시 켜야 합니다.
  ? 뭐라고 답할까
    *> 사정을 말한다
      @set met_elder
      @add trust 1
      @if all(met_elder,any(trust>=1,!lamp_lit))
        촌장(부드러운 미소): 그렇다면 도와주지.
      @else
        @sub trust 1
        촌장(시큰둥): 조금 더 생각해 보게.
      @end
    * 돌아선다
      촌장(unimpressed): 마음대로 하게.
@page when=met_elder
  촌장(무표정): 열쇠는 탑 안에 있네.
@end

## 2장. 작은 불씨
### 불을 밝히다 @ tower
@event light at lamp trigger=auto once character=sora
  @move player up,up,wait:30,face:right
  @face this player
  @call light_room
  @if trust>=1
    @set lamp_lit
    소라(Soft Smile): 다시 빛이 보이네요.
  @else
    @unset lamp_lit
    : 아직 불씨가 약하다.
  @end
  @cmd {"cmd":"show_map_name"}
  @waitNarration
  @go garden:entry down
@end

## 3장. 밝아진 길
### 약속을 돌아보다 @ garden
> 불빛은 먼 길을 돌아오는 사람들의 길잡이가 되었습니다.
@waitNarration
@event rest at bench trigger=touch once
  소라(surprised): 마당에서도 불빛이 보여요.
  소라: 돌아가는 길을 잊지 않겠어요.
  @face player up
  @go pier:start
@end
