from dataclasses import dataclass, asdict
from hashlib import sha256
import json
import math

@dataclass(frozen=True)
class Candle:
    broker: str
    symbol: str
    tf: str
    t: int  # UTC opening timestamp corrected for broker clock offset
    o: float
    h: float
    l: float
    c: float
    v: float
    source: str
    first_seen_utc: int

    def validate(self):
        nums=(self.o,self.h,self.l,self.c,self.v)
        if not all(isinstance(x,(float,int)) and math.isfinite(x) for x in nums): raise ValueError('Nonfinite OHLC/volume')
        if min(self.o,self.h,self.l,self.c)<=0 or self.v<0: raise ValueError('Price/volume range invalid')
        if self.h < max(self.o,self.c,self.l) or self.l > min(self.o,self.h,self.c):
            raise ValueError('Invalid OHLC shape')
        if not self.broker or not self.symbol or not self.tf or self.t<=0: raise ValueError('Missing candle identity')
        if self.first_seen_utc < self.t: raise ValueError('Observation cannot predate candle opening')
        if not self.source: raise ValueError('Must retain authentic source')
        return self

    def digest(self):
        body={k:v for k,v in asdict(self).items() if k not in ('first_seen_utc','source')}
        return sha256(json.dumps(body,sort_keys=True,separators=(',',':')).encode()).hexdigest()

@dataclass(frozen=True)
class Quote:
    symbol: str
    broker: str
    bid: float
    ask: float
    time_utc: int
    source: str

    def validate(self, now:int, max_age=35):
        if self.bid<=0 or self.ask<=0 or self.ask<self.bid: raise ValueError('Invalid bid/ask')
        if self.time_utc>now+3 or now-self.time_utc>max_age: raise ValueError('Stale or future broker quote')
        if not self.source or not self.broker or not self.symbol: raise ValueError('Quote source unverified')
        return self
