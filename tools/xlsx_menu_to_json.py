#!/usr/bin/env python3
"""
월간 식단표(엑셀) → 식단표 탭 데이터(JSON) 변환기

사용법:
    pip install openpyxl
    python3 tools/xlsx_menu_to_json.py 2026년_11월_식단표.xlsx

첫 번째 시트(날짜·밥·알레르기·원산지가 있는 '월간 식단표')를 읽어
data/<YYYY-MM>/menu.json 으로 저장합니다.
"""
import datetime as dt
import json, os, re, sys
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROLES = ["메인", "반찬", "반찬", "김치", "국", "밥"]
DAY_COLS = ["B", "D", "F", "H", "J"]  # 월~금


def split_dish(text):
    text = re.sub(r"\s+", " ", str(text)).strip()
    m = re.search(r"\(([\d,\s]+)\)\s*$", text)
    allergens = [int(x) for x in m.group(1).split(",") if x.strip()] if m else []
    name = text[: m.start()].strip() if m else text
    return name, allergens


def convert(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    days = []
    for row in range(1, ws.max_row + 1):
        label = ws[f"A{row}"].value
        if not (isinstance(label, str) and re.fullmatch(r"\d주", label.strip())):
            continue
        for col in DAY_COLS:
            d = ws[f"{col}{row}"].value
            if not isinstance(d, (dt.datetime, dt.date)):
                continue
            items = []
            for k, role in enumerate(ROLES):
                v = ws[f"{col}{row + 1 + k}"].value
                if v is None or not str(v).strip():
                    continue
                name, allergens = split_dish(v)
                # '김치' 자리에 밥 종류가 들어간 날(예: 후리카게밥) 처리
                if role == "김치" and "김치" not in name and "깍두기" not in name:
                    role = "반찬"
                items.append({"role": role, "name": name, "allergens": allergens})
            days.append({"date": d.strftime("%Y-%m-%d"), "items": items})

    notes = {}
    for row in range(1, ws.max_row + 1):
        a = str(ws[f"A{row}"].value or "").replace("\n", "")
        if a in ("원산지표시", "알레르기정보"):
            notes[a] = re.sub(r"\s*\n\s*", " ", str(ws[f"B{row}"].value)).strip()
    allergen_names = {}
    parts = re.split(r"(?:^|,)\s*(\d+)\.", notes.get("알레르기정보", ""))
    for num, name in zip(parts[1::2], parts[2::2]):
        allergen_names[int(num)] = name.strip().rstrip(",")
    origin = [x.strip() for x in notes.get("원산지표시", "").split("/") if x.strip()]

    days.sort(key=lambda d: d["date"])
    month = days[0]["date"][:7]
    return month, {
        "month": month,
        "title": f"{int(month[:4])}년 {int(month[5:])}월 식단표",
        "days": days,
        "allergens": allergen_names,
        "origin": origin,
    }


def main(paths):
    for p in paths:
        month, data = convert(p)
        out = os.path.join(ROOT, "data", month, "menu.json")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        dishes = sorted({i["name"] for d in data["days"] for i in d["items"]})
        print(f"✔ {data['title']} → data/{month}/menu.json  [{len(data['days'])}일, 음식 {len(dishes)}가지]")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    main(sys.argv[1:])
