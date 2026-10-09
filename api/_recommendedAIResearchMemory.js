const clean=x=>String(x||"").toLowerCase();

export const RECOMMENDED_AI_RESEARCH_STATE=Object.freeze({
  "version": 1,
  "updatedAtUTC": "2026-10-09T21:13:12.913Z",
  "mode": "INTERNET_SCOUT_PLUS_REASONING",
  "reasoning": {
    "enabled": true,
    "status": "ONLINE_OPENAI_WEB_REASONING",
    "model": "gpt-6.1-sol"
  },
  "sources": [
    {
      "sourceId": "BLS_LATEST",
      "sourceKind": "official",
      "category": "US_MACRO",
      "title": "Major Economic Indicators Latest Numbers",
      "url": "https://www.bls.gov/bls/",
      "published": "Fri, 9 Oct 2026 10:00:29 -0400",
      "summary": "Consumer Price Index (CPI): +0.4% in Aug 2026 News Release Historical Data Unemployment Rate: 4.2% in Sep 2026 News Release Historical Data Payroll Employment: +29,000(p) in Sep 2026 News Release Historical Data Average Hourly Earnings: +$0.05(p) in Sep 2026 News Release Historical Data Producer Price Index - Final Demand: +0.4%(p) in Aug 2026 News Release Historical Data Employment Cost Index (ECI): +0.9% in 2nd Qtr of 2026 News Release Historical Data Productivity: +1.4% in 2nd Qtr of 2026 News Release Historical Data U.S. Import Price Index: +0.7% in Aug 2026 News Release Historical Data U.S. Export Price Index: +0.6% in Aug 2026 News Release Historical Data p - preliminary",
      "relevance": 17
    },
    {
      "sourceId": "FED_ALL",
      "sourceKind": "official",
      "category": "FED",
      "title": "Federal Reserve Board finalizes changes to enhance the transparency and public accountability of its stress test and reduce volatility in its stress test-related capital requirements",
      "url": "https://www.federalreserve.gov/newsevents/pressreleases/bcreg20260930a.htm",
      "published": "Wed, 30 Sep 2026 13:00:00 GMT",
      "summary": "Federal Reserve Board finalizes changes to enhance the transparency and public accountability of its stress test and reduce volatility in its stress test-related capital requirements",
      "relevance": 14
    },
    {
      "sourceId": "FED_ALL",
      "sourceKind": "official",
      "category": "FED",
      "title": "Federal Reserve Board releases results of the 2025 Survey of Consumer Finances, which provides the public and policymakers with detailed insights into the economic condition of American families",
      "url": "https://www.federalreserve.gov/newsevents/pressreleases/other20261009a.htm",
      "published": "Fri, 9 Oct 2026 14:00:00 GMT",
      "summary": "Federal Reserve Board releases results of the 2025 Survey of Consumer Finances, which provides the public and policymakers with detailed insights into the economic condition of American families",
      "relevance": 11
    },
    {
      "sourceId": "FED_ALL",
      "sourceKind": "official",
      "category": "FED",
      "title": "Federal Reserve Board announces enforcement action against American Express Company to address, among other things, the firm’s failure to sufficiently detect and report certain suspicious activity related to money laundering",
      "url": "https://www.federalreserve.gov/newsevents/pressreleases/enforcement20261008a.htm",
      "published": "Thu, 8 Oct 2026 20:30:00 GMT",
      "summary": "Federal Reserve Board announces enforcement action against American Express Company to address, among other things, the firm’s failure to sufficiently detect and report certain suspicious activity related to money laundering",
      "relevance": 11
    },
    {
      "sourceId": "FED_ALL",
      "sourceKind": "official",
      "category": "FED",
      "title": "Minutes of the Federal Open Market Committee, September 15-16, 2026",
      "url": "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261007a.htm",
      "published": "Wed, 7 Oct 2026 18:00:00 GMT",
      "summary": "Minutes of the Federal Open Market Committee, September 15-16, 2026",
      "relevance": 11
    },
    {
      "sourceId": "FED_ALL",
      "sourceKind": "official",
      "category": "FED",
      "title": "Federal Reserve Board announces approval of application by Isabella Bank Corporation",
      "url": "https://www.federalreserve.gov/newsevents/pressreleases/orders20261005a.htm",
      "published": "Mon, 5 Oct 2026 20:30:00 GMT",
      "summary": "Federal Reserve Board announces approval of application by Isabella Bank Corporation",
      "relevance": 11
    },
    {
      "sourceId": "FED_ALL",
      "sourceKind": "official",
      "category": "FED",
      "title": "Federal Reserve Board announces approval of application by Fleur Capital Corporation",
      "url": "https://www.federalreserve.gov/newsevents/pressreleases/orders20261002a.htm",
      "published": "Fri, 2 Oct 2026 20:45:00 GMT",
      "summary": "Federal Reserve Board announces approval of application by Fleur Capital Corporation",
      "relevance": 11
    },
    {
      "sourceId": "FED_ALL",
      "sourceKind": "official",
      "category": "FED",
      "title": "Federal Reserve Board announces it will extend, until November 4, the comment period on its proposal to modernize Regulation O",
      "url": "https://www.federalreserve.gov/newsevents/pressreleases/bcreg20261002a.htm",
      "published": "Fri, 2 Oct 2026 20:00:00 GMT",
      "summary": "Federal Reserve Board announces it will extend, until November 4, the comment period on its proposal to modernize Regulation O",
      "relevance": 11
    },
    {
      "sourceId": "FED_ALL",
      "sourceKind": "official",
      "category": "FED",
      "title": "Federal Reserve Board issues enforcement action with Ontario Bancorporation, Inc.",
      "url": "https://www.federalreserve.gov/newsevents/pressreleases/enforcement20261002a.htm",
      "published": "Fri, 2 Oct 2026 15:00:00 GMT",
      "summary": "Federal Reserve Board issues enforcement action with Ontario Bancorporation, Inc.",
      "relevance": 11
    },
    {
      "sourceId": "FED_ALL",
      "sourceKind": "official",
      "category": "FED",
      "title": "Federal Reserve Board announces approval of application by Peoples Bancorp Inc.",
      "url": "https://www.federalreserve.gov/newsevents/pressreleases/orders20260925a.htm",
      "published": "Fri, 25 Sep 2026 20:30:00 GMT",
      "summary": "Federal Reserve Board announces approval of application by Peoples Bancorp Inc.",
      "relevance": 11
    },
    {
      "sourceId": "FED_ALL",
      "sourceKind": "official",
      "category": "FED",
      "title": "Agencies publish resolution plan feedback letters for 15 banking organizations",
      "url": "https://www.federalreserve.gov/newsevents/pressreleases/bcreg20260929a.htm",
      "published": "Tue, 29 Sep 2026 20:00:00 GMT",
      "summary": "Agencies publish resolution plan feedback letters for 15 banking organizations",
      "relevance": 6
    }
  ],
  "macro": [
    {
      "id": "DGS2",
      "label": "US 2Y Treasury",
      "date": "2026-10-08",
      "value": 4.75,
      "source": "FRED",
      "url": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2"
    },
    {
      "id": "DGS10",
      "label": "US 10Y Treasury",
      "date": "2026-10-08",
      "value": 5.22,
      "source": "FRED",
      "url": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10"
    },
    {
      "id": "DFII10",
      "label": "US 10Y Real Yield",
      "date": "2026-10-08",
      "value": 2.87,
      "source": "FRED",
      "url": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10"
    },
    {
      "id": "VIXCLS",
      "label": "VIX",
      "date": "2026-10-08",
      "value": 15.41,
      "source": "FRED",
      "url": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS"
    }
  ],
  "hypotheses": []
});

export function researchHypothesesFor(indicator,symbol){
  const i=clean(indicator),s=String(symbol||"").toUpperCase();
  return (RECOMMENDED_AI_RESEARCH_STATE.hypotheses||[]).filter(h=>{
    const hi=clean(h?.indicator),hs=String(h?.symbol||"*").toUpperCase();
    return (hi===i||hi==="*"||hi==="all")&&(hs==="*"||hs===s);
  });
}
