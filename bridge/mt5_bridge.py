import os, time, json, re, glob
from typing import Optional
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import MetaTrader5 as mt5

load_dotenv()
APP_PORT=int(os.getenv("BRIDGE_PORT","8787"))
BRIDGE_KEY=os.getenv("BRIDGE_KEY","").strip()
MT5_PATH=os.getenv("MT5_TERMINAL_PATH","").strip()
BROKER_NAME=os.getenv("BROKER_NAME","Vantage").strip() or "Vantage"
try:
    SYMBOL_MAP=json.loads(os.getenv("SYMBOL_MAP_JSON","{}"))
except Exception:
    SYMBOL_MAP={}

TF={"M1":mt5.TIMEFRAME_M1,"M5":mt5.TIMEFRAME_M5,"M15":mt5.TIMEFRAME_M15,
    "M30":mt5.TIMEFRAME_M30,"H1":mt5.TIMEFRAME_H1,"H4":mt5.TIMEFRAME_H4,
    "D1":mt5.TIMEFRAME_D1,"W1":mt5.TIMEFRAME_W1,"MN1":mt5.TIMEFRAME_MN1}

app=FastAPI(title="GoldFlow Vantage MT5 Bridge",version="2.0.0")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_credentials=False,allow_methods=["GET"],allow_headers=["*"])

def auth(key:Optional[str]):
    if BRIDGE_KEY and key!=BRIDGE_KEY:
        raise HTTPException(status_code=401,detail="Invalid bridge key")

def norm(s:str)->str:
    return re.sub(r"[^A-Z0-9]","",s.upper())

def candidate_mt5_paths():
    paths=[]
    if MT5_PATH: paths.append(MT5_PATH)
    roots=[os.environ.get("ProgramFiles"),os.environ.get("ProgramFiles(x86)"),os.environ.get("LOCALAPPDATA")]
    for root in [r for r in roots if r]:
        for pat in ["**/terminal64.exe","**/terminal.exe"]:
            try:
                for p in glob.glob(os.path.join(root,pat),recursive=True):
                    low=p.lower()
                    if "vantage" in low or "meta trader" in low or "metatrader" in low:
                        paths.append(p)
            except Exception:
                pass
    seen=[]
    for p in paths:
        if p and p not in seen: seen.append(p)
    seen.sort(key=lambda p:("vantage" not in p.lower(),len(p)))
    return seen

def ensure_mt5():
    ti=mt5.terminal_info()
    if ti is not None and getattr(ti,"connected",False): return True
    mt5.shutdown()
    errors=[]
    for path in candidate_mt5_paths()+[None]:
        try:
            ok=mt5.initialize(path=path) if path else mt5.initialize()
            if ok and mt5.terminal_info() is not None: return True
            errors.append(f"{path or 'auto'}: {mt5.last_error()}")
        except Exception as e:
            errors.append(f"{path or 'auto'}: {e}")
        mt5.shutdown()
    raise HTTPException(status_code=503,detail="MT5 initialize failed | "+" | ".join(errors[-4:]))

def resolve_symbol(requested:str)->str:
    ensure_mt5()
    mapped=SYMBOL_MAP.get(requested,requested)
    info=mt5.symbol_info(mapped)
    if info:
        mt5.symbol_select(mapped,True); return mapped
    target=norm(mapped); candidates=[]
    for s in mt5.symbols_get() or []:
        n=norm(s.name)
        if n==target:
            mt5.symbol_select(s.name,True); return s.name
        if target in n or n in target: candidates.append(s.name)
    if candidates:
        candidates.sort(key=lambda x:(abs(len(norm(x))-len(target)),len(x)))
        mt5.symbol_select(candidates[0],True); return candidates[0]
    raise HTTPException(status_code=404,detail=f"Symbol not found: {requested}")

@app.get("/")
def root():
    return {"ok":True,"service":"GoldFlow Vantage MT5 Bridge","version":"2.0.0","docs":"/docs"}

@app.get("/health")
def health(x_bridge_key:Optional[str]=Header(default=None)):
    auth(x_bridge_key); ensure_mt5()
    ti=mt5.terminal_info(); ai=mt5.account_info()
    return {"ok":True,"connected":bool(ti and ti.connected),"broker":BROKER_NAME,
            "terminal":getattr(ti,"name",None),"build":getattr(ti,"build",None),
            "server":getattr(ai,"server",None) if ai else None,"time":int(time.time())}

@app.get("/symbols")
def symbols(filter:str="",x_bridge_key:Optional[str]=Header(default=None)):
    auth(x_bridge_key); ensure_mt5()
    f=norm(filter) if filter else ""; out=[]
    for s in mt5.symbols_get() or []:
        if not f or f in norm(s.name): out.append(s.name)
        if len(out)>=200: break
    return {"ok":True,"filter":filter,"symbols":out}

@app.get("/bars")
def bars(symbol:str=Query(...),tf:str=Query("M5"),limit:int=Query(500,ge=20,le=5000),x_bridge_key:Optional[str]=Header(default=None)):
    auth(x_bridge_key); ensure_mt5()
    tf=tf.upper()
    if tf not in TF: raise HTTPException(status_code=400,detail=f"Unsupported timeframe {tf}")
    sym=resolve_symbol(symbol)
    rates=mt5.copy_rates_from_pos(sym,TF[tf],0,limit)
    if rates is None or len(rates)<10:
        raise HTTPException(status_code=503,detail=f"No rates for {sym} {tf}: {mt5.last_error()}")
    tick=mt5.symbol_info_tick(sym)
    out=[{"t":int(r["time"]),"o":float(r["open"]),"h":float(r["high"]),"l":float(r["low"]),"c":float(r["close"]),"v":float(r["tick_volume"])} for r in rates]
    return {"ok":True,"broker":BROKER_NAME,"requested":symbol,"symbol":sym,"tf":tf,
            "bid":float(tick.bid) if tick else None,"ask":float(tick.ask) if tick else None,
            "spread":float(tick.ask-tick.bid) if tick else None,
            "serverTime":int(tick.time) if tick else int(time.time()),"bars":out}

@app.get("/snapshot")
def snapshot(symbols:str="XAUUSD247,XAUUSD,EURUSD,GBPUSD,AUDUSD,NZDUSD,USDJPY,USDCHF,USDCAD",x_bridge_key:Optional[str]=Header(default=None)):
    auth(x_bridge_key); ensure_mt5(); data={}
    for req in [x.strip() for x in symbols.split(",") if x.strip()]:
        try:
            sym=resolve_symbol(req); t=mt5.symbol_info_tick(sym)
            data[req]={"symbol":sym,"bid":float(t.bid) if t else None,"ask":float(t.ask) if t else None,"time":int(t.time) if t else None}
        except Exception as e:
            data[req]={"error":str(e)}
    return {"ok":True,"broker":BROKER_NAME,"ts":int(time.time()),"data":data}

if __name__=="__main__":
    import uvicorn
    uvicorn.run(app,host="127.0.0.1",port=APP_PORT,log_level="info")
