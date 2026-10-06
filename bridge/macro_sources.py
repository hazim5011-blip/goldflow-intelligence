"""Official BLS collection via the user's existing authenticated Windows MT5 tunnel.

This module uses only Python standard-library HTTP. URLs and series IDs are fixed,
never constructed from external user URLs. It does not access MT5, trades or accounts.
FRED is a labelled BLS-origin SECONDARY mirror if direct BLS fails from the PC too.
"""
from __future__ import annotations
import csv
import io
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from typing import Any

BLS_TO_FRED = {
    "CES0000000001": "PAYEMS",
    "LNS14000000": "UNRATE",
    "CUUR0000SA0": "CPIAUCNS",
}
MONTH_RE = re.compile(r"^M(0[1-9]|1[0-2])$")
CACHE_SECONDS = 600
ERROR_CACHE_SECONDS = 75
MAX_BYTES = 1_500_000
_LOCK = threading.Lock()
_CACHE: dict[str, Any] = {"at": 0.0, "payload": None}
_HEADERS = {
    "User-Agent": "GoldFlow-Macro-LocalBridge/1.0 (research)",
    "Accept": "application/json,text/csv,text/plain",
}

class SourceError(Exception):
    pass

def _fetch(url: str, body: bytes | None = None, content_type: str | None = None) -> bytes:
    headers = dict(_HEADERS)
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(url, data=body, headers=headers, method="POST" if body else "GET")
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            blob = response.read(MAX_BYTES + 1)
            if len(blob) > MAX_BYTES:
                raise SourceError("UPSTREAM_RESPONSE_TOO_LARGE")
            return blob
    except urllib.error.HTTPError as exc:
        raise SourceError(f"UPSTREAM_HTTP_{exc.code}") from exc
    except Exception as exc:
        if isinstance(exc, SourceError):
            raise
        raise SourceError("UPSTREAM_TRANSPORT_" + type(exc).__name__) from exc

def _rows_bls(payload: dict[str, Any], selected: list[str]) -> dict[str, list[dict[str, Any]]]:
    if payload.get("status") != "REQUEST_SUCCEEDED":
        raise SourceError("BLS_STATUS_" + str(payload.get("status", "UNKNOWN"))[:35])
    series = payload.get("Results", {}).get("series", [])
    if not isinstance(series, list):
        raise SourceError("BLS_MALFORMED_SERIES")
    out = {}
    for entry in series:
        key = entry.get("seriesID")
        if key not in selected or not isinstance(entry.get("data"), list):
            continue
        rows = []
        for row in entry["data"]:
            m = MONTH_RE.match(str(row.get("period", "")))
            if not m:
                continue
            try:
                yr = int(row["year"]); mm = int(m.group(1))
                val = float(str(row["value"]).replace(",", ""))
                if not (-1e9 < val < 1e9):
                    continue
                rows.append({"date": f"{yr:04d}-{mm:02d}-01", "value": val})
            except (TypeError, ValueError, OverflowError):
                continue
        rows = sorted({r["date"]: r for r in rows}.values(), key=lambda r: r["date"])
        if len(rows) >= 25:
            out[key] = rows
    return out

def _post_bls() -> dict[str, list[dict[str, Any]]]:
    year = datetime.now(timezone.utc).year
    body = json.dumps({"seriesid": list(BLS_TO_FRED), "startyear": str(year - 2),
                       "endyear": str(year)}).encode()
    raw = _fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", body, "application/json")
    return _rows_bls(json.loads(raw), list(BLS_TO_FRED))

def _get_bls(key: str) -> list[dict[str, Any]]:
    assert key in BLS_TO_FRED
    url = "https://api.bls.gov/publicAPI/v2/timeseries/data/" + key
    parsed = _rows_bls(json.loads(_fetch(url)), [key])
    if key not in parsed:
        raise SourceError("BLS_HISTORY_INCOMPLETE")
    return parsed[key]

def _get_fred(key: str) -> list[dict[str, Any]]:
    assert key in BLS_TO_FRED
    fred = BLS_TO_FRED[key]
    year = datetime.now(timezone.utc).year
    url = ("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" +
           urllib.parse.quote(fred) + "&cosd=" + str(year-4) + "-01-01")
    body = _fetch(url).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(body))
    if not reader.fieldnames or not {"observation_date", fred}.issubset(set(reader.fieldnames)) and not {"DATE", fred}.issubset(set(reader.fieldnames)):
        raise SourceError("FRED_CSV_HEADER_INVALID")
    rows = []
    for record in reader:
        raw_date = record.get("observation_date") or record.get("DATE") or ""
        if not re.match(r"^\d{4}-\d{2}-01$", raw_date):
            continue
        try:
            val = float(record[fred])
            if -1e9 < val < 1e9:
                rows.append({"date": raw_date, "value": val})
        except (TypeError, ValueError, OverflowError):
            continue
    rows = sorted({r["date"]: r for r in rows}.values(), key=lambda r: r["date"])
    if len(rows) < 25:
        raise SourceError("FRED_HISTORY_INCOMPLETE")
    return rows

def _recent(rows: list[dict[str, Any]]) -> bool:
    try:
        day = date.fromisoformat(rows[-1]["date"])
        return 0 <= (date.today() - day).days <= 81
    except (IndexError, KeyError, ValueError):
        return False

def _collect() -> dict[str, Any]:
    out: dict[str, Any] = {"ok": True, "version": 1, "bridgeTransport": "AUTHENTICATED_LOCAL_WINDOWS",
                          "series": {}, "sources": {}, "errors": {}, "fetchedAtUTC":
                          datetime.now(timezone.utc).isoformat()}
    try:
        all_rows = _post_bls()
    except Exception as exc:
        all_rows = {}
        out["errors"]["BLS_BATCH"] = str(exc)
    for k, rows in all_rows.items():
        if _recent(rows):
            out["series"][k] = rows
            out["sources"][k] = {"kind": "DIRECT_BLS_VIA_LOCAL_BRIDGE",
                                 "label": "BLS direct (Windows tunnel)",
                                 "seriesUrl": "https://api.bls.gov/publicAPI/v2/timeseries/data/" + k}
    missing = [k for k in BLS_TO_FRED if k not in out["series"]]
    if missing:
        with ThreadPoolExecutor(max_workers=3) as pool:
            direct = {k: pool.submit(_get_bls, k) for k in missing}
            for k, task in direct.items():
                try:
                    rows = task.result()
                    if not _recent(rows):
                        raise SourceError("BLS_SERIES_STALE")
                    out["series"][k] = rows
                    out["sources"][k] = {"kind": "DIRECT_BLS_VIA_LOCAL_BRIDGE",
                                         "label": "BLS direct (Windows tunnel)",
                                         "seriesUrl": "https://api.bls.gov/publicAPI/v2/timeseries/data/" + k}
                except Exception as exc:
                    out["errors"]["BLS_"+k] = str(exc)
    missing = [k for k in BLS_TO_FRED if k not in out["series"]]
    if missing:
        with ThreadPoolExecutor(max_workers=3) as pool:
            mirror = {k: pool.submit(_get_fred, k) for k in missing}
            for k, task in mirror.items():
                try:
                    rows = task.result()
                    if not _recent(rows):
                        raise SourceError("FRED_SERIES_STALE")
                    out["series"][k] = rows
                    out["sources"][k] = {"kind": "FRED_BLS_ORIGIN_MIRROR_VIA_LOCAL_BRIDGE",
                                         "label": "FRED BLS-origin (Windows tunnel, SECONDARY)",
                                         "fredId": BLS_TO_FRED[k],
                                         "seriesUrl": "https://fred.stlouisfed.org/series/" + BLS_TO_FRED[k]}
                except Exception as exc:
                    out["errors"]["FRED_"+k] = str(exc)
    out["available"] = len(out["series"])
    out["complete"] = len(out["series"]) == len(BLS_TO_FRED)
    return out

def collect_macro_bls() -> dict[str, Any]:
    """Cache successful snapshots for 10m, incomplete snapshots briefly (75s)."""
    with _LOCK:
        age = time.monotonic() - _CACHE["at"]
        old = _CACHE["payload"]
        if old is not None and age < (CACHE_SECONDS if old["complete"] else ERROR_CACHE_SECONDS):
            return old
        result = _collect()
        _CACHE.update({"at": time.monotonic(), "payload": result})
        return result
