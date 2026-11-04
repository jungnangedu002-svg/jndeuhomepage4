# 반별 터미널 · 중랑구발달장애인평생교육센터

반별 가정통신문(HWP)을 읽어 **반마다 하나씩 시간표 터미널 화면**을 보여주는 웹사이트입니다.
빌드 과정이 없는 정적 사이트라 Vercel에 그대로 배포됩니다.

## 화면 주소

| 반 | 주소 |
|---|---|
| 반 선택 | `/` |
| 자립지원1반 | `/#/jarip1` |
| 자립지원2반 | `/#/jarip2` |
| 직업지원반 | `/#/jikup` |
| 디자인아트반 | `/#/design` |
| 레포츠문화반 | `/#/leports` |

각 반 화면의 탭: **오늘**(지금 하는 활동·남은 시간·다음 활동) · **식단표**(그날 점심·이번 주 식단·알레르기·원산지) · **이번 주** · **이번 달** · **선택과목** · **외부활동** · **안내**(인사말·공지·이용료·담임 연락처)

- 시간은 한국 시간 기준으로 1초마다 갱신되고, 현재 교시가 자동으로 강조됩니다.
- 교실 태블릿/TV에 반 주소를 띄워 두고 **⛶ 전체화면** 버튼을 누르면 키오스크처럼 쓸 수 있습니다.
- 테스트용으로 시각을 고정하려면 `/?now=2026-11-04T11:20#/jarip1` 처럼 주소에 `now` 를 붙이세요.

## 다음 달 가정통신문 반영하기

```bash
pip install olefile
python3 tools/hwp_to_json.py 자립지원1반.hwp 자립지원2반.hwp 직업지원반.hwp 디자인아트반.hwp 레포츠문화반.hwp
```

식단표(엑셀)는 아래 명령으로 넣습니다.

```bash
pip install openpyxl
python3 tools/xlsx_menu_to_json.py 2026년_12월_식단표.xlsx
```

`data/<YYYY-MM>/<반ID>.json`, `data/<YYYY-MM>/menu.json` 이 만들어지고 `data/index.json` 의 `latest` 가 가장 최근 달로 바뀝니다.
커밋·푸시하면 Vercel이 자동으로 다시 배포합니다.

## Vercel 배포

1. https://vercel.com 에서 **Add New → Project** → 이 GitHub 저장소 선택
2. Framework Preset: **Other**, Build Command·Output Directory는 비워 둠
3. **Deploy**

## 구조

```
index.html          앱 진입점
assets/app.js       화면 로직 (라우팅, 시계, 현재 교시 계산)
assets/style.css    디자인 (태블릿·휴대폰 반응형, 다크모드)
data/               HWP에서 변환한 반별 데이터
tools/hwp_to_json.py HWP → JSON 변환기
tools/xlsx_menu_to_json.py 식단표 엑셀 → JSON 변환기
vercel.json         Vercel 설정
```
