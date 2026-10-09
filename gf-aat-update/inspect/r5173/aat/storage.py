"""Independent long-term database: WAL, idempotent backfill and append-only audit.

Candle conflicts are quarantined rather than silently rewritten. Every research
signal carries its observed data cutoff, algorithm version and hash-linked events.
Local SQLite is durable on disk only: back it up, move to managed D1/R2 in later phase.
"""
import sqlite3, json, hashlib, time, threading
from pathlib import Path
from dataclasses import asdict
from contextlib import contextmanager
from .models import Candle

SCHEMA='''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS candles(
 broker TEXT NOT NULL,symbol TEXT NOT NULL,tf TEXT NOT NULL,t INTEGER NOT NULL,
 o REAL NOT NULL,h REAL NOT NULL,l REAL NOT NULL,c REAL NOT NULL,v REAL NOT NULL,
 source TEXT NOT NULL,first_seen_utc INTEGER NOT NULL,digest TEXT NOT NULL,
 PRIMARY KEY(broker,symbol,tf,t));
CREATE INDEX IF NOT EXISTS candle_tail ON candles(symbol,tf,t DESC);
CREATE TABLE IF NOT EXISTS candle_conflicts(
 id INTEGER PRIMARY KEY AUTOINCREMENT,broker TEXT,symbol TEXT,tf TEXT,t INTEGER,
 old_digest TEXT,new_digest TEXT,source TEXT,observed_at_utc INTEGER,
 proposed_payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observations(
 id TEXT PRIMARY KEY,kind TEXT NOT NULL,subject TEXT NOT NULL,
 source_name TEXT NOT NULL,source_url TEXT,source_published_utc INTEGER,
 first_seen_utc INTEGER NOT NULL,payload_json TEXT NOT NULL,payload_sha256 TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS signals(
 id TEXT PRIMARY KEY,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,
 algo_version TEXT NOT NULL,origin_candle_open_utc INTEGER NOT NULL,
 created_at_utc INTEGER NOT NULL,side TEXT NOT NULL,entry_low REAL NOT NULL,entry_high REAL NOT NULL,
 sl REAL NOT NULL,tp1 REAL NOT NULL,tp2 REAL NOT NULL,tp3 REAL NOT NULL,
 expires_at_utc INTEGER NOT NULL,initial_state TEXT NOT NULL,reason_json TEXT NOT NULL,
 evidence_json TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS unique_signal_origin ON signals(broker,symbol,profile,origin_candle_open_utc,algo_version);
CREATE TABLE IF NOT EXISTS events(
 id INTEGER PRIMARY KEY AUTOINCREMENT,signal_id TEXT NOT NULL REFERENCES signals(id),
 sequence INTEGER NOT NULL,created_at_utc INTEGER NOT NULL,event_type TEXT NOT NULL,
 from_state TEXT,to_state TEXT NOT NULL,reason TEXT NOT NULL,
 evidence_json TEXT NOT NULL,prev_hash TEXT NOT NULL,event_hash TEXT NOT NULL,
 UNIQUE(signal_id,sequence));
CREATE INDEX IF NOT EXISTS events_signal_time ON events(signal_id,created_at_utc);
CREATE TABLE IF NOT EXISTS research_runs(
 id TEXT PRIMARY KEY,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,
 algo_version TEXT NOT NULL,analyzed_candle_open_utc INTEGER NOT NULL,
 analyzed_at_utc INTEGER NOT NULL,status TEXT NOT NULL,side TEXT,score INTEGER,
 source_mode TEXT NOT NULL,features_json TEXT NOT NULL,features_hash TEXT NOT NULL,
 UNIQUE(broker,symbol,profile,analyzed_candle_open_utc,algo_version));
CREATE INDEX IF NOT EXISTS research_recent ON research_runs(symbol,profile,analyzed_at_utc DESC);
CREATE TABLE IF NOT EXISTS observer_checkpoints(
 broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,algo_version TEXT NOT NULL,
 last_candle_open_utc INTEGER NOT NULL,processed_at_utc INTEGER NOT NULL,
 stage TEXT NOT NULL,PRIMARY KEY(broker,symbol,profile,algo_version));
CREATE INDEX IF NOT EXISTS observer_profile ON observer_checkpoints(profile,processed_at_utc DESC);
CREATE TABLE IF NOT EXISTS behaviour_reviews(
 id INTEGER PRIMARY KEY AUTOINCREMENT,signal_id TEXT NOT NULL REFERENCES signals(id),
 candle_open_utc INTEGER NOT NULL,observed_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,
 evidence_json TEXT NOT NULL,evidence_hash TEXT NOT NULL,
 UNIQUE(signal_id,candle_open_utc,algorithm));
CREATE INDEX IF NOT EXISTS behaviour_recent ON behaviour_reviews(signal_id,observed_at_utc DESC);
CREATE TABLE IF NOT EXISTS forensic_cases(
 id TEXT PRIMARY KEY,broker TEXT NOT NULL,symbol TEXT NOT NULL,tf TEXT NOT NULL,
 candle_open_utc INTEGER NOT NULL,analyzed_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,classification TEXT NOT NULL,
 evidence_json TEXT NOT NULL,evidence_sha256 TEXT NOT NULL,
 UNIQUE(broker,symbol,tf,candle_open_utc,algorithm));
CREATE INDEX IF NOT EXISTS forensic_recent ON forensic_cases(symbol,analyzed_at_utc DESC);
CREATE TABLE IF NOT EXISTS ingestion_runs(
 id INTEGER PRIMARY KEY AUTOINCREMENT,source TEXT,broker TEXT,symbol TEXT,tf TEXT,started_at_utc INTEGER,
 finished_at_utc INTEGER,received INTEGER,inserted INTEGER,conflicts INTEGER,skipped_open INTEGER,error_code TEXT);
CREATE TABLE IF NOT EXISTS intelligence_snapshots(
 id TEXT PRIMARY KEY,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,
 candle_open_utc INTEGER NOT NULL,analyzed_at_utc INTEGER NOT NULL,algorithm TEXT NOT NULL,
 payload_json TEXT NOT NULL,payload_sha256 TEXT NOT NULL,
 UNIQUE(broker,symbol,profile,candle_open_utc,algorithm));
CREATE INDEX IF NOT EXISTS intelligence_recent ON intelligence_snapshots(symbol,profile,analyzed_at_utc DESC);
CREATE TABLE IF NOT EXISTS market_events(
 id TEXT PRIMARY KEY,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,tf TEXT NOT NULL,
 candle_open_utc INTEGER NOT NULL,observed_at_utc INTEGER NOT NULL,algorithm TEXT NOT NULL,
 classification TEXT NOT NULL,event_types_json TEXT NOT NULL,evidence_json TEXT NOT NULL,evidence_sha256 TEXT NOT NULL,
 UNIQUE(broker,symbol,profile,tf,candle_open_utc,algorithm));
CREATE INDEX IF NOT EXISTS market_events_recent ON market_events(symbol,profile,observed_at_utc DESC);
CREATE TABLE IF NOT EXISTS learning_cases(
 id TEXT PRIMARY KEY,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,tf TEXT NOT NULL,
 source_event_id TEXT NOT NULL,source_candle_open_utc INTEGER NOT NULL,created_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,thesis TEXT NOT NULL,origin_close REAL NOT NULL,origin_atr REAL NOT NULL,
 context_json TEXT NOT NULL,context_sha256 TEXT NOT NULL,status TEXT NOT NULL,
 UNIQUE(source_event_id,algorithm));
CREATE INDEX IF NOT EXISTS learning_case_recent ON learning_cases(symbol,profile,created_at_utc DESC);
CREATE TABLE IF NOT EXISTS learning_followups(
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES learning_cases(id),horizon_bars INTEGER NOT NULL,
 target_candle_open_utc INTEGER NOT NULL,observed_at_utc INTEGER NOT NULL,algorithm TEXT NOT NULL,
 observation_mode TEXT NOT NULL,outcome TEXT NOT NULL,metrics_json TEXT NOT NULL,metrics_sha256 TEXT NOT NULL,
 UNIQUE(case_id,horizon_bars,algorithm));
CREATE INDEX IF NOT EXISTS learning_followup_recent ON learning_followups(case_id,horizon_bars);
CREATE TABLE IF NOT EXISTS self_reviews(
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES learning_cases(id),created_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,review_status TEXT NOT NULL,initial_thesis TEXT NOT NULL,final_outcome TEXT NOT NULL,
 analysis_json TEXT NOT NULL,analysis_sha256 TEXT NOT NULL,
 UNIQUE(case_id,algorithm));
CREATE INDEX IF NOT EXISTS self_review_recent ON self_reviews(created_at_utc DESC);
CREATE TABLE IF NOT EXISTS signal_self_reviews(
 id TEXT PRIMARY KEY,signal_id TEXT NOT NULL REFERENCES signals(id),created_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,result_status TEXT NOT NULL,playbook TEXT,failure_fingerprint TEXT NOT NULL,
 review_json TEXT NOT NULL,review_sha256 TEXT NOT NULL,
 UNIQUE(signal_id,algorithm));
CREATE INDEX IF NOT EXISTS signal_self_review_recent ON signal_self_reviews(created_at_utc DESC);
CREATE TABLE IF NOT EXISTS mentor_updates(
 id TEXT PRIMARY KEY,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,tf TEXT NOT NULL,
 candle_open_utc INTEGER NOT NULL,created_at_utc INTEGER NOT NULL,algorithm TEXT NOT NULL,
 posture TEXT NOT NULL,bias TEXT NOT NULL,headline TEXT NOT NULL,
 detail_json TEXT NOT NULL,detail_sha256 TEXT NOT NULL,
 UNIQUE(broker,symbol,profile,tf,candle_open_utc,algorithm));
CREATE INDEX IF NOT EXISTS mentor_update_recent ON mentor_updates(symbol,profile,created_at_utc DESC);
CREATE TABLE IF NOT EXISTS autonomous_mentor_updates(
 id TEXT PRIMARY KEY,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,tf TEXT NOT NULL,
 candle_open_utc INTEGER NOT NULL,created_at_utc INTEGER NOT NULL,algorithm TEXT NOT NULL,
 trigger_types_json TEXT NOT NULL,state_fingerprint TEXT NOT NULL,previous_state_fingerprint TEXT,
 headline TEXT NOT NULL,detail_json TEXT NOT NULL,detail_sha256 TEXT NOT NULL,
 UNIQUE(broker,symbol,profile,algorithm,state_fingerprint));
CREATE INDEX IF NOT EXISTS autonomous_mentor_recent ON autonomous_mentor_updates(symbol,profile,created_at_utc DESC);
CREATE TABLE IF NOT EXISTS scalping_opportunities(
 id TEXT PRIMARY KEY,broker TEXT NOT NULL,symbol TEXT NOT NULL,campaign_id TEXT NOT NULL,
 candle_open_utc INTEGER NOT NULL,observed_at_utc INTEGER NOT NULL,algorithm TEXT NOT NULL,
 side TEXT NOT NULL,setup_type TEXT NOT NULL,grade TEXT NOT NULL,score INTEGER NOT NULL,
 status TEXT NOT NULL,detail_json TEXT NOT NULL,detail_sha256 TEXT NOT NULL,
 UNIQUE(broker,symbol,candle_open_utc,algorithm));
CREATE INDEX IF NOT EXISTS scalping_opportunity_recent ON scalping_opportunities(symbol,observed_at_utc DESC);
CREATE INDEX IF NOT EXISTS scalping_campaign_recent ON scalping_opportunities(campaign_id,observed_at_utc DESC);
CREATE TABLE IF NOT EXISTS observation_receipts(
 id TEXT PRIMARY KEY,observation_id TEXT NOT NULL REFERENCES observations(id),
 retrieved_at_utc INTEGER NOT NULL,transport TEXT NOT NULL,
 meta_json TEXT NOT NULL,meta_sha256 TEXT NOT NULL,
 UNIQUE(observation_id,retrieved_at_utc,transport));
CREATE INDEX IF NOT EXISTS observation_receipt_recent ON observation_receipts(observation_id,retrieved_at_utc DESC);
CREATE TABLE IF NOT EXISTS clock_repair_audit(
 id TEXT PRIMARY KEY,performed_at_utc INTEGER NOT NULL,broker TEXT NOT NULL,symbol TEXT NOT NULL,tf TEXT NOT NULL,
 original_t INTEGER NOT NULL,corrected_t INTEGER NOT NULL,offset_seconds INTEGER NOT NULL,action TEXT NOT NULL,
 original_payload_json TEXT NOT NULL,original_sha256 TEXT NOT NULL,corrected_digest TEXT,target_digest TEXT);
CREATE INDEX IF NOT EXISTS clock_repair_recent ON clock_repair_audit(performed_at_utc DESC);
CREATE TABLE IF NOT EXISTS knowledge_candidates(
 id TEXT PRIMARY KEY,topic TEXT NOT NULL,query TEXT NOT NULL,source_origin TEXT NOT NULL,
 created_at_utc INTEGER NOT NULL,updated_at_utc INTEGER NOT NULL,last_scout_utc INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL,hypothesis_json TEXT NOT NULL,hypothesis_sha256 TEXT NOT NULL,
 active_rule INTEGER NOT NULL DEFAULT 0,UNIQUE(topic,query));
CREATE INDEX IF NOT EXISTS knowledge_candidate_scout ON knowledge_candidates(last_scout_utc ASC,updated_at_utc ASC);
CREATE TABLE IF NOT EXISTS knowledge_sources(
 id TEXT PRIMARY KEY,candidate_id TEXT NOT NULL REFERENCES knowledge_candidates(id),
 source_family TEXT NOT NULL,source_key TEXT NOT NULL,title TEXT NOT NULL,publisher TEXT,doi TEXT,source_url TEXT,
 source_published_utc INTEGER,retrieved_at_utc INTEGER NOT NULL,payload_json TEXT NOT NULL,payload_sha256 TEXT NOT NULL,
 UNIQUE(candidate_id,source_family,source_key));
CREATE INDEX IF NOT EXISTS knowledge_source_candidate ON knowledge_sources(candidate_id,retrieved_at_utc DESC);
CREATE TABLE IF NOT EXISTS knowledge_scout_runs(
 id TEXT PRIMARY KEY,started_at_utc INTEGER NOT NULL,finished_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,report_json TEXT NOT NULL,report_sha256 TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS knowledge_scout_recent ON knowledge_scout_runs(started_at_utc DESC);
CREATE TABLE IF NOT EXISTS pattern_observations(
 id TEXT PRIMARY KEY,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,tf TEXT NOT NULL,
 candle_open_utc INTEGER NOT NULL,observed_at_utc INTEGER NOT NULL,algorithm TEXT NOT NULL,
 playbook TEXT,side TEXT,patterns_json TEXT NOT NULL,context_json TEXT NOT NULL,payload_sha256 TEXT NOT NULL,
 UNIQUE(broker,symbol,profile,tf,candle_open_utc,algorithm));
CREATE INDEX IF NOT EXISTS pattern_observation_recent ON pattern_observations(symbol,profile,observed_at_utc DESC);
CREATE TABLE IF NOT EXISTS closed_loop_reviews(
 id TEXT PRIMARY KEY,signal_id TEXT NOT NULL REFERENCES signals(id),created_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,result_status TEXT NOT NULL,result_bucket TEXT NOT NULL,playbook TEXT NOT NULL,
 review_json TEXT NOT NULL,review_sha256 TEXT NOT NULL,UNIQUE(signal_id,algorithm));
CREATE INDEX IF NOT EXISTS closed_loop_review_recent ON closed_loop_reviews(created_at_utc DESC);
CREATE TABLE IF NOT EXISTS lesson_evidence(
 id TEXT PRIMARY KEY,source_kind TEXT NOT NULL,source_id TEXT NOT NULL,created_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,tf TEXT NOT NULL,playbook TEXT NOT NULL,
 lesson_code TEXT NOT NULL,lesson_json TEXT NOT NULL,lesson_sha256 TEXT NOT NULL,
 UNIQUE(source_kind,source_id,algorithm,lesson_code));
CREATE INDEX IF NOT EXISTS lesson_evidence_recent ON lesson_evidence(profile,created_at_utc DESC);
CREATE INDEX IF NOT EXISTS lesson_evidence_context ON lesson_evidence(profile,playbook,lesson_code);
CREATE TABLE IF NOT EXISTS publication_rejections(
 id TEXT PRIMARY KEY,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,tf TEXT NOT NULL,
 origin_candle_open_utc INTEGER NOT NULL,recorded_at_utc INTEGER NOT NULL,algorithm TEXT NOT NULL,playbook TEXT NOT NULL,
 detail_json TEXT NOT NULL,detail_sha256 TEXT NOT NULL,
 UNIQUE(broker,symbol,profile,origin_candle_open_utc,algorithm));
CREATE INDEX IF NOT EXISTS publication_rejection_recent ON publication_rejections(profile,recorded_at_utc DESC);
CREATE TABLE IF NOT EXISTS missed_opportunity_reviews(
 id TEXT PRIMARY KEY,rejection_id TEXT NOT NULL REFERENCES publication_rejections(id),created_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,classification TEXT NOT NULL,review_json TEXT NOT NULL,review_sha256 TEXT NOT NULL,
 UNIQUE(rejection_id,algorithm));
CREATE INDEX IF NOT EXISTS missed_opportunity_recent ON missed_opportunity_reviews(created_at_utc DESC);
CREATE TABLE IF NOT EXISTS correction_trials(
 id TEXT PRIMARY KEY,signal_id TEXT NOT NULL REFERENCES signals(id),prior_signal_id TEXT NOT NULL REFERENCES signals(id),
 recorded_at_utc INTEGER NOT NULL,algorithm TEXT NOT NULL,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,
 tf TEXT NOT NULL,playbook TEXT NOT NULL,lesson_code TEXT NOT NULL,detail_json TEXT NOT NULL,detail_sha256 TEXT NOT NULL,
 UNIQUE(signal_id,algorithm,lesson_code,prior_signal_id));
CREATE INDEX IF NOT EXISTS correction_trial_recent ON correction_trials(profile,recorded_at_utc DESC);
CREATE INDEX IF NOT EXISTS correction_trial_context ON correction_trials(profile,playbook,lesson_code);
CREATE TABLE IF NOT EXISTS correction_effectiveness_reviews(
 id TEXT PRIMARY KEY,trial_id TEXT NOT NULL REFERENCES correction_trials(id),created_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,result_status TEXT NOT NULL,result_bucket TEXT NOT NULL,classification TEXT NOT NULL,
 review_json TEXT NOT NULL,review_sha256 TEXT NOT NULL,UNIQUE(trial_id,algorithm));
CREATE INDEX IF NOT EXISTS correction_effectiveness_recent ON correction_effectiveness_reviews(created_at_utc DESC);
CREATE TABLE IF NOT EXISTS technical_evidence_trials(
 id TEXT PRIMARY KEY,signal_id TEXT NOT NULL REFERENCES signals(id),recorded_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,broker TEXT NOT NULL,symbol TEXT NOT NULL,profile TEXT NOT NULL,tf TEXT NOT NULL,
 playbook TEXT NOT NULL,side TEXT NOT NULL,detail_json TEXT NOT NULL,detail_sha256 TEXT NOT NULL,
 UNIQUE(signal_id,algorithm));
CREATE INDEX IF NOT EXISTS technical_evidence_trial_recent ON technical_evidence_trials(profile,recorded_at_utc DESC);
CREATE INDEX IF NOT EXISTS technical_evidence_trial_context ON technical_evidence_trials(profile,playbook);
CREATE TABLE IF NOT EXISTS technical_evidence_outcomes(
 id TEXT PRIMARY KEY,trial_id TEXT NOT NULL REFERENCES technical_evidence_trials(id),created_at_utc INTEGER NOT NULL,
 algorithm TEXT NOT NULL,result_status TEXT NOT NULL,result_bucket TEXT NOT NULL,
 review_json TEXT NOT NULL,review_sha256 TEXT NOT NULL,UNIQUE(trial_id,algorithm));
CREATE INDEX IF NOT EXISTS technical_evidence_outcome_recent ON technical_evidence_outcomes(created_at_utc DESC);
'''

class Store:
    """SQLite store with one connection per Python thread.

    FastAPI executes synchronous handlers in a worker-thread pool.  A single
    process-wide sqlite3.Connection, even with ``check_same_thread=False``, can
    still be entered concurrently by different request workers and produce
    intermittent HTTP 500 errors (transaction overlap / recursive connection
    use).  V1.6.2 R4 keeps the same database file and WAL durability model but
    gives each thread its own connection.  Separate GF-AAT processes continue
    to coordinate through SQLite WAL + busy_timeout.
    """
    def __init__(self,path:Path):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
        self._local=threading.local()
        # Initialize schema/WAL once on the creating thread.  Future request
        # threads lazily receive their own connection via the db property.
        con=self._new_connection()
        con.execute('PRAGMA journal_mode=WAL')
        con.executescript(SCHEMA)
        self._local.db=con

    def _new_connection(self):
        con=sqlite3.connect(str(self.path),timeout=30,isolation_level=None,check_same_thread=False)
        con.row_factory=sqlite3.Row
        con.execute('PRAGMA foreign_keys=ON')
        con.execute('PRAGMA busy_timeout=30000')
        return con

    @property
    def db(self):
        con=getattr(self._local,'db',None)
        if con is None:
            con=self._new_connection();self._local.db=con
        return con

    @contextmanager
    def transaction(self):
        con=self.db
        con.execute('BEGIN IMMEDIATE')
        try:
            yield con
            con.execute('COMMIT')
        except Exception:
            try:con.execute('ROLLBACK')
            except sqlite3.Error:pass
            raise

    def close(self):
        con=getattr(self._local,'db',None)
        if con is not None:
            con.close();self._local.db=None

    def save_candles(self,candles:list[Candle]):
        inserted=conflicts=duplicates=0
        with self.transaction() as con:
            for c in candles:
                c.validate()
                old=con.execute('SELECT digest FROM candles WHERE broker=? AND symbol=? AND tf=? AND t=?',
                                (c.broker,c.symbol,c.tf,c.t)).fetchone()
                digest=c.digest()
                if old:
                    if old['digest']!=digest:
                        conflicts+=1
                        con.execute('INSERT INTO candle_conflicts(broker,symbol,tf,t,old_digest,new_digest,source,observed_at_utc,proposed_payload) VALUES(?,?,?,?,?,?,?,?,?)',
                            (c.broker,c.symbol,c.tf,c.t,old['digest'],digest,c.source,c.first_seen_utc,json.dumps(asdict(c),sort_keys=True)))
                    else:duplicates+=1
                    continue
                con.execute('INSERT INTO candles VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                    (c.broker,c.symbol,c.tf,c.t,c.o,c.h,c.l,c.c,c.v,c.source,c.first_seen_utc,digest));inserted+=1
        return {'inserted':inserted,'duplicates':duplicates,'conflicts':conflicts}

    def candles(self,broker,symbol,tf,limit=1000,as_of=None):
        q='SELECT * FROM candles WHERE broker=? AND symbol=? AND tf=?'
        args=[broker,symbol,tf]
        if as_of is not None:q+=' AND first_seen_utc<=?';args.append(as_of)
        q+=' ORDER BY t DESC LIMIT ?';args.append(limit)
        rows=self.db.execute(q,args).fetchall()
        return [Candle(**{x:r[x] for x in ('broker','symbol','tf','t','o','h','l','c','v','source','first_seen_utc')}) for r in reversed(rows)]

    def history_at(self,broker,symbol,tf,asof,limit=500,forward_only=False):
        from .settings import TF_SECONDS
        if tf not in TF_SECONDS:raise ValueError('Unknown TF')
        q='SELECT * FROM candles WHERE broker=? AND symbol=? AND tf=? AND t+?<=?'
        args=[broker,symbol,tf,TF_SECONDS[tf],int(asof)]
        if forward_only:q+=' AND first_seen_utc<=?';args.append(int(asof))
        q+=' ORDER BY t DESC LIMIT ?';args.append(int(limit))
        rows=self.db.execute(q,args).fetchall()
        return [Candle(**{x:r[x] for x in ('broker','symbol','tf','t','o','h','l','c','v','source','first_seen_utc')}) for r in reversed(rows)]

    def latest(self,broker,symbol,tf):
        x=self.db.execute('SELECT MAX(t) AS t,COUNT(*) AS n FROM candles WHERE broker=? AND symbol=? AND tf=?',(broker,symbol,tf)).fetchone()
        return {'last_open_utc':x['t'],'total':x['n']}

    def save_observation(self,kind,subject,source_name,payload,observed_at=None,published_at=None,source_url=None,
                         retrieved_at=None,transport='DIRECT_COLLECTOR',retrieval_meta=None):
        if kind not in ('NEWS','MACRO','MARKET_CONTEXT'):raise ValueError('Invalid observation kind')
        if not source_name or not subject or not isinstance(payload,dict):raise ValueError('Source and subject required')
        seen=int(time.time()) if observed_at is None else int(observed_at)
        retrieved=seen if retrieved_at is None else int(retrieved_at)
        if retrieved<seen:raise ValueError('Retrieval cannot predate first observation supplied to this receipt')
        if published_at is not None and int(published_at)>seen+300:raise ValueError('Publication is from the future')
        raw=json.dumps(payload,sort_keys=True,separators=(',',':'),ensure_ascii=False)
        h=hashlib.sha256(raw.encode()).hexdigest();oid=hashlib.sha256((kind+'|'+subject+'|'+source_name+'|'+str(published_at)+'|'+h).encode()).hexdigest()[:32]
        meta={'transport':transport,'retrieval_meta':retrieval_meta or {},'observation_payload_sha256':h}
        mraw=json.dumps(meta,sort_keys=True,separators=(',',':'),default=str);mh=hashlib.sha256(mraw.encode()).hexdigest()
        rid=hashlib.sha256(f"{oid}|{retrieved}|{transport}|{mh}".encode()).hexdigest()[:32]
        with self.transaction() as con:
            con.execute('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?,?,?,?)',
              (oid,kind,subject,source_name,source_url,published_at,seen,raw,h))
            con.execute('''INSERT OR IGNORE INTO observation_receipts(
              id,observation_id,retrieved_at_utc,transport,meta_json,meta_sha256) VALUES(?,?,?,?,?,?)''',
              (rid,oid,retrieved,str(transport or 'UNKNOWN'),mraw,mh))
        return oid

    def observations(self,as_of,kind=None,limit=50):
        q='SELECT * FROM observations WHERE first_seen_utc<=?';args=[as_of]
        if kind:q+=' AND kind=?';args.append(kind)
        q+=' ORDER BY first_seen_utc DESC LIMIT ?';args.append(limit)
        return [{**dict(x),'payload':json.loads(x['payload_json'])} for x in self.db.execute(q,args).fetchall()]

    def observation_receipts(self,observation_id,as_of=None,limit=50):
        """Return append-only retrieval receipts without rewriting legacy rows.

        Older databases can contain NULL/invalid receipt metadata even though the
        current schema requires TEXT.  Such rows are historical evidence, so they
        are surfaced as legacy/invalid metadata instead of being deleted, repaired
        in place, or allowed to crash the decision/readiness API.
        """
        q='SELECT * FROM observation_receipts WHERE observation_id=?';args=[observation_id]
        if as_of is not None:q+=' AND retrieved_at_utc<=?';args.append(int(as_of))
        q+=' ORDER BY retrieved_at_utc DESC LIMIT ?';args.append(int(limit))
        out=[]
        for r in self.db.execute(q,args).fetchall():
            d=dict(r);raw=d.get('meta_json');stored=d.get('meta_sha256')
            if raw is None:
                d['meta']={};d['hash_valid']=False;d['meta_status']='LEGACY_NULL_META';out.append(d);continue
            if isinstance(raw,str):
                raw_text=raw;raw_bytes=raw.encode()
            elif isinstance(raw,(bytes,bytearray)):
                raw_bytes=bytes(raw);raw_text=raw_bytes.decode('utf-8',errors='replace')
            else:
                d['meta']={};d['hash_valid']=False;d['meta_status']='INVALID_META_TYPE';out.append(d);continue
            try:
                parsed=json.loads(raw_text)
                if isinstance(parsed,dict):d['meta']=parsed;d['meta_status']='OK'
                else:d['meta']={};d['meta_status']='INVALID_META_SHAPE'
            except (TypeError,ValueError,json.JSONDecodeError):
                d['meta']={};d['meta_status']='INVALID_META_JSON'
            d['hash_valid']=bool(stored and hashlib.sha256(raw_bytes).hexdigest()==str(stored))
            out.append(d)
        return out

    def latest_observation_receipt(self,observation_id,as_of=None):
        rows=self.observation_receipts(observation_id,as_of=as_of,limit=1)
        return rows[0] if rows else None

    def save_research(self,broker,symbol,profile,algo_version,candle_open,analyzed_at,result,mode):
        if mode not in ('FORWARD_CYCLE','BOOTSTRAP_NO_FORWARD_SIGNAL'):
            raise ValueError('Research provenance must be explicit')
        raw=json.dumps(result,sort_keys=True,separators=(',',':'),default=str)
        h=hashlib.sha256(raw.encode()).hexdigest()
        uid=hashlib.sha256(json.dumps([broker,symbol,profile,algo_version,candle_open],separators=(',',':')).encode()).hexdigest()[:32]
        with self.transaction() as con:
            con.execute('''INSERT OR IGNORE INTO research_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',
               (uid,broker,symbol,profile,algo_version,candle_open,int(analyzed_at),
                result.get('status','UNKNOWN'),result.get('side',result.get('side_bias')),
                result.get('score'),mode,raw,h))
        return uid

    def recent_research(self,profile=None,limit=50):
        q='SELECT * FROM research_runs';args=[]
        if profile:q+=' WHERE profile=?';args.append(profile)
        q+=' ORDER BY analyzed_at_utc DESC LIMIT ?';args.append(limit)
        return [{**dict(x),'features':json.loads(x['features_json'])} for x in self.db.execute(q,args).fetchall()]

    def checkpoint(self,broker,symbol,profile,algo_version):
        row=self.db.execute('''SELECT * FROM observer_checkpoints WHERE broker=? AND symbol=?
          AND profile=? AND algo_version=?''',(broker,symbol,profile,algo_version)).fetchone()
        return dict(row) if row else None

    def advance_checkpoint(self,broker,symbol,profile,algo_version,candle_open,processed_at,stage):
        """Only monotone durable observer evidence; never retroactively assert that a
        restarted process monitored a candle before it first bootstrapped.
        """
        if stage not in ('BOOTSTRAP','FORWARD_REVIEW','MISSED_CANDLE_GAP'):
            raise ValueError('Unknown observer checkpoint stage')
        with self.transaction() as con:
            previous=con.execute('''SELECT last_candle_open_utc FROM observer_checkpoints
              WHERE broker=? AND symbol=? AND profile=? AND algo_version=?''',
              (broker,symbol,profile,algo_version)).fetchone()
            if previous and candle_open<previous['last_candle_open_utc']:
                raise ValueError('Observer checkpoint cannot move backwards')
            con.execute('''INSERT INTO observer_checkpoints VALUES(?,?,?,?,?,?,?)
                ON CONFLICT(broker,symbol,profile,algo_version)
                DO UPDATE SET last_candle_open_utc=excluded.last_candle_open_utc,
                processed_at_utc=excluded.processed_at_utc,stage=excluded.stage''',
                (broker,symbol,profile,algo_version,int(candle_open),int(processed_at),stage))
        return self.checkpoint(broker,symbol,profile,algo_version)

    def save_behaviour_review(self,signal_id,bar_time,observed_at,result):
        """Append once for this signal/candle/algorithm. Never revise past reasoning."""
        raw=json.dumps(result,sort_keys=True,separators=(',',':'),default=str)
        checksum=hashlib.sha256(raw.encode()).hexdigest()
        with self.transaction() as con:
            con.execute('''INSERT OR IGNORE INTO behaviour_reviews(signal_id,candle_open_utc,
                observed_at_utc,algorithm,state,reason,evidence_json,evidence_hash)
                VALUES(?,?,?,?,?,?,?,?)''',(signal_id,int(bar_time),int(observed_at),
                result['algorithm'],result['state'],result['reason'],raw,checksum))
            row=con.execute('''SELECT evidence_hash FROM behaviour_reviews WHERE signal_id=?
                AND candle_open_utc=? AND algorithm=?''',
                (signal_id,int(bar_time),result['algorithm'])).fetchone()
            if row['evidence_hash']!=checksum:
                raise ValueError('Immutable behaviour review differs from previously stored evidence')
        return checksum

    def behaviour_reviews(self,signal_id,limit=25):
        q='SELECT * FROM behaviour_reviews WHERE signal_id=? ORDER BY candle_open_utc DESC LIMIT ?'
        return [{**dict(x),'evidence':json.loads(x['evidence_json'])} for x in self.db.execute(q,(signal_id,min(200,int(limit)))).fetchall()]

    def save_scalping_opportunity(self,broker,symbol,campaign_id,candle_open_utc,observed_at_utc,algorithm,detail):
        """Persist one immutable forward M1 research opportunity.

        This is intentionally separate from signals: several independent
        re-entry opportunities may exist inside one master campaign, and none of
        them imply a broker order. Reprocessing the same M1 candle must produce
        exactly the same evidence hash or it is rejected as a causality/audit
        violation.
        """
        if not isinstance(detail,dict): raise ValueError('Scalping opportunity detail must be a dict')
        # The live campaign engine persists the full campaign bundle, where
        # the selected setup lives under current_opportunity.  Accept the flat
        # shape as well for backward/diagnostic callers.
        current=detail.get('current_opportunity') or detail
        selected=current.get('selected') or detail.get('selected') or {}
        side=str(selected.get('side') or 'NONE').upper()
        setup=str(selected.get('setup_type') or 'NONE')
        grade=str(selected.get('grade') or 'C')
        score=int(selected.get('score') or 0)
        status=str(selected.get('status') or current.get('status') or detail.get('status') or 'OBSERVE_ONLY')
        raw=json.dumps(detail,sort_keys=True,separators=(',',':'),default=str)
        checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid='SCO-'+hashlib.sha256(f"{broker}|{symbol}|{campaign_id}|{int(candle_open_utc)}|{algorithm}".encode()).hexdigest()[:20].upper()
        with self.transaction() as con:
            con.execute("""INSERT OR IGNORE INTO scalping_opportunities(
              id,broker,symbol,campaign_id,candle_open_utc,observed_at_utc,algorithm,
              side,setup_type,grade,score,status,detail_json,detail_sha256)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",(
              uid,broker,symbol,campaign_id,int(candle_open_utc),int(observed_at_utc),algorithm,
              side,setup,grade,score,status,raw,checksum))
            row=con.execute('SELECT detail_sha256 FROM scalping_opportunities WHERE id=?',(uid,)).fetchone()
            if not row or row['detail_sha256']!=checksum:
                raise ValueError('Immutable scalping opportunity differs from stored T0 evidence')
        return self.scalping_opportunity(uid)

    def scalping_opportunity(self,opportunity_id):
        row=self.db.execute('SELECT * FROM scalping_opportunities WHERE id=?',(opportunity_id,)).fetchone()
        if not row:return None
        d=dict(row);d['detail']=json.loads(d.pop('detail_json'));return d

    def recent_scalping_opportunities(self,broker=None,symbol=None,campaign_id=None,limit=20):
        q='SELECT id FROM scalping_opportunities WHERE 1=1';args=[]
        if broker is not None:q+=' AND broker=?';args.append(broker)
        if symbol is not None:q+=' AND symbol=?';args.append(symbol)
        if campaign_id is not None:q+=' AND campaign_id=?';args.append(campaign_id)
        q+=' ORDER BY observed_at_utc DESC LIMIT ?';args.append(min(200,max(1,int(limit))))
        out=[]
        for row in self.db.execute(q,args).fetchall():
            x=self.scalping_opportunity(row['id'])
            if x:out.append(x)
        return out

    def backup(self,destination):
        # SQLite online backup includes committed WAL transactions consistently.
        target=Path(destination);target.parent.mkdir(parents=True,exist_ok=True)
        if target.resolve()==self.path.resolve():raise ValueError('Backup must be another path')
        with sqlite3.connect(str(target)) as output:self.db.backup(output)
        return {'path':str(target),'bytes':target.stat().st_size,'offsite':False}

    def create_signal(self,signal):
        with self.transaction() as con:
            con.execute('''INSERT OR IGNORE INTO signals VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(
                signal['id'],signal['broker'],signal['symbol'],signal['profile'],signal['algo_version'],
                signal['origin_candle_open_utc'],signal['created_at_utc'],signal['side'],
                signal['entry_low'],signal['entry_high'],signal['sl'],signal['tp1'],signal['tp2'],signal['tp3'],
                signal['expires_at_utc'],signal['initial_state'],json.dumps(signal['reasons'],sort_keys=True),
                json.dumps(signal['evidence'],sort_keys=True)))
        return self.signal(signal['id'])

    def signal(self,sid):
        r=self.db.execute('SELECT * FROM signals WHERE id=?',(sid,)).fetchone()
        if not r:return None
        x=dict(r);x['reasons']=json.loads(x.pop('reason_json'));x['evidence']=json.loads(x.pop('evidence_json'))
        ev=self.db.execute('SELECT * FROM events WHERE signal_id=? ORDER BY sequence DESC LIMIT 1',(sid,)).fetchone()
        x['state']=ev['to_state'] if ev else x['initial_state'];x['last_event_hash']=ev['event_hash'] if ev else None
        return x

    def open_signals(self,broker,symbol,profile=None):
        q='SELECT id FROM signals WHERE broker=? AND symbol=?';args=[broker,symbol]
        if profile:q+=' AND profile=?';args.append(profile)
        q+=' ORDER BY created_at_utc DESC LIMIT 150'
        return [s for r in self.db.execute(q,args).fetchall() if (s:=self.signal(r['id'])) and s['state'] in
                ('WAIT_RETEST','ENTRY_READY','ACTIVE_PAPER','TP1_PAPER','TP2_PAPER','REVIEW')]

    def latest_signal(self,broker,symbol,profile):
        r=self.db.execute('SELECT id FROM signals WHERE broker=? AND symbol=? AND profile=? ORDER BY created_at_utc DESC LIMIT 1',
                          (broker,symbol,profile)).fetchone()
        return self.signal(r['id']) if r else None

    def append_event(self,sid,at,etype,to_state,reason,evidence=None,expected_state=None):
        if not isinstance(reason,str) or not reason:raise ValueError('Reason required for audit event')
        evidence=evidence or {};raw=json.dumps(evidence,sort_keys=True,separators=(',',':'))
        with self.transaction() as con:
            if not con.execute('SELECT 1 FROM signals WHERE id=?',(sid,)).fetchone():raise KeyError('Unknown signal')
            x=con.execute('SELECT * FROM events WHERE signal_id=? ORDER BY sequence DESC LIMIT 1',(sid,)).fetchone()
            first=con.execute('SELECT initial_state,created_at_utc FROM signals WHERE id=?',(sid,)).fetchone()
            prev_state=x['to_state'] if x else first['initial_state'];prev=x['event_hash'] if x else 'GENESIS'
            if expected_state and prev_state!=expected_state:raise ValueError('Event concurrency state mismatch')
            if at<first['created_at_utc'] or (x and at<x['created_at_utc']):raise ValueError('Out-of-order event time')
            seq=(x['sequence']+1) if x else 1
            msg=json.dumps([sid,seq,at,etype,prev_state,to_state,reason,json.loads(raw),prev],sort_keys=True,separators=(',',':'))
            h=hashlib.sha256(msg.encode()).hexdigest()
            con.execute('''INSERT INTO events(signal_id,sequence,created_at_utc,event_type,from_state,to_state,reason,evidence_json,prev_hash,event_hash)
                          VALUES(?,?,?,?,?,?,?,?,?,?)''',(sid,seq,at,etype,prev_state,to_state,reason,raw,prev,h))
        return self.signal(sid)

    def events(self,sid):return [dict(r) for r in self.db.execute('SELECT * FROM events WHERE signal_id=? ORDER BY sequence',(sid,)).fetchall()]

    def verify_chain(self,sid):
        chain=self.events(sid);prev='GENESIS'
        for e in chain:
            if e['prev_hash']!=prev:return False
            msg=json.dumps([sid,e['sequence'],e['created_at_utc'],e['event_type'],e['from_state'],e['to_state'],e['reason'],json.loads(e['evidence_json']),prev],sort_keys=True,separators=(',',':'))
            h=hashlib.sha256(msg.encode()).hexdigest()
            if h!=e['event_hash']:return False
            prev=h
        return True


    def save_intelligence_snapshot(self,broker,symbol,profile,candle_open,analyzed_at,algorithm,payload):
        raw=json.dumps(payload,sort_keys=True,separators=(',',':'),default=str);h=hashlib.sha256(raw.encode()).hexdigest()
        uid=hashlib.sha256(f"{broker}|{symbol}|{profile}|{candle_open}|{algorithm}".encode()).hexdigest()[:32]
        with self.transaction() as con:
            con.execute("INSERT OR IGNORE INTO intelligence_snapshots VALUES(?,?,?,?,?,?,?,?,?)",
              (uid,broker,symbol,profile,int(candle_open),int(analyzed_at),algorithm,raw,h))
        return uid

    def recent_intelligence(self,profile=None,limit=20):
        q='SELECT * FROM intelligence_snapshots';args=[]
        if profile:q+=' WHERE profile=?';args.append(profile)
        q+=' ORDER BY analyzed_at_utc DESC LIMIT ?';args.append(int(limit))
        out=[]
        for r in self.db.execute(q,args).fetchall():
            d=dict(r);d['payload']=json.loads(d['payload_json']);d['hash_valid']=hashlib.sha256(d['payload_json'].encode()).hexdigest()==d['payload_sha256'];out.append(d)
        return out

    def save_market_event(self,broker,symbol,profile,event,observed_at):
        raw=json.dumps(event,sort_keys=True,separators=(',',':'),default=str);h=hashlib.sha256(raw.encode()).hexdigest()
        types=json.dumps(event.get('events',[]),separators=(',',':'));algo=event.get('version','UNKNOWN');tf=event.get('tf','UNKNOWN');t=int(event['candle_open_utc'])
        uid=hashlib.sha256(f"{broker}|{symbol}|{profile}|{tf}|{t}|{algo}".encode()).hexdigest()[:32]
        with self.transaction() as con:
            con.execute("INSERT OR IGNORE INTO market_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
              (uid,broker,symbol,profile,tf,t,int(observed_at),algo,event.get('classification','REVIEW_REQUIRED'),types,raw,h))
        return uid

    def recent_market_events(self,profile=None,limit=30):
        """Raw append-only event history, including superseded algorithm versions."""
        q='SELECT * FROM market_events';args=[]
        if profile:q+=' WHERE profile=?';args.append(profile)
        q+=' ORDER BY observed_at_utc DESC LIMIT ?';args.append(int(limit))
        out=[]
        for r in self.db.execute(q,args).fetchall():
            d=dict(r);d['event_types']=json.loads(d['event_types_json']);d['evidence']=json.loads(d['evidence_json']);d['hash_valid']=hashlib.sha256(d['evidence_json'].encode()).hexdigest()==d['evidence_sha256'];out.append(d)
        return out

    def recent_canonical_market_events(self,profile=None,limit=30):
        """Return one canonical interpretation per exact source candle.

        Historical rows are never deleted. If more than one algorithm version
        analysed the same profile/TF/candle, the newest observed row is exposed
        as canonical while older rows remain available in the raw audit history.
        """
        q='SELECT * FROM market_events';args=[]
        if profile:q+=' WHERE profile=?';args.append(profile)
        q+=' ORDER BY observed_at_utc DESC, rowid DESC LIMIT ?';args.append(max(1000,int(limit)*12))
        rows=self.db.execute(q,args).fetchall();counts={};first={};order=[]
        for r in rows:
            d=dict(r);key=(d['broker'],d['symbol'],d['profile'],d['tf'],int(d['candle_open_utc']))
            counts[key]=counts.get(key,0)+1
            if key in first:continue
            first[key]=d;order.append(key)
        out=[]
        for key in order[:int(limit)]:
            d=first[key]
            d['event_types']=json.loads(d['event_types_json']);d['evidence']=json.loads(d['evidence_json'])
            d['hash_valid']=hashlib.sha256(d['evidence_json'].encode()).hexdigest()==d['evidence_sha256']
            d['canonical']=True;d['superseded_versions']=max(0,counts.get(key,1)-1)
            out.append(d)
        return out

    def canonical_market_event_count(self):
        return self.db.execute("SELECT COUNT(*) FROM (SELECT 1 FROM market_events GROUP BY broker,symbol,profile,tf,candle_open_utc)").fetchone()[0]

    def save_learning_case(self,case):
        # Immutable T0 evidence. Later outcomes never rewrite this row.
        raw=json.dumps(case['context'],sort_keys=True,separators=(',',':'),default=str)
        checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid=case.get('id') or hashlib.sha256(
            f"{case['broker']}|{case['symbol']}|{case['profile']}|{case['source_event_id']}|{case['algorithm']}".encode()
        ).hexdigest()[:32]
        with self.transaction() as con:
            con.execute('''INSERT OR IGNORE INTO learning_cases(
                id,broker,symbol,profile,tf,source_event_id,source_candle_open_utc,created_at_utc,
                algorithm,thesis,origin_close,origin_atr,context_json,context_sha256,status)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(
                uid,case['broker'],case['symbol'],case['profile'],case['tf'],case['source_event_id'],
                int(case['source_candle_open_utc']),int(case['created_at_utc']),case['algorithm'],case['thesis'],
                float(case['origin_close']),float(case['origin_atr']),raw,checksum,case.get('status','OPEN')))
            row=con.execute('SELECT context_sha256 FROM learning_cases WHERE id=?',(uid,)).fetchone()
            if not row or row['context_sha256']!=checksum:
                raise ValueError('Immutable learning case differs from stored T0 evidence')
        return uid

    def learning_case(self,case_id):
        r=self.db.execute('SELECT * FROM learning_cases WHERE id=?',(case_id,)).fetchone()
        if not r:return None
        d=dict(r);d['context']=json.loads(d['context_json']);d['hash_valid']=hashlib.sha256(d['context_json'].encode()).hexdigest()==d['context_sha256']
        return d

    def learning_case_for_event(self,event_id,algorithm=None):
        q='SELECT id FROM learning_cases WHERE source_event_id=?';args=[event_id]
        if algorithm:q+=' AND algorithm=?';args.append(algorithm)
        q+=' ORDER BY created_at_utc DESC LIMIT 1'
        r=self.db.execute(q,args).fetchone();return self.learning_case(r['id']) if r else None

    def recent_learning_cases(self,profile=None,limit=30):
        q='SELECT id FROM learning_cases';args=[]
        if profile:q+=' WHERE profile=?';args.append(profile)
        q+=' ORDER BY created_at_utc DESC LIMIT ?';args.append(int(limit))
        return [self.learning_case(r['id']) for r in self.db.execute(q,args).fetchall()]

    def save_learning_followup(self,case_id,horizon_bars,target_candle_open_utc,observed_at,algorithm,observation_mode,outcome,metrics):
        if observation_mode not in ('FORWARD_OBSERVED','RECOVERED_AFTER_RESTART'):
            raise ValueError('Invalid learning observation mode')
        raw=json.dumps(metrics,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid=hashlib.sha256(f"{case_id}|{int(horizon_bars)}|{algorithm}".encode()).hexdigest()[:32]
        with self.transaction() as con:
            if not con.execute('SELECT 1 FROM learning_cases WHERE id=?',(case_id,)).fetchone():raise KeyError('Unknown learning case')
            con.execute('''INSERT OR IGNORE INTO learning_followups(
                id,case_id,horizon_bars,target_candle_open_utc,observed_at_utc,algorithm,observation_mode,outcome,metrics_json,metrics_sha256)
                VALUES(?,?,?,?,?,?,?,?,?,?)''',(uid,case_id,int(horizon_bars),int(target_candle_open_utc),int(observed_at),algorithm,observation_mode,outcome,raw,checksum))
            row=con.execute('SELECT metrics_sha256 FROM learning_followups WHERE id=?',(uid,)).fetchone()
            if not row or row['metrics_sha256']!=checksum:raise ValueError('Immutable follow-up differs from stored evidence')
        return uid

    def learning_followups(self,case_id):
        rows=self.db.execute('SELECT * FROM learning_followups WHERE case_id=? ORDER BY horizon_bars',(case_id,)).fetchall();out=[]
        for r in rows:
            d=dict(r);d['metrics']=json.loads(d['metrics_json']);d['hash_valid']=hashlib.sha256(d['metrics_json'].encode()).hexdigest()==d['metrics_sha256'];out.append(d)
        return out

    def save_self_review(self,case_id,created_at,algorithm,review_status,initial_thesis,final_outcome,analysis):
        raw=json.dumps(analysis,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid=hashlib.sha256(f"{case_id}|{algorithm}".encode()).hexdigest()[:32]
        with self.transaction() as con:
            con.execute('''INSERT OR IGNORE INTO self_reviews(id,case_id,created_at_utc,algorithm,review_status,initial_thesis,final_outcome,analysis_json,analysis_sha256)
                VALUES(?,?,?,?,?,?,?,?,?)''',(uid,case_id,int(created_at),algorithm,review_status,initial_thesis,final_outcome,raw,checksum))
            row=con.execute('SELECT analysis_sha256 FROM self_reviews WHERE id=?',(uid,)).fetchone()
            if not row or row['analysis_sha256']!=checksum:raise ValueError('Immutable self-review differs from stored analysis')
        return uid

    def self_review(self,case_id):
        r=self.db.execute('SELECT * FROM self_reviews WHERE case_id=? ORDER BY created_at_utc DESC LIMIT 1',(case_id,)).fetchone()
        if not r:return None
        d=dict(r);d['analysis']=json.loads(d['analysis_json']);d['hash_valid']=hashlib.sha256(d['analysis_json'].encode()).hexdigest()==d['analysis_sha256'];return d

    def learning_summary(self,profile=None):
        where='';args=[]
        if profile:where=' WHERE profile=?';args=[profile]
        cases=self.db.execute('SELECT COUNT(*) FROM learning_cases'+where,args).fetchone()[0]
        if profile:
            follow=self.db.execute('''SELECT COUNT(*) FROM learning_followups f JOIN learning_cases c ON c.id=f.case_id WHERE c.profile=?''',(profile,)).fetchone()[0]
            reviews=self.db.execute('''SELECT COUNT(*) FROM self_reviews r JOIN learning_cases c ON c.id=r.case_id WHERE c.profile=?''',(profile,)).fetchone()[0]
            outcomes=self.db.execute('''SELECT f.outcome,COUNT(*) n FROM learning_followups f JOIN learning_cases c ON c.id=f.case_id WHERE c.profile=? GROUP BY f.outcome''',(profile,)).fetchall()
        else:
            follow=self.db.execute('SELECT COUNT(*) FROM learning_followups').fetchone()[0];reviews=self.db.execute('SELECT COUNT(*) FROM self_reviews').fetchone()[0]
            outcomes=self.db.execute('SELECT outcome,COUNT(*) n FROM learning_followups GROUP BY outcome').fetchall()
        # Aggregate only the farthest stored horizon for each case so one case is
        # not counted multiple times simply because it has 1/2/3/6-bar reviews.
        q='''SELECT f.* FROM learning_followups f JOIN (SELECT case_id,MAX(horizon_bars) h FROM learning_followups GROUP BY case_id) z ON z.case_id=f.case_id AND z.h=f.horizon_bars JOIN learning_cases c ON c.id=f.case_id'''
        vals=[]
        if profile:
            rows=self.db.execute(q+' WHERE c.profile=?',(profile,)).fetchall()
        else:rows=self.db.execute(q).fetchall()
        for r in rows:
            try:vals.append(json.loads(r['metrics_json']))
            except Exception:pass
        def avg(key):
            x=[float(v[key]) for v in vals if isinstance(v.get(key),(int,float))]
            return round(sum(x)/len(x),6) if x else None
        mature=len(vals)
        return {'cases':cases,'followups':follow,'self_reviews':reviews,'mature_cases':mature,
                'outcomes':{r['outcome']:r['n'] for r in outcomes},
                'mean_max_up_excursion_atr':avg('max_up_excursion_atr'),
                'mean_max_down_excursion_atr':avg('max_down_excursion_atr'),
                'mean_close_delta_atr':avg('close_delta_atr'),
                'trained_ml':False,'auto_rule_mutation':False,
                'rule_change_sample_gate':30,'sample_gate_met':mature>=30,
                'walk_forward_validation_required':True}

    def save_signal_self_review(self,signal_id,created_at,algorithm,result_status,playbook,failure_fingerprint,review):
        """Persist one immutable post-outcome signal review without rewriting T0."""
        raw=json.dumps(review,sort_keys=True,separators=(',',':'),default=str)
        checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid='SSR-'+hashlib.sha256(f"{signal_id}|{algorithm}".encode()).hexdigest()[:24].upper()
        with self.transaction() as con:
            if not con.execute('SELECT 1 FROM signals WHERE id=?',(signal_id,)).fetchone():
                raise KeyError('Unknown signal')
            con.execute('''INSERT OR IGNORE INTO signal_self_reviews(
              id,signal_id,created_at_utc,algorithm,result_status,playbook,failure_fingerprint,review_json,review_sha256)
              VALUES(?,?,?,?,?,?,?,?,?)''',(uid,signal_id,int(created_at),algorithm,str(result_status),
              str(playbook or 'UNKNOWN'),str(failure_fingerprint),raw,checksum))
            row=con.execute('SELECT review_sha256 FROM signal_self_reviews WHERE id=?',(uid,)).fetchone()
            if not row or row['review_sha256']!=checksum:
                raise ValueError('Immutable signal self-review differs from stored analysis')
        return self.signal_self_review(signal_id,algorithm)

    def signal_self_review(self,signal_id,algorithm=None):
        q='SELECT * FROM signal_self_reviews WHERE signal_id=?';args=[signal_id]
        if algorithm is not None:q+=' AND algorithm=?';args.append(algorithm)
        q+=' ORDER BY created_at_utc DESC LIMIT 1'
        row=self.db.execute(q,args).fetchone()
        if not row:return None
        d=dict(row);d['review']=json.loads(d.pop('review_json'));return d

    def recent_signal_self_reviews(self,profile=None,limit=50):
        q='''SELECT r.* FROM signal_self_reviews r JOIN signals s ON s.id=r.signal_id''';args=[]
        if profile is not None:q+=' WHERE s.profile=?';args.append(str(profile).upper())
        q+=' ORDER BY r.created_at_utc DESC LIMIT ?';args.append(min(500,max(1,int(limit))))
        out=[]
        for row in self.db.execute(q,args).fetchall():
            d=dict(row);d['review']=json.loads(d.pop('review_json'));out.append(d)
        return out

    def save_closed_loop_review(self,signal_id,created_at,algorithm,result_status,result_bucket,playbook,review):
        raw=json.dumps(review,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid='CLR-'+hashlib.sha256(f"{signal_id}|{algorithm}".encode()).hexdigest()[:24].upper()
        with self.transaction() as con:
            if not con.execute('SELECT 1 FROM signals WHERE id=?',(signal_id,)).fetchone():raise KeyError('Unknown signal')
            con.execute('''INSERT OR IGNORE INTO closed_loop_reviews(id,signal_id,created_at_utc,algorithm,result_status,result_bucket,playbook,review_json,review_sha256)
                VALUES(?,?,?,?,?,?,?,?,?)''',(uid,signal_id,int(created_at),algorithm,str(result_status),str(result_bucket),str(playbook or 'UNKNOWN'),raw,checksum))
            row=con.execute('SELECT review_sha256 FROM closed_loop_reviews WHERE id=?',(uid,)).fetchone()
            if not row or row['review_sha256']!=checksum:raise ValueError('Immutable closed-loop review differs from stored analysis')
        return self.closed_loop_review(signal_id,algorithm)

    def closed_loop_review(self,signal_id,algorithm=None):
        q='SELECT * FROM closed_loop_reviews WHERE signal_id=?';args=[signal_id]
        if algorithm is not None:q+=' AND algorithm=?';args.append(algorithm)
        q+=' ORDER BY created_at_utc DESC LIMIT 1';row=self.db.execute(q,args).fetchone()
        if not row:return None
        d=dict(row);d['review']=json.loads(d.pop('review_json'));return d

    def recent_closed_loop_reviews(self,profile=None,limit=100):
        q='''SELECT r.* FROM closed_loop_reviews r JOIN signals s ON s.id=r.signal_id''';args=[]
        if profile is not None:q+=' WHERE s.profile=?';args.append(str(profile).upper())
        q+=' ORDER BY r.created_at_utc DESC LIMIT ?';args.append(min(1000,max(1,int(limit))))
        out=[]
        for row in self.db.execute(q,args).fetchall():
            d=dict(row);d['review']=json.loads(d.pop('review_json'));out.append(d)
        return out

    def save_lesson_evidence(self,source_kind,source_id,created_at,algorithm,broker,symbol,profile,tf,playbook,lesson_code,lesson):
        raw=json.dumps(lesson,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid='LES-'+hashlib.sha256(f"{source_kind}|{source_id}|{algorithm}|{lesson_code}".encode()).hexdigest()[:24].upper()
        with self.transaction() as con:
            con.execute('''INSERT OR IGNORE INTO lesson_evidence(id,source_kind,source_id,created_at_utc,algorithm,broker,symbol,profile,tf,playbook,lesson_code,lesson_json,lesson_sha256)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',(uid,str(source_kind),str(source_id),int(created_at),algorithm,broker,symbol,str(profile).upper(),str(tf or ''),str(playbook or 'UNKNOWN'),str(lesson_code),raw,checksum))
            row=con.execute('SELECT lesson_sha256 FROM lesson_evidence WHERE id=?',(uid,)).fetchone()
            if not row or row['lesson_sha256']!=checksum:raise ValueError('Immutable lesson evidence differs from stored evidence')
        return uid

    def recent_lesson_evidence(self,profile=None,limit=200):
        q='SELECT * FROM lesson_evidence';args=[]
        if profile is not None:q+=' WHERE profile=?';args.append(str(profile).upper())
        q+=' ORDER BY created_at_utc DESC LIMIT ?';args.append(min(2000,max(1,int(limit))))
        out=[]
        for row in self.db.execute(q,args).fetchall():
            d=dict(row);d['lesson']=json.loads(d.pop('lesson_json'));out.append(d)
        return out

    def save_publication_rejection(self,detail):
        raw=json.dumps(detail,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        key=f"{detail['broker']}|{detail['symbol']}|{detail['profile']}|{int(detail['origin_candle_open_utc'])}|{detail['version']}"
        uid='REJ-'+hashlib.sha256(key.encode()).hexdigest()[:24].upper()
        with self.transaction() as con:
            con.execute('''INSERT OR IGNORE INTO publication_rejections(id,broker,symbol,profile,tf,origin_candle_open_utc,recorded_at_utc,algorithm,playbook,detail_json,detail_sha256)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)''',(uid,detail['broker'],detail['symbol'],str(detail['profile']).upper(),str(detail.get('tf') or ''),int(detail['origin_candle_open_utc']),int(detail['recorded_at_utc']),detail['version'],str(detail.get('playbook') or 'UNKNOWN'),raw,checksum))
            row=con.execute('SELECT detail_sha256 FROM publication_rejections WHERE id=?',(uid,)).fetchone()
            if not row or row['detail_sha256']!=checksum:raise ValueError('Immutable publication rejection differs from stored T0 shadow case')
        return self.publication_rejection(uid)

    def publication_rejection(self,rejection_id):
        row=self.db.execute('SELECT * FROM publication_rejections WHERE id=?',(rejection_id,)).fetchone()
        if not row:return None
        d=dict(row);d['detail']=json.loads(d.pop('detail_json'));return d

    def recent_publication_rejections(self,profile=None,limit=100):
        q='SELECT * FROM publication_rejections';args=[]
        if profile is not None:q+=' WHERE profile=?';args.append(str(profile).upper())
        q+=' ORDER BY recorded_at_utc DESC LIMIT ?';args.append(min(1000,max(1,int(limit))))
        out=[]
        for row in self.db.execute(q,args).fetchall():
            d=dict(row);d['detail']=json.loads(d.pop('detail_json'));out.append(d)
        return out

    def save_missed_opportunity_review(self,rejection_id,created_at,algorithm,classification,review):
        raw=json.dumps(review,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid='MOR-'+hashlib.sha256(f"{rejection_id}|{algorithm}".encode()).hexdigest()[:24].upper()
        with self.transaction() as con:
            if not con.execute('SELECT 1 FROM publication_rejections WHERE id=?',(rejection_id,)).fetchone():raise KeyError('Unknown rejection case')
            con.execute('''INSERT OR IGNORE INTO missed_opportunity_reviews(id,rejection_id,created_at_utc,algorithm,classification,review_json,review_sha256)
                VALUES(?,?,?,?,?,?,?)''',(uid,rejection_id,int(created_at),algorithm,str(classification),raw,checksum))
            row=con.execute('SELECT review_sha256 FROM missed_opportunity_reviews WHERE id=?',(uid,)).fetchone()
            if not row or row['review_sha256']!=checksum:raise ValueError('Immutable missed-opportunity review differs from stored analysis')
        return self.missed_opportunity_review(rejection_id,algorithm)

    def missed_opportunity_review(self,rejection_id,algorithm=None):
        q='SELECT * FROM missed_opportunity_reviews WHERE rejection_id=?';args=[rejection_id]
        if algorithm is not None:q+=' AND algorithm=?';args.append(algorithm)
        q+=' ORDER BY created_at_utc DESC LIMIT 1';row=self.db.execute(q,args).fetchone()
        if not row:return None
        d=dict(row);d['review']=json.loads(d.pop('review_json'));return d

    def recent_missed_opportunity_reviews(self,profile=None,limit=100):
        q='''SELECT m.* FROM missed_opportunity_reviews m JOIN publication_rejections r ON r.id=m.rejection_id''';args=[]
        if profile is not None:q+=' WHERE r.profile=?';args.append(str(profile).upper())
        q+=' ORDER BY m.created_at_utc DESC LIMIT ?';args.append(min(1000,max(1,int(limit))))
        out=[]
        for row in self.db.execute(q,args).fetchall():
            d=dict(row);d['review']=json.loads(d.pop('review_json'));out.append(d)
        return out

    def save_correction_trial(self,detail):
        raw=json.dumps(detail,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        key=f"{detail['signal_id']}|{detail['version']}|{detail['lesson_code']}|{detail['prior_signal_id']}"
        uid='CTR-'+hashlib.sha256(key.encode()).hexdigest()[:24].upper()
        with self.transaction() as con:
            if not con.execute('SELECT 1 FROM signals WHERE id=?',(detail['signal_id'],)).fetchone():raise KeyError('Unknown correction trial signal')
            if not con.execute('SELECT 1 FROM signals WHERE id=?',(detail['prior_signal_id'],)).fetchone():raise KeyError('Unknown originating loss signal')
            con.execute('''INSERT OR IGNORE INTO correction_trials(
                id,signal_id,prior_signal_id,recorded_at_utc,algorithm,broker,symbol,profile,tf,playbook,lesson_code,detail_json,detail_sha256)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',(uid,detail['signal_id'],detail['prior_signal_id'],int(detail['recorded_at_utc']),detail['version'],
                detail['broker'],detail['symbol'],str(detail['profile']).upper(),str(detail.get('tf') or ''),str(detail.get('playbook') or 'UNKNOWN'),
                str(detail['lesson_code']),raw,checksum))
            row=con.execute('SELECT detail_sha256 FROM correction_trials WHERE id=?',(uid,)).fetchone()
            if not row or row['detail_sha256']!=checksum:raise ValueError('Immutable correction trial differs from stored T0 evidence')
        return self.correction_trial(uid)

    def correction_trial(self,trial_id):
        row=self.db.execute('SELECT * FROM correction_trials WHERE id=?',(trial_id,)).fetchone()
        if not row:return None
        d=dict(row);d['detail']=json.loads(d.pop('detail_json'));return d

    def recent_correction_trials(self,profile=None,limit=200):
        q='SELECT * FROM correction_trials';args=[]
        if profile is not None:q+=' WHERE profile=?';args.append(str(profile).upper())
        q+=' ORDER BY recorded_at_utc DESC LIMIT ?';args.append(min(2000,max(1,int(limit))))
        out=[]
        for row in self.db.execute(q,args).fetchall():
            d=dict(row);d['detail']=json.loads(d.pop('detail_json'));out.append(d)
        return out

    def save_correction_effectiveness_review(self,trial_id,created_at,algorithm,result_status,result_bucket,classification,review):
        raw=json.dumps(review,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid='CER-'+hashlib.sha256(f"{trial_id}|{algorithm}".encode()).hexdigest()[:24].upper()
        with self.transaction() as con:
            if not con.execute('SELECT 1 FROM correction_trials WHERE id=?',(trial_id,)).fetchone():raise KeyError('Unknown correction trial')
            con.execute('''INSERT OR IGNORE INTO correction_effectiveness_reviews(
                id,trial_id,created_at_utc,algorithm,result_status,result_bucket,classification,review_json,review_sha256)
                VALUES(?,?,?,?,?,?,?,?,?)''',(uid,trial_id,int(created_at),algorithm,str(result_status),str(result_bucket),str(classification),raw,checksum))
            row=con.execute('SELECT review_sha256 FROM correction_effectiveness_reviews WHERE id=?',(uid,)).fetchone()
            if not row or row['review_sha256']!=checksum:raise ValueError('Immutable correction-effectiveness review differs from stored analysis')
        return self.correction_effectiveness_review(trial_id,algorithm)

    def correction_effectiveness_review(self,trial_id,algorithm=None):
        q='''SELECT e.*,t.signal_id,t.prior_signal_id,t.broker,t.symbol,t.profile,t.tf,t.playbook,t.lesson_code
             FROM correction_effectiveness_reviews e JOIN correction_trials t ON t.id=e.trial_id WHERE e.trial_id=?''';args=[trial_id]
        if algorithm is not None:q+=' AND e.algorithm=?';args.append(algorithm)
        q+=' ORDER BY e.created_at_utc DESC LIMIT 1';row=self.db.execute(q,args).fetchone()
        if not row:return None
        d=dict(row);d['review']=json.loads(d.pop('review_json'));return d

    def recent_correction_effectiveness_reviews(self,profile=None,limit=500):
        q='''SELECT e.*,t.signal_id,t.prior_signal_id,t.broker,t.symbol,t.profile,t.tf,t.playbook,t.lesson_code
             FROM correction_effectiveness_reviews e JOIN correction_trials t ON t.id=e.trial_id''';args=[]
        if profile is not None:q+=' WHERE t.profile=?';args.append(str(profile).upper())
        q+=' ORDER BY e.created_at_utc DESC LIMIT ?';args.append(min(5000,max(1,int(limit))))
        out=[]
        for row in self.db.execute(q,args).fetchall():
            d=dict(row);d['review']=json.loads(d.pop('review_json'));out.append(d)
        return out

    def save_technical_evidence_trial(self,detail):
        raw=json.dumps(detail,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid='TET-'+hashlib.sha256(f"{detail['signal_id']}|{detail['version']}".encode()).hexdigest()[:24].upper()
        with self.transaction() as con:
            if not con.execute('SELECT 1 FROM signals WHERE id=?',(detail['signal_id'],)).fetchone():raise KeyError('Unknown technical-evidence signal')
            con.execute('''INSERT OR IGNORE INTO technical_evidence_trials(
                id,signal_id,recorded_at_utc,algorithm,broker,symbol,profile,tf,playbook,side,detail_json,detail_sha256)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',(uid,detail['signal_id'],int(detail['recorded_at_utc']),detail['version'],detail['broker'],detail['symbol'],
                str(detail['profile']).upper(),str(detail.get('tf') or ''),str(detail.get('playbook') or 'UNKNOWN'),str(detail.get('side') or ''),raw,checksum))
            row=con.execute('SELECT detail_sha256 FROM technical_evidence_trials WHERE id=?',(uid,)).fetchone()
            if not row or row['detail_sha256']!=checksum:raise ValueError('Immutable technical-evidence T0 trial differs from stored evidence')
        return self.technical_evidence_trial(uid)

    def technical_evidence_trial(self,trial_id):
        row=self.db.execute('SELECT * FROM technical_evidence_trials WHERE id=?',(trial_id,)).fetchone()
        if not row:return None
        d=dict(row);d['detail']=json.loads(d.pop('detail_json'));return d

    def recent_technical_evidence_trials(self,profile=None,limit=300):
        q='SELECT * FROM technical_evidence_trials';args=[]
        if profile is not None:q+=' WHERE profile=?';args.append(str(profile).upper())
        q+=' ORDER BY recorded_at_utc DESC LIMIT ?';args.append(min(5000,max(1,int(limit))))
        out=[]
        for row in self.db.execute(q,args).fetchall():
            d=dict(row);d['detail']=json.loads(d.pop('detail_json'));out.append(d)
        return out

    def save_technical_evidence_outcome(self,trial_id,created_at,algorithm,result_status,result_bucket,review):
        raw=json.dumps(review,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid='TEO-'+hashlib.sha256(f"{trial_id}|{algorithm}".encode()).hexdigest()[:24].upper()
        with self.transaction() as con:
            if not con.execute('SELECT 1 FROM technical_evidence_trials WHERE id=?',(trial_id,)).fetchone():raise KeyError('Unknown technical-evidence trial')
            con.execute('''INSERT OR IGNORE INTO technical_evidence_outcomes(
                id,trial_id,created_at_utc,algorithm,result_status,result_bucket,review_json,review_sha256)
                VALUES(?,?,?,?,?,?,?,?)''',(uid,trial_id,int(created_at),algorithm,str(result_status),str(result_bucket),raw,checksum))
            row=con.execute('SELECT review_sha256 FROM technical_evidence_outcomes WHERE id=?',(uid,)).fetchone()
            if not row or row['review_sha256']!=checksum:raise ValueError('Immutable technical-evidence outcome review differs from stored analysis')
        return self.technical_evidence_outcome(trial_id,algorithm)

    def technical_evidence_outcome(self,trial_id,algorithm=None):
        q='''SELECT o.*,t.signal_id,t.broker,t.symbol,t.profile,t.tf,t.playbook,t.side
             FROM technical_evidence_outcomes o JOIN technical_evidence_trials t ON t.id=o.trial_id WHERE o.trial_id=?''';args=[trial_id]
        if algorithm is not None:q+=' AND o.algorithm=?';args.append(algorithm)
        q+=' ORDER BY o.created_at_utc DESC LIMIT 1';row=self.db.execute(q,args).fetchone()
        if not row:return None
        d=dict(row);d['review']=json.loads(d.pop('review_json'));return d

    def recent_technical_evidence_outcomes(self,profile=None,limit=1000):
        q='''SELECT o.*,t.signal_id,t.broker,t.symbol,t.profile,t.tf,t.playbook,t.side
             FROM technical_evidence_outcomes o JOIN technical_evidence_trials t ON t.id=o.trial_id''';args=[]
        if profile is not None:q+=' WHERE t.profile=?';args.append(str(profile).upper())
        q+=' ORDER BY o.created_at_utc DESC LIMIT ?';args.append(min(10000,max(1,int(limit))))
        out=[]
        for row in self.db.execute(q,args).fetchall():
            d=dict(row);d['review']=json.loads(d.pop('review_json'));out.append(d)
        return out

    def save_mentor_update(self,broker,symbol,profile,tf,candle_open_utc,created_at,algorithm,posture,bias,headline,detail):
        raw=json.dumps(detail,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        uid=hashlib.sha256(f"{broker}|{symbol}|{profile}|{tf}|{int(candle_open_utc)}|{algorithm}".encode()).hexdigest()[:32]
        with self.transaction() as con:
            con.execute("""INSERT OR IGNORE INTO mentor_updates(id,broker,symbol,profile,tf,candle_open_utc,created_at_utc,algorithm,posture,bias,headline,detail_json,detail_sha256)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",(uid,broker,symbol,profile,tf,int(candle_open_utc),int(created_at),algorithm,posture,bias,headline,raw,checksum))
            row=con.execute('SELECT detail_sha256 FROM mentor_updates WHERE id=?',(uid,)).fetchone()
            if not row or row['detail_sha256']!=checksum:raise ValueError('Immutable mentor update differs from stored evidence')
        return uid

    def recent_mentor_updates(self,profile=None,limit=30):
        q='SELECT * FROM mentor_updates';args=[]
        if profile:q+=' WHERE profile=?';args.append(profile)
        q+=' ORDER BY created_at_utc DESC LIMIT ?';args.append(int(limit))
        out=[]
        for r in self.db.execute(q,args).fetchall():
            d=dict(r);d['detail']=json.loads(d['detail_json']);d['hash_valid']=hashlib.sha256(d['detail_json'].encode()).hexdigest()==d['detail_sha256'];out.append(d)
        return out

    def save_autonomous_mentor_update(self,broker,symbol,profile,tf,candle_open_utc,created_at,algorithm,update):
        raw=json.dumps(update,sort_keys=True,separators=(',',':'),default=str);checksum=hashlib.sha256(raw.encode()).hexdigest()
        fp=update['state_fingerprint'];prev=update.get('previous_state_fingerprint');triggers=json.dumps(update.get('trigger_types') or [],separators=(',',':'))
        uid=hashlib.sha256(f"{broker}|{symbol}|{profile}|{tf}|{algorithm}|{fp}".encode()).hexdigest()[:32]
        with self.transaction() as con:
            con.execute('''INSERT OR IGNORE INTO autonomous_mentor_updates(id,broker,symbol,profile,tf,candle_open_utc,created_at_utc,algorithm,trigger_types_json,state_fingerprint,previous_state_fingerprint,headline,detail_json,detail_sha256)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(uid,broker,symbol,profile,tf,int(candle_open_utc),int(created_at),algorithm,triggers,fp,prev,update.get('headline',''),raw,checksum))
            row=con.execute('SELECT detail_sha256 FROM autonomous_mentor_updates WHERE id=?',(uid,)).fetchone()
            if not row or row['detail_sha256']!=checksum:raise ValueError('Immutable autonomous mentor update differs from stored evidence')
        return uid

    def recent_autonomous_mentor_updates(self,profile=None,limit=30):
        q='SELECT * FROM autonomous_mentor_updates';args=[]
        if profile:q+=' WHERE profile=?';args.append(profile)
        q+=' ORDER BY created_at_utc DESC,rowid DESC LIMIT ?';args.append(int(limit))
        out=[]
        for r in self.db.execute(q,args).fetchall():
            d=dict(r);d['trigger_types']=json.loads(d['trigger_types_json']);d['detail']=json.loads(d['detail_json']);d['hash_valid']=hashlib.sha256(d['detail_json'].encode()).hexdigest()==d['detail_sha256'];out.append(d)
        return out

    def latest_autonomous_mentor_state(self,profile,broker=None,symbol=None):
        q='SELECT * FROM autonomous_mentor_updates WHERE profile=?';args=[profile]
        if broker is not None:q+=' AND broker=?';args.append(broker)
        if symbol is not None:q+=' AND symbol=?';args.append(symbol)
        q+=' ORDER BY created_at_utc DESC,rowid DESC LIMIT 1'
        r=self.db.execute(q,args).fetchone()
        if not r:return None
        try:return (json.loads(r['detail_json']) or {}).get('state')
        except Exception:return None

    def save_knowledge_candidate(self,topic,query,source_origin,hypothesis,created_at):
        topic=str(topic or '').strip().upper();query=' '.join(str(query or '').split())
        if not topic or not query or not isinstance(hypothesis,dict):raise ValueError('Knowledge candidate requires topic/query/payload')
        raw=json.dumps(hypothesis,sort_keys=True,separators=(',',':'),ensure_ascii=False);h=hashlib.sha256(raw.encode()).hexdigest()
        uid=hashlib.sha256(f"{topic}|{query}".encode()).hexdigest()[:32]
        with self.transaction() as con:
            before=con.execute('SELECT 1 FROM knowledge_candidates WHERE id=?',(uid,)).fetchone()
            con.execute('''INSERT OR IGNORE INTO knowledge_candidates(
                id,topic,query,source_origin,created_at_utc,updated_at_utc,last_scout_utc,status,hypothesis_json,hypothesis_sha256,active_rule)
                VALUES(?,?,?,?,?,?,?,?,?,?,0)''',(uid,topic,query,str(source_origin or 'UNKNOWN'),int(created_at),int(created_at),0,'SEEDED_REFERENCE',raw,h))
            row=con.execute('SELECT hypothesis_sha256 FROM knowledge_candidates WHERE id=?',(uid,)).fetchone()
            if not row or row['hypothesis_sha256']!=h:raise ValueError('Knowledge candidate hypothesis is immutable once seeded')
        return uid if not before else None

    def next_knowledge_candidates(self,limit=2):
        rows=self.db.execute('SELECT * FROM knowledge_candidates ORDER BY last_scout_utc ASC,created_at_utc ASC LIMIT ?',(int(limit),)).fetchall()
        return [self._knowledge_candidate_row(r) for r in rows]

    def touch_knowledge_candidate(self,candidate_id,scouted_at,status):
        with self.transaction() as con:
            con.execute('UPDATE knowledge_candidates SET last_scout_utc=?,updated_at_utc=?,status=?,active_rule=0 WHERE id=?',
                        (int(scouted_at),int(scouted_at),str(status),candidate_id))

    def _knowledge_candidate_row(self,r):
        d=dict(r);d['hypothesis']=json.loads(d['hypothesis_json']);d['hash_valid']=hashlib.sha256(d['hypothesis_json'].encode()).hexdigest()==d['hypothesis_sha256']
        d['active_rule']=bool(d.get('active_rule'));return d

    def recent_knowledge_candidates(self,limit=20):
        rows=self.db.execute('SELECT * FROM knowledge_candidates ORDER BY updated_at_utc DESC,topic LIMIT ?',(int(limit),)).fetchall()
        out=[]
        for r in rows:
            d=self._knowledge_candidate_row(r)
            d['source_count']=self.db.execute('SELECT COUNT(*) FROM knowledge_sources WHERE candidate_id=?',(d['id'],)).fetchone()[0]
            out.append(d)
        return out

    def save_knowledge_source(self,candidate_id,source,retrieved_at):
        if not isinstance(source,dict):raise ValueError('Knowledge source payload required')
        fam=str(source.get('source_family') or '').strip().upper();key=str(source.get('source_key') or '').strip();title=' '.join(str(source.get('title') or '').split())
        if not fam or not key or not title:raise ValueError('Knowledge source family/key/title required')
        payload=dict(source);raw=json.dumps(payload,sort_keys=True,separators=(',',':'),ensure_ascii=False,default=str);h=hashlib.sha256(raw.encode()).hexdigest()
        uid=hashlib.sha256(f"{candidate_id}|{fam}|{key}".encode()).hexdigest()[:32]
        with self.transaction() as con:
            if not con.execute('SELECT 1 FROM knowledge_candidates WHERE id=?',(candidate_id,)).fetchone():raise KeyError('Unknown knowledge candidate')
            before=con.execute('SELECT 1 FROM knowledge_sources WHERE id=?',(uid,)).fetchone()
            con.execute('''INSERT OR IGNORE INTO knowledge_sources(
                id,candidate_id,source_family,source_key,title,publisher,doi,source_url,source_published_utc,retrieved_at_utc,payload_json,payload_sha256)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',(uid,candidate_id,fam,key,title,source.get('publisher'),source.get('doi'),source.get('url'),source.get('published_utc'),int(retrieved_at),raw,h))
            row=con.execute('SELECT payload_sha256 FROM knowledge_sources WHERE id=?',(uid,)).fetchone()
            if not row or row['payload_sha256']!=h:raise ValueError('Knowledge source evidence differs from stored immutable source')
        return uid if not before else None

    def knowledge_sources(self,candidate_id,limit=50):
        rows=self.db.execute('SELECT * FROM knowledge_sources WHERE candidate_id=? ORDER BY retrieved_at_utc DESC LIMIT ?',(candidate_id,int(limit))).fetchall();out=[]
        for r in rows:
            d=dict(r);payload=json.loads(d['payload_json']);valid=hashlib.sha256(d['payload_json'].encode()).hexdigest()==d['payload_sha256']
            payload.update({'id':d['id'],'candidate_id':candidate_id,'hash_valid':valid});out.append(payload)
        return out

    def save_knowledge_scout_run(self,started_at,report):
        raw=json.dumps(report,sort_keys=True,separators=(',',':'),ensure_ascii=False,default=str);h=hashlib.sha256(raw.encode()).hexdigest()
        finished=int(report.get('finished_at_utc') or started_at);algo=str(report.get('version') or 'UNKNOWN')
        uid=hashlib.sha256(f"{int(started_at)}|{algo}|{h}".encode()).hexdigest()[:32]
        with self.transaction() as con:
            con.execute('INSERT OR IGNORE INTO knowledge_scout_runs VALUES(?,?,?,?,?,?)',(uid,int(started_at),finished,algo,raw,h))
        return uid

    def recent_knowledge_scout_runs(self,limit=10):
        rows=self.db.execute('SELECT * FROM knowledge_scout_runs ORDER BY started_at_utc DESC LIMIT ?',(int(limit),)).fetchall();out=[]
        for r in rows:
            d=dict(r);d['report']=json.loads(d['report_json']);d['hash_valid']=hashlib.sha256(d['report_json'].encode()).hexdigest()==d['report_sha256'];out.append(d)
        return out

    def save_pattern_observation(self,broker,symbol,profile,tf,candle_open_utc,observed_at_utc,algorithm,playbook,side,patterns,context):
        payload={'patterns':patterns or [],'context':context or {}}
        raw=json.dumps(payload,sort_keys=True,separators=(',',':'),ensure_ascii=False,default=str);h=hashlib.sha256(raw.encode()).hexdigest()
        uid=hashlib.sha256(f"{broker}|{symbol}|{profile}|{tf}|{int(candle_open_utc)}|{algorithm}".encode()).hexdigest()[:32]
        with self.transaction() as con:
            con.execute('''INSERT OR IGNORE INTO pattern_observations(
              id,broker,symbol,profile,tf,candle_open_utc,observed_at_utc,algorithm,playbook,side,patterns_json,context_json,payload_sha256)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',
              (uid,broker,symbol,profile,tf,int(candle_open_utc),int(observed_at_utc),algorithm,playbook,side,
               json.dumps(patterns or [],sort_keys=True,separators=(',',':'),ensure_ascii=False,default=str),
               json.dumps(context or {},sort_keys=True,separators=(',',':'),ensure_ascii=False,default=str),h))
        return uid

    def recent_pattern_observations(self,profile=None,limit=20):
        q='SELECT * FROM pattern_observations';args=[]
        if profile:q+=' WHERE profile=?';args.append(str(profile).upper())
        q+=' ORDER BY observed_at_utc DESC LIMIT ?';args.append(int(limit))
        out=[]
        for r in self.db.execute(q,args).fetchall():
            d=dict(r);pjson=d.pop('patterns_json');cjson=d.pop('context_json')
            d['patterns']=json.loads(pjson);d['context']=json.loads(cjson)
            raw=json.dumps({'patterns':d['patterns'],'context':d['context']},sort_keys=True,separators=(',',':'),ensure_ascii=False,default=str)
            d['hash_valid']=hashlib.sha256(raw.encode()).hexdigest()==d['payload_sha256'];out.append(d)
        return out

    def knowledge_scout_summary(self):
        total=self.db.execute('SELECT COUNT(*) FROM knowledge_candidates').fetchone()[0]
        sourced=self.db.execute("SELECT COUNT(*) FROM knowledge_candidates WHERE status!='SEEDED_REFERENCE' AND status!='NO_EXTERNAL_SOURCE_FOUND'").fetchone()[0]
        multi=self.db.execute("SELECT COUNT(*) FROM knowledge_candidates WHERE status='MULTI_SOURCE_RESEARCHED_FORWARD_TEST_ONLY'").fetchone()[0]
        sources=self.db.execute('SELECT COUNT(*) FROM knowledge_sources').fetchone()[0]
        runs=self.db.execute('SELECT COUNT(*) FROM knowledge_scout_runs').fetchone()[0]
        last=self.db.execute('SELECT MAX(started_at_utc) FROM knowledge_scout_runs').fetchone()[0]
        return {'candidate_count':total,'sourced_candidates':sourced,'multi_source_candidates':multi,'source_records':sources,'scout_runs':runs,'last_scout_utc':last,
                'auto_rule_mutation':False,'forward_validation_required':True,'walk_forward_required':True}

    def status(self):
        return {'candles':self.db.execute('SELECT COUNT(*) FROM candles').fetchone()[0],
          'observations':self.db.execute('SELECT COUNT(*) FROM observations').fetchone()[0],
          'observation_receipts':self.db.execute('SELECT COUNT(*) FROM observation_receipts').fetchone()[0],
          'signals':self.db.execute('SELECT COUNT(*) FROM signals').fetchone()[0],
          'research_runs':self.db.execute('SELECT COUNT(*) FROM research_runs').fetchone()[0],
          'observer_checkpoints':self.db.execute('SELECT COUNT(*) FROM observer_checkpoints').fetchone()[0],
          'events':self.db.execute('SELECT COUNT(*) FROM events').fetchone()[0],
          'candle_conflicts':self.db.execute('SELECT COUNT(*) FROM candle_conflicts').fetchone()[0],
          'behaviour_reviews':self.db.execute('SELECT COUNT(*) FROM behaviour_reviews').fetchone()[0],
          'forensic_cases':self.db.execute('SELECT COUNT(*) FROM forensic_cases').fetchone()[0],
          'intelligence_snapshots':self.db.execute('SELECT COUNT(*) FROM intelligence_snapshots').fetchone()[0],
          'market_events':self.db.execute('SELECT COUNT(*) FROM market_events').fetchone()[0],
          'canonical_market_events':self.canonical_market_event_count(),
          'learning_cases':self.db.execute('SELECT COUNT(*) FROM learning_cases').fetchone()[0],
          'learning_followups':self.db.execute('SELECT COUNT(*) FROM learning_followups').fetchone()[0],
          'self_reviews':self.db.execute('SELECT COUNT(*) FROM self_reviews').fetchone()[0],
          'signal_self_reviews':self.db.execute('SELECT COUNT(*) FROM signal_self_reviews').fetchone()[0],
          'closed_loop_reviews':self.db.execute('SELECT COUNT(*) FROM closed_loop_reviews').fetchone()[0],
          'lesson_evidence':self.db.execute('SELECT COUNT(*) FROM lesson_evidence').fetchone()[0],
          'publication_rejections':self.db.execute('SELECT COUNT(*) FROM publication_rejections').fetchone()[0],
          'missed_opportunity_reviews':self.db.execute('SELECT COUNT(*) FROM missed_opportunity_reviews').fetchone()[0],
          'correction_trials':self.db.execute('SELECT COUNT(*) FROM correction_trials').fetchone()[0],
          'correction_effectiveness_reviews':self.db.execute('SELECT COUNT(*) FROM correction_effectiveness_reviews').fetchone()[0],
          'technical_evidence_trials':self.db.execute('SELECT COUNT(*) FROM technical_evidence_trials').fetchone()[0],
          'technical_evidence_outcomes':self.db.execute('SELECT COUNT(*) FROM technical_evidence_outcomes').fetchone()[0],
          'mentor_updates':self.db.execute('SELECT COUNT(*) FROM mentor_updates').fetchone()[0],
          'autonomous_mentor_updates':self.db.execute('SELECT COUNT(*) FROM autonomous_mentor_updates').fetchone()[0],
          'scalping_opportunities':self.db.execute('SELECT COUNT(*) FROM scalping_opportunities').fetchone()[0],
          'knowledge_candidates':self.db.execute('SELECT COUNT(*) FROM knowledge_candidates').fetchone()[0],
          'knowledge_sources':self.db.execute('SELECT COUNT(*) FROM knowledge_sources').fetchone()[0],
          'knowledge_scout_runs':self.db.execute('SELECT COUNT(*) FROM knowledge_scout_runs').fetchone()[0],
          'pattern_observations':self.db.execute('SELECT COUNT(*) FROM pattern_observations').fetchone()[0],
          'db_path':str(self.path)}

    def save_forensic_case(self, report):
        """Append-only retrospective case; never alter earlier analysis after outcomes."""
        if report.get('status') not in ('HISTORICAL_FORENSIC_REVIEW','EVENT_FORENSIC_REVIEW'):raise ValueError('Only complete forensic cases stored')
        candle=report['candle'];raw=json.dumps(report,sort_keys=True,separators=(',',':'),ensure_ascii=False)
        digest=hashlib.sha256(raw.encode()).hexdigest()
        key=[report['broker'],report['symbol'],report['tf'],candle['candle_open_utc'],report['algorithm']]
        uid=hashlib.sha256(json.dumps(key,separators=(',',':')).encode()).hexdigest()[:32]
        with self.transaction() as con:
            con.execute("INSERT OR IGNORE INTO forensic_cases VALUES(?,?,?,?,?,?,?,?,?,?)",
              (uid,*key[:3],key[3],report['observed_at_utc'],key[4],report['classification'],raw,digest))
        return uid

    def recent_forensic_cases(self,broker,symbol,limit=10):
        rows=self.db.execute("SELECT * FROM forensic_cases WHERE broker=? AND symbol=? ORDER BY analyzed_at_utc DESC LIMIT ?",(broker,symbol,int(limit))).fetchall()
        return [{'id':r['id'],'candle_open_utc':r['candle_open_utc'],
                 'analyzed_at_utc':r['analyzed_at_utc'],'tf':r['tf'],
                 'classification':r['classification'],'algorithm':r['algorithm'],
                 'evidence_hash_valid':hashlib.sha256(r['evidence_json'].encode()).hexdigest()==r['evidence_sha256'],
                 'report':json.loads(r['evidence_json'])} for r in rows]
