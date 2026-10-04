"""Offline, no-network deterministic tests for the authenticated Windows BLS collector."""
import os
import sys
import unittest
from unittest.mock import patch
from datetime import date, datetime
from calendar import monthrange
sys.path.insert(0, os.path.dirname(__file__))
import macro_sources as m

def rows(count=31):
    today = date.today()
    out = []
    for i in range(count):
        month = today.month - i - 1
        year = today.year
        while month <= 0:
            month += 12
            year -= 1
        out.append({"date": f"{year:04d}-{month:02d}-01", "value": float(100 + count - i)})
    return sorted(out, key=lambda x: x["date"])

def payload(series=m.BLS_TO_FRED):
    results=[]
    for id in series:
        raw=[]
        for x in rows():
            y,month,_ = x["date"].split("-")
            raw.append({"year": y,"period":"M"+month,"value":str(x["value"])})
        results.append({"seriesID":id,"data":raw})
    return {"status":"REQUEST_SUCCEEDED","Results":{"series":results}}

class MacroLocalTest(unittest.TestCase):
    def setUp(self):
        m._CACHE.update({"at":0,"payload":None})

    def test_authoritative_batch_parser(self):
        a=m._rows_bls(payload(),list(m.BLS_TO_FRED))
        self.assertEqual(len(a),3)
        self.assertTrue(all(len(v)==31 and m._recent(v) for v in a.values()))

    def test_bls_failure_no_fabricated_rows(self):
        with self.assertRaises(m.SourceError):
            m._rows_bls({"status":"REQUEST_NOT_PROCESSED","Results":{"series":[]}},list(m.BLS_TO_FRED))

    def test_full_direct_source(self):
        allrows={id:rows() for id in m.BLS_TO_FRED}
        with patch.object(m,"_post_bls",return_value=allrows):
            a=m.collect_macro_bls()
        self.assertTrue(a["complete"])
        self.assertEqual(a["available"],3)
        self.assertEqual(set(a["series"]),set(m.BLS_TO_FRED))
        self.assertTrue(all(v["kind"]=="DIRECT_BLS_VIA_LOCAL_BRIDGE" for v in a["sources"].values()))
        self.assertEqual(a["bridgeTransport"],"AUTHENTICATED_LOCAL_WINDOWS")

    def test_direct_failure_fred_secondary_with_provenance(self):
        with patch.object(m,"_post_bls",side_effect=m.SourceError("BLS_POST_DENIED")), \
             patch.object(m,"_get_bls",side_effect=m.SourceError("BLS_GET_DENIED")), \
             patch.object(m,"_get_fred",side_effect=lambda key:rows()):
            a=m.collect_macro_bls()
        self.assertTrue(a["complete"])
        self.assertIn("BLS_BATCH",a["errors"])
        self.assertTrue(all(v["kind"]=="FRED_BLS_ORIGIN_MIRROR_VIA_LOCAL_BRIDGE" for v in a["sources"].values()))

    def test_both_sources_fail_never_returns_fake_complete(self):
        with patch.object(m,"_post_bls",side_effect=m.SourceError("BLS_POST_DENIED")), \
             patch.object(m,"_get_bls",side_effect=m.SourceError("BLS_GET_DENIED")), \
             patch.object(m,"_get_fred",side_effect=m.SourceError("FRED_DENIED")):
            a=m.collect_macro_bls()
        self.assertFalse(a["complete"])
        self.assertEqual(a["available"],0)
        self.assertEqual(a["series"],{})

    def test_failure_cache_shorter_than_good_cache(self):
        with patch.object(m,"_post_bls",return_value={id:rows() for id in m.BLS_TO_FRED}) as source:
            m.collect_macro_bls()
            m.collect_macro_bls()
        self.assertEqual(source.call_count,1)

if __name__=="__main__":
    unittest.main()
