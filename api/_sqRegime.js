import {n,clamp,sign} from "./_sqFeatures.js";

function add(list,text){if(text&&!list.includes(text))list.push(text)}
export function classifySmartRegime(features,analysis){
  if(!features?.ready)return {name:"UNKNOWN",direction:0,confidence:0,conditions:[],support:[],opposition:[features?.reason||"FEATURES_NOT_READY"],confidenceMeaning:"MODEL_STATE_CONFIDENCE_NOT_WIN_PROBABILITY"};

  const support=[],opposition=[],conditions=[];
  const setup=sign(features.setupTrend),bias=sign(features.biasTrend),sig=sign(features.signalDirection);
  const highVol=n(features.atrPercentile)!=null&&features.atrPercentile>=85;
  const lowVol=n(features.atrPercentile)!=null&&features.atrPercentile<=20;
  if(highVol)conditions.push("HIGH_VOLATILITY");
  if(lowVol)conditions.push("LOW_VOLATILITY");
  if(features.mtfConflict)conditions.push("MTF_CONFLICT");
  if(features.sweepDown||features.sweepUp)conditions.push("LIQUIDITY_SWEEP");
  if(features.breakoutUp||features.breakoutDown)conditions.push("BREAKOUT_EXPANSION");

  let name="MIXED_CONFLICT",direction=0,base=48;
  if(features.breakoutUp||features.breakoutDown){
    name="BREAKOUT_EXPANSION";direction=features.breakoutUp?1:-1;base=72;
    add(support,direction>0?"Closed candle broke above prior 20-bar high with expansion.":"Closed candle broke below prior 20-bar low with expansion.");
  }else if(features.sweepDown||features.sweepUp){
    name="LIQUIDITY_SWEEP";direction=features.sweepDown?1:-1;base=68;
    add(support,direction>0?"Lower-liquidity sweep reclaimed the prior 20-bar low.":"Upper-liquidity sweep rejected the prior 20-bar high.");
  }else{
    const bull=features.emaSpreadAtr>.20&&features.ema20SlopeAtr5>.05;
    const bear=features.emaSpreadAtr<-.20&&features.ema20SlopeAtr5<-.05;
    if(bull&&(setup>=0&&bias>=0)){name="TREND_BULL";direction=1;base=70;add(support,"EMA20 is above EMA50 with positive normalized slope.");}
    else if(bear&&(setup<=0&&bias<=0)){name="TREND_BEAR";direction=-1;base=70;add(support,"EMA20 is below EMA50 with negative normalized slope.");}
    else if(Math.abs(features.emaSpreadAtr)<.18&&Math.abs(features.ema20SlopeAtr5)<.08){name="RANGE";direction=0;base=67;add(support,"EMA compression and flat normalized slope indicate range behavior.");}
    else {name="MIXED_CONFLICT";direction=0;base=50;add(opposition,"Trend, slope and multi-timeframe evidence are not aligned.");}
  }

  if(direction&&setup===direction){base+=6;add(support,"Setup timeframe agrees with regime direction.");}
  else if(direction&&setup===-direction){base-=14;add(opposition,"Setup timeframe opposes regime direction.");}
  if(direction&&bias===direction){base+=8;add(support,"Bias timeframe agrees with regime direction.");}
  else if(direction&&bias===-direction){base-=18;add(opposition,"Bias timeframe opposes regime direction.");}
  if(direction&&sig===direction){base+=4;add(support,"Latest signal direction agrees with regime.");}
  else if(direction&&sig===-direction){base-=10;add(opposition,"Latest signal direction conflicts with regime.");}
  if(highVol){base-=5;add(opposition,"High volatility increases execution and stop-out risk.");}
  if(lowVol&&name.startsWith("TREND")){base-=6;add(opposition,"Low volatility weakens trend follow-through.");}
  if(features.mtfConflict){base-=12;add(opposition,"Setup and bias timeframes conflict.");}

  const confidence=clamp(Math.round(base),0,95);
  return {
    name,direction,confidence,conditions,support,opposition,
    atrPercentile:n(features.atrPercentile)!=null?Math.round(features.atrPercentile):null,
    confidenceMeaning:"MODEL_STATE_CONFIDENCE_NOT_WIN_PROBABILITY",
    evaluatedAtUTC:new Date().toISOString()
  };
}
