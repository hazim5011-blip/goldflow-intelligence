"""Only verified external raw data are accepted; no legacy indicator output."""
from dataclasses import dataclass, field
from pathlib import Path
import os

TF_SECONDS = {'M1':60,'M5':300,'M15':900,'M30':1800,'H1':3600,'H4':14400,'D1':86400,'W1':604800}
PROFILE_TF = {'SCALPING': ('M5','M15','H1'), 'DAY': ('M15','H1','H4'),
              'SWING': ('H4','D1','W1'), 'POSITION': ('D1','W1','W1')}
# Research requirements are NOT necessarily every displayed profile timeframe.
# Swing H4 entry is confirmed by D1. W1 is an optional independent, longer-term
# veto/context only once it has a full 80 CLOSED weekly bars. Never fabricate
# extra weekly history or treat a short weekly sample as a directional vote.
# Position Trading still requires 80 CLOSED bars of both D1 and W1.
PROFILE_REQUIRED_TF = {'SCALPING': ('M5','M15','H1'), 'DAY': ('M15','H1','H4'),
                       'SWING': ('H4','D1'), 'POSITION': ('D1','W1')}
PROFILE_OPTIONAL_TF = {'SCALPING': (), 'DAY': (), 'SWING': ('W1',), 'POSITION': ()}
# Different research horizons have separate risk/retest policies; these are
# initial hypotheses, NOT learned settings or proven optimal trading rules.
PROFILE_RULES = {
 'SCALPING':{'ttl_candles':2,'target_r':(1.0,1.55,2.2),'max_spread_atr':.07,'min_score':60},
 'DAY':{'ttl_candles':3,'target_r':(1.2,2.0,3.0),'max_spread_atr':.10,'min_score':60},
 'SWING':{'ttl_candles':4,'target_r':(1.5,2.5,3.8),'max_spread_atr':.13,'min_score':64},
 'POSITION':{'ttl_candles':6,'target_r':(1.8,3.2,5.0),'max_spread_atr':.16,'min_score':64}}


@dataclass(frozen=True)
class Settings:
    data_path: Path = field(default_factory=lambda: Path(os.getenv('AAT_DB','./data/gf_aat.sqlite3')))
    # Public website: server-side API/bars is read-only and bounded to 5000 candles.
    website_url: str = field(default_factory=lambda:os.getenv('AAT_WEBSITE_URL','https://goldflow-intelligence-cf-test.pages.dev'))
    bridge_url: str = field(default_factory=lambda:os.getenv('AAT_BRIDGE_URL',''))
    bridge_key: str = field(default_factory=lambda:os.getenv('AAT_BRIDGE_KEY',''))
    mt5_terminal_path: str = field(default_factory=lambda:os.getenv('AAT_MT5_TERMINAL_PATH',''))
    symbol: str = field(default_factory=lambda:os.getenv('AAT_SYMBOL','XAUUSD247'))
    source: str = field(default_factory=lambda:os.getenv('AAT_SOURCE','website'))  # website, bridge or direct local mt5
    # No orders are ever submitted. Paper positions require explicit user action.
    verified_direct_broker_offset: int | None = field(default_factory=lambda:int(os.environ['AAT_DIRECT_BROKER_OFFSET_SECONDS']) if os.getenv('AAT_DIRECT_BROKER_OFFSET_SECONDS') else None)
    grace_seconds: int = 3
    max_quote_age_seconds: int = 35
    max_spread_atr: float = .12
    risk_pct: float = .005
    backfill_limit: int = 5000

    def validate(self):
        if self.source not in ('website','bridge','mt5'): raise ValueError('AAT_SOURCE must be website, bridge or mt5')
        if self.source == 'bridge' and (not self.bridge_url or not self.bridge_key):
            raise ValueError('AAT_BRIDGE_URL and AAT_BRIDGE_KEY required; never use an unauthenticated local bridge')
        if self.source == 'bridge' and (self.verified_direct_broker_offset is None or abs(self.verified_direct_broker_offset)>50400):
            raise ValueError('AAT_DIRECT_BROKER_OFFSET_SECONDS must be verified for direct raw bridge clock')
        if self.backfill_limit > 5000 or self.backfill_limit < 50: raise ValueError('Backfill must be 50..5000')
        return self
