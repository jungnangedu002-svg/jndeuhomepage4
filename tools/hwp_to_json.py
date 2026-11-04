#!/usr/bin/env python3
"""
가정통신문(HWP) → 반별 터미널 데이터(JSON) 변환기

사용법:
    pip install olefile
    python3 tools/hwp_to_json.py 가정통신문1.hwp 가정통신문2.hwp ...

결과는 data/<YYYY-MM>/<반ID>.json 으로 저장되고 data/index.json 이 갱신됩니다.
"""
import json, os, re, struct, sys, zlib
import olefile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# 반 이름 → (ID, 대표 색상)
CLASSES = {
    "자립지원1반": ("jarip1", "#2f7d5b"),
    "자립지원2반": ("jarip2", "#2b6cb0"),
    "직업지원반": ("jikup", "#b7791f"),
    "디자인아트반": ("design", "#b83280"),
    "레포츠문화반": ("leports", "#c05621"),
}
WEEKDAYS = ["월", "화", "수", "목", "금"]
DAY_COL = {"월": 1, "화": 2, "수": 3, "목": 4, "금": 6}  # 시간표 격자에서 요일을 대표하는 열


# ---------------------------------------------------------------- HWP 파싱
def _para_text(rec):
    out, j = "", 0
    while j < len(rec):
        c = struct.unpack_from("<H", rec, j)[0]
        if c < 32:
            if c in (10, 13):
                out += "\n"; j += 2
            elif c in (24, 30, 31):
                out += " "; j += 2
            else:  # 확장/인라인 컨트롤 문자는 8글자(16바이트)
                j += 16
        else:
            out += chr(c); j += 2
    return out


def read_hwp(path):
    """문단과 표(셀 위치·병합 정보 포함)를 순서대로 반환"""
    ole = olefile.OleFileIO(path)
    compressed = ole.openstream("FileHeader").read()[36] & 1
    blocks, stack = [], []

    def close():
        t = stack.pop()
        target = stack[-1]["cur"]["tables"] if stack and stack[-1]["cur"] else blocks
        target.append({"table": t["cells"]})

    sections = sorted((s for s in ole.listdir() if s[0] == "BodyText"), key=lambda s: int(s[1][7:]))
    for s in sections:
        data = ole.openstream(s).read()
        if compressed:
            data = zlib.decompress(data, -15)
        i = 0
        while i < len(data):
            h = struct.unpack_from("<I", data, i)[0]; i += 4
            tag, lv, sz = h & 0x3FF, (h >> 10) & 0x3FF, (h >> 20) & 0xFFF
            if sz == 0xFFF:
                sz = struct.unpack_from("<I", data, i)[0]; i += 4
            rec = data[i:i + sz]; i += sz
            while stack and lv <= stack[-1]["level"]:
                close()
            if tag == 71 and rec[:4][::-1] == b"tbl ":  # CTRL_HEADER(표)
                stack.append({"level": lv, "cells": [], "cur": None})
            elif tag == 72 and stack and lv == stack[-1]["level"] + 1:  # LIST_HEADER(셀)
                col, row, cs, rs = struct.unpack_from("<4H", rec, 8)
                cell = {"r": row, "c": col, "rs": rs, "cs": cs, "text": "", "tables": []}
                stack[-1]["cells"].append(cell); stack[-1]["cur"] = cell
            elif tag == 67:  # PARA_TEXT
                t = _para_text(rec).rstrip("\n")
                if stack and stack[-1]["cur"]:
                    cur = stack[-1]["cur"]
                    cur["text"] += ("\n" if cur["text"] else "") + t
                else:
                    blocks.append({"p": t})
    while stack:
        close()
    return blocks


# ---------------------------------------------------------------- 정리
def clean(s):
    s = re.sub("[-]", "", s)  # 한글 글머리표 등 사용자 정의 문자 제거
    return re.sub(r"[ \t]+", " ", s.replace("　", " ")).strip()


def split_activity(text):
    lines = [clean(l) for l in text.split("\n") if clean(l)]
    if not lines:
        return "", ""
    return lines[0], " ".join(lines[1:]).replace("( ", "(").strip()


def parse_timetable(cells, year, month):
    def at(r, c):
        for x in cells:
            if x["r"] <= r < x["r"] + x["rs"] and x["c"] <= c < x["c"] + x["cs"]:
                return x
        return None

    days = []
    header_rows = sorted({x["r"] for x in cells if clean(x["text"]) == "시 간"})
    for hr in header_rows:
        date_row = hr + 1
        period_rows = sorted({x["r"] for x in cells if x["c"] == 0 and x["r"] > date_row and x["r"] < hr + 8})
        for wd in WEEKDAYS:
            dc = at(date_row, DAY_COL[wd])
            if not dc or not clean(dc["text"]).isdigit():
                continue
            day = int(clean(dc["text"]))
            blocks, seen = [], set()
            for pr in period_rows:
                head = at(pr, 0)
                cell = at(pr, DAY_COL[wd])
                if not cell or not clean(cell["text"]):
                    continue
                hlines = [clean(l) for l in head["text"].split("\n") if clean(l)]
                label = hlines[0].replace(" ", "")
                times = re.findall(r"\d{1,2}:\d{2}", head["text"])
                key = id(cell)
                if key in seen:  # 세로 병합된 셀 → 이전 블록의 끝 시간 연장
                    blocks[-1]["end"] = times[-1] if times else blocks[-1]["end"]
                    blocks[-1]["label"] = blocks[-1]["label"].split("~")[0] + "~" + label
                    continue
                seen.add(key)
                cat, detail = split_activity(cell["text"])
                blocks.append({
                    "label": label,
                    "start": times[0] if times else "",
                    "end": times[-1] if times else "",
                    "category": cat,
                    "detail": detail,
                })
            for b in blocks:
                b["label"] = re.sub(r"(\d)교시~(\d)교시", r"\1~\2교시", b["label"])
            days.append({"date": f"{year}-{month:02d}-{day:02d}", "weekday": wd, "blocks": blocks})
    return days


def parse_grid(cells):
    rows = {}
    for x in cells:
        rows.setdefault(x["r"], {})[x["c"]] = x
    return rows, (lambda r, c: next((x for x in cells if x["r"] <= r < x["r"] + x["rs"] and x["c"] <= c < x["c"] + x["cs"]), None))


def parse_electives(cells):
    _, at = parse_grid(cells)
    nrows = max(x["r"] + x["rs"] for x in cells)
    ncols = max(x["c"] + x["cs"] for x in cells)
    dates = [clean(at(1, c)["text"]) for c in range(2, ncols)]
    groups = []
    for r in range(2, nrows):
        g = clean(at(r, 0)["text"].replace("\n", ""))
        name = clean(at(r, 1)["text"].replace("\n", " "))
        acts = [{"date": d, "text": clean(at(r, c)["text"].replace("\n", " ").replace("> :", "> ·").replace(">:", "> ·"))}
                for c, d in zip(range(2, ncols), dates)]
        if not groups or groups[-1]["group"] != g:
            groups.append({"group": g, "subjects": []})
        groups[-1]["subjects"].append({"name": name, "activities": acts})
    return {"dates": dates, "groups": groups}


def parse_outings(cells):
    _, at = parse_grid(cells)
    nrows = max(x["r"] + x["rs"] for x in cells)
    out = []
    for r in range(1, nrows):
        out.append({
            "program": clean(at(r, 0)["text"]),
            "date": clean(at(r, 1)["text"]),
            "place": clean(at(r, 2)["text"].replace("\n", " ")),
            "activity": clean(at(r, 3)["text"].replace("\n", " ")),
        })
    return out


def parse_contacts(line):
    line = re.sub(r"^.*?문의\s*", "", line)
    for name in CLASSES:
        line = line.replace(name, " ")
    line = line.replace("교사", " ").replace(",", " ")
    tokens = line.split()
    contacts = []
    for t in tokens:
        if re.fullmatch(r"[\d-]{9,}", t):
            if contacts and not contacts[-1]["phone"]:
                contacts[-1]["phone"] = t
        else:
            contacts.append({"name": t, "phone": ""})
    return contacts


def convert(path):
    blocks = read_hwp(path)
    paras = [b["p"] for b in blocks if "p" in b]
    tables = [b["table"] for b in blocks if "table" in b]

    title = next(clean(p) for p in paras if "가정통신문" in p)
    cname = next(n for n in CLASSES if n in title)
    cid, color = CLASSES[cname]
    period = clean(next(p for p in paras if "기" in p and "간" in p and "~" in p).split(":", 1)[1])
    m = re.search(r"(\d{4})\.(\d{1,2})\.", period)
    year, month = int(m.group(1)), int(m.group(2))

    # 본문 안내 섹션(제목 줄 다음에 '- '로 시작하는 본문)
    notices, i = [], 0
    while i < len(paras):
        p = clean(paras[i])
        if i + 1 < len(paras) and clean(paras[i + 1]).startswith("-") and p and not p.startswith("-"):
            notices.append({"title": p, "body": clean(paras[i + 1])[1:].strip()})
            i += 2
            continue
        i += 1
    greeting = next((n["body"] for n in notices if n["title"] == "인사말"), "")
    notices = [n for n in notices if n["title"] != "인사말"]

    fee_lines, collecting = [], False
    for p in paras:
        cp = clean(p)
        if "이용료 및 식대 안내" in cp:
            collecting = True; continue
        if collecting:
            if "문의" in cp:
                break
            if cp:
                fee_lines.append(cp.lstrip("* ").strip())
    contact_line = next((clean(p) for p in paras if "문의" in p and "070" in p), "")
    disclaimer = next((clean(p) for p in paras if "변경될 수 있음" in p), "")

    return cid, f"{year}-{month:02d}", {
        "id": cid,
        "name": cname,
        "color": color,
        "month": f"{year}-{month:02d}",
        "title": title,
        "period": period,
        "days": parse_timetable(tables[0], year, month),
        "electives": parse_electives(tables[1]) if len(tables) > 1 else None,
        "outings": parse_outings(tables[2]) if len(tables) > 2 else [],
        "greeting": greeting,
        "notices": notices,
        "fees": fee_lines,
        "contacts": parse_contacts(contact_line),
        "disclaimer": disclaimer.lstrip("※ ").strip(),
        "center": "중랑구발달장애인평생교육센터",
    }


def main(paths):
    index_path = os.path.join(DATA, "index.json")
    index = json.load(open(index_path, encoding="utf-8")) if os.path.exists(index_path) else {"months": {}}
    for p in paths:
        cid, month, data = convert(p)
        os.makedirs(os.path.join(DATA, month), exist_ok=True)
        with open(os.path.join(DATA, month, cid + ".json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        index["months"].setdefault(month, [])
        if cid not in index["months"][month]:
            index["months"][month].append(cid)
        print(f"✔ {data['name']} ({month}) → data/{month}/{cid}.json  [{len(data['days'])}일]")
    order = [v[0] for v in CLASSES.values()]
    for m in index["months"]:
        index["months"][m].sort(key=order.index)
    index["latest"] = max(index["months"])
    index["classes"] = [{"id": i, "name": n, "color": c} for n, (i, c) in CLASSES.items()]
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    main(sys.argv[1:])
