"""Windows-friendly independent collector & mentor server.

Usage:
  python -m aat backfill
  python -m aat run --poll 30
  python -m aat web
  python -m aat csv-import --path file.csv --broker "VantageMarkets-Live 3" --tf M5
  python -m aat replay --profile SCALPING --friction-abs 0.3
"""
import argparse,os,time,json,secrets
from pathlib import Path


def _pid_alive(pid):
    """Check a PID without signalling/terminating it on Windows."""
    try:
        pid=int(pid)
        if pid<=0:return False
        if os.name=='nt':
            import ctypes
            PROCESS_QUERY_LIMITED_INFORMATION=0x1000
            STILL_ACTIVE=259
            handle=ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,False,pid)
            if not handle:return False
            try:
                code=ctypes.c_ulong()
                ok=ctypes.windll.kernel32.GetExitCodeProcess(handle,ctypes.byref(code))
                return bool(ok and code.value==STILL_ACTIVE)
            finally:
                ctypes.windll.kernel32.CloseHandle(handle)
        os.kill(pid,0)
        return True
    except Exception:
        return False


def _claim_single_instance(name):
    """Create a conservative PID guard for long-running GF-AAT loops.

    The guard never kills another process. A stale PID file is replaced only when
    that PID is no longer alive.
    """
    path=Path('./data')/(name+'.pid');path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists():
        try:old=int(path.read_text(encoding='utf-8').strip() or 0)
        except Exception:old=0
        if old and _pid_alive(old):raise SystemExit(f'{name} already running with PID {old}')
        try:path.unlink()
        except Exception:pass
    path.write_text(str(os.getpid()),encoding='utf-8')
    return path


def _release_single_instance(path):
    try:
        if path and path.exists() and path.read_text(encoding='utf-8').strip()==str(os.getpid()):path.unlink()
    except Exception:pass

def load_env(filename='.env'):
    p=Path(filename)
    if not p.exists():return
    for line in p.read_text(encoding='utf-8-sig').splitlines():
        s=line.strip()
        if not s or s.startswith('#') or '=' not in s:continue
        k,v=s.split('=',1)
        if k.startswith('AAT_') and k.strip()==k:
            os.environ.setdefault(k.strip(),v.strip().strip('"').strip("'"))

def main():
    p=argparse.ArgumentParser(description='GF-AAT live MT5 professional autonomous research robot V1.6.3 R5.15')
    sub=p.add_subparsers(dest='command',required=True)
    back=sub.add_parser('backfill');back.add_argument('--tfs',default='M1,M5,M15,M30,H1,H4,D1,W1')
    live=sub.add_parser('run');live.add_argument('--poll',type=int,default=30)
    web=sub.add_parser('web');web.add_argument('--port',type=int,default=8789)
    csv=sub.add_parser('csv-import');csv.add_argument('--path',required=True);csv.add_argument('--broker',required=True)
    csv.add_argument('--symbol',default=None);csv.add_argument('--tf',required=True)
    replay=sub.add_parser('replay');replay.add_argument('--broker',required=True);replay.add_argument('--profile',default='SCALPING')
    replay.add_argument('--samples',type=int,default=120);replay.add_argument('--friction-abs',type=float,default=0.0)
    sub.add_parser('status')
    sub.add_parser('probe')
    backup=sub.add_parser('backup');backup.add_argument('--out',default=None)
    sub.add_parser('cloud-sync')
    pos=sub.add_parser('position-backfill');pos.add_argument('--days',type=int,default=1460)
    pos.add_argument('--broker',default=None)
    a=p.parse_args();load_env()
    from .settings import Settings,PROFILE_TF
    from .service import ResearchService
    from .collector import import_csv
    s=ResearchService(Settings())
    if a.command=='cloud-sync':
        from .cloud_sync import CloudMemorySync
        print(json.dumps(CloudMemorySync(s.store).sync_once(),indent=2));return
    if a.command=='backup':
        dest=a.out or ('./backups/gf_aat_'+time.strftime('%Y%m%d_%H%M%S')+'.sqlite3')
        print(json.dumps(s.store.backup(dest),indent=2));return
    if a.command=='position-backfill':
        if not 120<=a.days<=365*12:raise SystemExit('Position backfill days must be 120..4380')
        try:import MetaTrader5 as mt5
        except Exception as e:raise SystemExit('MetaTrader5 Python package unavailable: '+str(e))
        if not mt5.initialize():raise SystemExit('MT5 initialize failed: '+str(mt5.last_error()))
        try:
            from datetime import datetime,timezone,timedelta
            from .history_backfill import collect_mt5_history,check_overlap
            info=mt5.terminal_info();account=mt5.account_info()
            if info is None or account is None:raise SystemExit('MT5 terminal/account not connected')
            broker=a.broker
            if not broker:
                row=s.store.db.execute('SELECT broker FROM candles WHERE symbol=? GROUP BY broker ORDER BY COUNT(*) DESC LIMIT 1',(s.settings.symbol,)).fetchone()
                broker=row['broker'] if row else str(getattr(account,'server','MT5'))
            end=datetime.now(timezone.utc);start=end-timedelta(days=a.days);report={}
            for tf in ('D1','W1'):
                incoming=collect_mt5_history(mt5,broker,s.settings.symbol,tf,start,end,int(time.time()),offset_seconds=s.settings.verified_direct_broker_offset or 0)
                existing=s.store.candles(broker,s.settings.symbol,tf,limit=5000)
                overlap=check_overlap(existing,incoming,min_matches=3 if existing else 0)
                saved=s.store.save_candles(incoming)
                report[tf]={**overlap,**saved,'received':len(incoming)}
            print(json.dumps({'ok':True,'broker':broker,'symbol':s.settings.symbol,'report':report,'orders_sent':0,
                              'classification':'RETROSPECTIVE_HISTORY_BACKFILL_NOT_FORWARD_SIGNAL'},indent=2))
        finally:mt5.shutdown()
        return
    if a.command=='probe':
        now=int(time.time())
        try:
            rows,meta=s.collector.fetch_bars(s.settings.symbol,'M5',20,now)
            print('RAW MT5 HISTORICAL SOURCE: REACHABLE')
            print('Exact symbol:',s.settings.symbol,'broker source:',meta['source'])
            print('Closed M5 candles:',len(rows),'broker UTC offset seconds:',meta['utc_offset'])
            print('Latest closed open UTC:',time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(rows[-1].t)) if rows else 'none')
            print('Open/incomplete candles excluded:',meta['skipped_open'])
            try:
                q=s.collector.fetch_quote(s.settings.symbol,now)
                print('FRESH EXECUTABLE BID/ASK VERIFIED:',q.bid,q.ask,'tick time UTC:',q.time_utc)
            except Exception as e:
                print('MARKET QUOTE UNVERIFIED / MAY BE CLOSED:',type(e).__name__)
            print('NOTHING WAS SENT TO BROKER. NO INDICATOR OUTPUT WAS USED.')
        except Exception as e:
            print('SOURCE VALIDATION FAILED:',type(e).__name__,str(e)[:180])
            raise SystemExit(2)
        return
    if a.command=='status':
        print(json.dumps(s.diagnostics(),indent=2));return
    if a.command=='backfill':
        frames=[x.strip().upper() for x in a.tfs.split(',')]
        print(json.dumps(s.collect(tfs=frames,initial=True),indent=2));
        print('DATA LABEL: RETROSPECTIVE ARCHIVE • NOT FORWARD SIGNAL PROOF');return
    if a.command=='csv-import':
        print(json.dumps(import_csv(s.store,a.path,a.broker,a.symbol or s.settings.symbol,a.tf.upper()),indent=2));return
    if a.command=='replay':
        from .replay import retrospective_replay
        p0=a.profile.upper()
        if p0 not in PROFILE_TF:raise SystemExit('Unknown profile')
        frames=s.frames(a.broker,p0,limit=5000)
        d=retrospective_replay(p0,frames,a.samples,friction_abs=a.friction_abs)
        print(json.dumps(d,indent=2));return
    if a.command=='web':
        import uvicorn
        # The admin token remains in server env only; never put it in browser JS.
        uvicorn.run('aat.web:app',host='127.0.0.1',port=a.port,workers=1,log_level='warning');return
    if a.command=='run':
        if not 15<=a.poll<=3600:raise SystemExit('Poll interval 15..3600 seconds')
        run_lock=_claim_single_instance('gf_aat_research_loop')
        print('GF-AAT V1.6.3 R5.14 STABLE-R4-CORE AUTONOMOUS KNOWLEDGE SCOUT + LIVE MT5 RESEARCH LOOP / NO BROKER ORDER EXECUTION')
        print('Market source:',s.settings.source,'symbol:',s.settings.symbol)
        print('Backfilling archive once (up to 5000 per TF); all prior bars are RETROSPECTIVE.')
        print(json.dumps(s.collect(initial=True),indent=2))
        last_news=0;last_macro=0;last_backup=0;last_cloud=0
        knowledge_interval=max(3600,int(os.getenv('AAT_KNOWLEDGE_SCOUT_INTERVAL_SECONDS','21600') or 21600))
        # Do the first external knowledge review about 10 minutes after startup,
        # then return to the low-frequency interval. This keeps startup/MT5 hot path
        # responsive while still making a new installation visibly self-updating.
        last_knowledge=int(time.time())-knowledge_interval+600
        try:
            while True:
                now=int(time.time());report=s.collect(now=now)
                row=s.store.db.execute('SELECT broker FROM candles WHERE symbol=? GROUP BY broker ORDER BY COUNT(*) DESC LIMIT 1',(s.settings.symbol,)).fetchone()
                if row:
                    try:q=s.collector.fetch_quote(s.settings.symbol,now)
                    except Exception:q=None
                    d=s.research_cycle(row['broker'],now=now,quote=q)
                    print(time.strftime('%Y-%m-%d %H:%M:%S'),json.dumps({
                      'quote_verified':q is not None,'ingested_tfs':list(report),
                      'profiles':{p:x.get('status') for p,x in d.items()},'orders_sent':0}),flush=True)
                if now-last_backup>=86400:
                    print('LOCAL ONLINE BACKUP:',s.store.backup('./backups/gf_aat_'+time.strftime('%Y%m%d')+'.sqlite3'))
                    last_backup=now
                if now-last_cloud>=120 and os.getenv('AAT_CLOUD_ARCHIVE_URL') and os.getenv('AAT_CLOUD_INGEST_KEY'):
                    try:
                        from .cloud_sync import CloudMemorySync
                        print('SIGNED OWN D1 ARCHIVE:',json.dumps(CloudMemorySync(s.store).sync_once()))
                    except Exception as e:print('CLOUD ARCHIVE WAIT:',type(e).__name__)
                    last_cloud=now
                if now-last_news>=600:
                    from .raw_news import pull_public_headlines
                    print('RAW HEADLINE FEEDS:',json.dumps(pull_public_headlines(s.store,now=now)),flush=True)
                    last_news=now
                if now-last_macro>=900:
                    try:
                        from .external_context import pull_goldflow_macro
                        print('RAW MACRO CONTEXT:',json.dumps(pull_goldflow_macro(s.store,s.settings.website_url,now=now)),flush=True)
                    except Exception as e:print('MACRO CONTEXT WAIT:',type(e).__name__)
                    last_macro=now
                # R5.14 autonomous knowledge scout + pattern brain: low-frequency, non-fatal and
                # completely separate from trade authorization.  It stores source
                # provenance and candidate lessons, but can never mutate live rules.
                if os.getenv('AAT_KNOWLEDGE_SCOUT','1').strip().lower() not in ('0','false','off','no') and now-last_knowledge>=knowledge_interval:
                    try:
                        from .knowledge_scout import run_scout
                        print('KNOWLEDGE SCOUT:',json.dumps(run_scout(s.store,now=now,max_topics=2)),flush=True)
                    except Exception as e:print('KNOWLEDGE SCOUT WAIT:',type(e).__name__)
                    last_knowledge=now
                time.sleep(a.poll)
        except KeyboardInterrupt:print('Collector stopped safely. Archived candles and audit records remain on disk.')
        finally:_release_single_instance(run_lock)
if __name__=='__main__':main()
