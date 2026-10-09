import importlib.util
import datetime as dt
import json
import hashlib
import hmac
import pathlib
import sqlite3
import sys
import tempfile
import unittest

MOD = pathlib.Path(__file__).resolve().parents[1] / "aat_gpt_review.py"
spec = importlib.util.spec_from_file_location("aat_gpt_review", MOD)
reviewer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reviewer)

def snapshot(mode="POST_OUTCOME",complete=18,validation=6):
    stamp=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(minutes=50)).isoformat()
    out={
        "project":"GF-AAT","source":"LOCAL_MT5_ARCHIVE","profile":"SWING",
        "symbol":"XAUUSD247","snapshotKind":mode,"canonicalEventId":"abc123def456ghi789",
        "publishedAtUTC":stamp,"brokerServer":"VantageMarkets-Live 3",
        "sourceIntegrity":"VERIFIED_CLOSED_CANDLE",
        "t0Evidence":{"timeframe":"H4","structure":{"trend":"BEARISH","boss":"NONE"},
           "invalidation":{"type":"SWING_HIGH","price":4200.0},"entry":{"price":4193}},
        "maturity":{"completed":complete,"validationCompleted":validation},
    }
    if mode=="POST_OUTCOME":
        out["outcome"]={"status":"SL","closedAtUTC":dt.datetime.now(dt.timezone.utc).isoformat()}
    raw=json.dumps(out,ensure_ascii=False,sort_keys=True,separators=(",",":"))
    out["signatureHmac"]=hmac.new(b"e"*48,raw.encode("utf-8"),hashlib.sha256).hexdigest()
    return out

def resign(payload):
    unsigned={k:v for k,v in payload.items() if k!="signatureHmac"}
    raw=json.dumps(unsigned,ensure_ascii=False,sort_keys=True,separators=(",",":"))
    payload["signatureHmac"]=hmac.new(b"e"*48,raw.encode("utf-8"),hashlib.sha256).hexdigest()
    return payload

def model_reply(decision="RECOMMEND_TEST"):
    review={"decision":decision,**{x:"Analisis profesional dengan bukti T0; ujian perlu." for x in reviewer.OUTPUT_FIELDS}}
    return {"output":[{"content":[{"type":"output_text","text":json.dumps(review)}]}]}

class IndependentReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.db=reviewer.open_private_db(pathlib.Path(self.tmp.name)/"aat_gpt_review.sqlite3")
        self.env={"AAT_GPT_ENABLED":"1","AAT_OPENAI_API_KEY":"sk-test-dummy-not-a-secret",
                  "AAT_GPT_MODEL":"gpt-6-sol","AAT_GPT_EVIDENCE_KEY":"e"*48}
        self.calls=[]
    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()
    def client(self,payload,key,model):
        self.calls.append({"payload":payload,"key":key,"model":model})
        return model_reply()
    def test_insufficient_sample_prevents_promotion_and_persists_separate_sqlite(self):
        r=reviewer.run_review(snapshot(),self.db,self.env,self.client)
        self.assertTrue(r["ok"]);self.assertEqual(r["review"]["decision"],"COLLECT_DATA")
        self.assertFalse(r["changesApplied"]);self.assertFalse(r["review"]["canEnter"])
        self.assertFalse(r["review"]["maturitySufficient"])
        self.assertEqual(self.db.execute("SELECT count(*) FROM gpt_review").fetchone()[0],1)
        self.assertEqual(len(self.calls),1)
        self.assertNotIn("goldflow",self.calls[0]["payload"]["input"][1]["content"].lower())
    def test_repeating_identical_evidence_is_idempotent_not_billable(self):
        snap=snapshot(mode="T0_DECISION")
        reviewer.run_review(snap,self.db,self.env,self.client)
        r=reviewer.run_review(snap,self.db,self.env,self.client)
        self.assertEqual(r["status"],"ALREADY_REVIEWED")
        self.assertEqual(len(self.calls),1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM gpt_review").fetchone()[0],1)
    def test_invalid_sources_cannot_enter_review(self):
        for wrong in [{"source":"GOLDFLOW"},{ "project":"GoldFlow"},
                      {"sourceIntegrity":"UNVERIFIED"},{ "profile":"UNKNOWN"},
                      {"brokerServer":""},{"canonicalEventId":"short"}]:
            snap=snapshot();snap.update(wrong)
            with self.assertRaises(ValueError):reviewer.check_snapshot(snap)
        self.assertEqual(len(self.calls),0)
    def test_future_outcome_does_not_modify_T0(self):
        snap=snapshot(mode="T0_DECISION");snap["outcome"]={"status":"SL"}
        with self.assertRaisesRegex(ValueError,"OUTCOME_CANNOT_REWRITE_T0"):
            reviewer.check_snapshot(snap)
    def test_unsigned_snapshot_cannot_reach_model(self):
        snap=snapshot();snap["signatureHmac"]="0"*64
        r=reviewer.run_review(snap,self.db,self.env,self.client)
        self.assertEqual(r["status"],"EVIDENCE_SIGNATURE_UNVERIFIED")
        self.assertEqual(len(self.calls),0)
    def test_no_real_gpt_call_when_disabled_or_missing_key(self):
        s=snapshot()
        x=reviewer.run_review(s,self.db,{**self.env,"AAT_GPT_ENABLED":"0"},self.client)
        y=reviewer.run_review(s,self.db,{"AAT_GPT_ENABLED":"1"},self.client)
        self.assertEqual(x["status"],"AI_DISABLED")
        self.assertEqual(y["status"],"AAT_OPENAI_KEY_MISSING")
        self.assertEqual(len(self.calls),0)
    def test_adequate_samples_allow_test_hypothesis_not_auto_change(self):
        r=reviewer.run_review(snapshot(complete=55,validation=18),self.db,self.env,self.client)
        self.assertTrue(r["review"]["maturitySufficient"])
        self.assertEqual(r["review"]["decision"],"RECOMMEND_TEST")
        self.assertFalse(r["review"]["changesApplied"])
        self.assertTrue(r["review"]["requiresValidation"])
    def test_dedicated_database_path_only(self):
        with self.assertRaisesRegex(ValueError,"DEDICATED_GPT_SQLITE_PATH_REQUIRED"):
            reviewer.open_private_db(pathlib.Path(self.tmp.name)/"aat.sqlite3")
    def test_no_account_or_secret_fields_permitted(self):
        s=snapshot();s["accountId"]="secret"
        with self.assertRaisesRegex(ValueError,"UNKNOWN_OR_POTENTIALLY_PRIVATE_FIELDS"):
            reviewer.check_snapshot(s)

if __name__=="__main__":
    unittest.main()
