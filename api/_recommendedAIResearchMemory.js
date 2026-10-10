const clean=x=>String(x||"").toLowerCase();

export const RECOMMENDED_AI_RESEARCH_STATE=Object.freeze({
  "version": 1,
  "updatedAtUTC": "2026-10-10T23:48:00.882Z",
  "mode": "FREE_INTERNET_EVIDENCE_SCOUT",
  "reasoning": {
    "enabled": true,
    "status": "OPENAI_REASONING_ERROR",
    "model": "gpt-6.1-sol"
  },
  "sources": [
    {
      "sourceId": "NEWS_GOLD_MACRO",
      "sourceKind": "discovery",
      "category": "GOLD_MACRO",
      "title": "Gold struggles as rising US Treasury yields outweigh dovish Fed repricing - www.tmgm.com",
      "url": "https://news.google.com/rss/articles/CBMi2gFBVV95cUxPejh0R0dHMUJiYmpoaEdoVGZNaTNSYkQ5Vzgxems4cVJYS3ZnTHNwck40U0lpS01Remp0QkxuaEhrdUM1RUwyNE9HdEs3SmNQYjZ6S0JxMFgzZG11MGZBWFlIODlfUHFDYmhneTRxdVZEWk5DWmR0UlBmX1lSWmVYZy02c0tSREVHTHVoQWg5QlV6c0otcS1qUThqME5TU2F2dnpFMmVPZGVmakF3dzRNeUJSeWdaOE5BQnpxNDVLMHNKUnRzSWJJem9HRklid3ZPbGNPb2h2ZGRQdw?oc=5",
      "published": "Thu, 01 Oct 2026 12:30:59 GMT",
      "summary": "Gold struggles as rising US Treasury yields outweigh dovish Fed repricing &nbsp;&nbsp; www.tmgm.com",
      "relevance": 18
    },
    {
      "sourceId": "NEWS_GOLD_MACRO",
      "sourceKind": "discovery",
      "category": "GOLD_MACRO",
      "title": "Gold Outlook Weakens as Treasury Yields and Inflation Risks Persist - Investing.com",
      "url": "https://news.google.com/rss/articles/CBMisgFBVV95cUxQU0JqaGdSazg5N21ZOWFINFJOTjVrMjBZQXlLY0thSjlFRFdYY01sQ0VvbGllUTFzNkYtWVNjdE5PcXlMN0gzRUtWY1RNZm82bFVqSVpxMjJadUxXVUFvOXpUbjlSbFBUTXVocGdoald3ZEQyWDZZWGlCQ3RrVE5qcnZIcFJ5WldrdV9lQU52emtITVM2Rm5Hc0VONXdSS01qc3J4Z1VKYWIxZ0p4T3E2Um93?oc=5",
      "published": "Thu, 30 Jul 2026 07:00:00 GMT",
      "summary": "Gold Outlook Weakens as Treasury Yields and Inflation Risks Persist &nbsp;&nbsp; Investing.com",
      "relevance": 17
    },
    {
      "sourceId": "NEWS_USD_YIELDS",
      "sourceKind": "discovery",
      "category": "USD_YIELDS",
      "title": "Gold tests $4,100 as US Dollar and yields rise ahead of FOMC Minutes - FXStreet",
      "url": "https://news.google.com/rss/articles/CBMisAFBVV95cUxPN2NaLTd5SDJmeVdSQUJ1VU1aQjBQeG9jVDNPVjNFdXUwWm1UeWt3bjQyRDc3WF85NGRnTWZEZnBsd0l0X2ZROTRqQWpORy03LXV4R01ZMVNwaWlxa09oQlJkTWVVbzl6SVVYaEFzaW1oMFJ0dmNCTjJEcUxSRHRhZ05JTkZKRmVmVXZLX0RCbzRVaWZXZGNQWlplVUNuWnpmN1Y1a0Y3SXdRVE1hR1NMVA?oc=5",
      "published": "Wed, 07 Oct 2026 16:10:56 GMT",
      "summary": "Gold tests $4,100 as US Dollar and yields rise ahead of FOMC Minutes &nbsp;&nbsp; FXStreet",
      "relevance": 17
    },
    {
      "sourceId": "NEWS_GOLD_MACRO",
      "sourceKind": "discovery",
      "category": "GOLD_MACRO",
      "title": "Gold Price Forecast: Fed’s rate decision to drive XAU/USD’s next move - FXStreet",
      "url": "https://news.google.com/rss/articles/CBMiswFBVV95cUxObEkxemhab3hfbFU2RzlyY2VTUEc0T0IwTWMtX1V2Uk81Um1VU2NvOWoxS25OVkQzeXQwY2pvcEhacXF3MFFyZ1ZaQnEzSHJXcUZnSEhtczdLQ1Q1dW4tcktkaWJ0NWRNREg1TU8tYWZTRXliQmp3Qi1mRHV1SGo0a3FabVVJb2V2cktFZTdROFA3UndnbGViQzB0Z0xMa0xIa0hIcko1eVQyMzR0eVBHczV6MA?oc=5",
      "published": "Mon, 14 Sep 2026 07:00:00 GMT",
      "summary": "Gold Price Forecast: Fed’s rate decision to drive XAU/USD’s next move &nbsp;&nbsp; FXStreet",
      "relevance": 15
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
      "sourceId": "NEWS_GOLD_MACRO",
      "sourceKind": "discovery",
      "category": "GOLD_MACRO",
      "title": "Gold Price Forecast Next Week: Can XAU/USD Hold $4,200 Before US CPI? - Markets.com",
      "url": "https://news.google.com/rss/articles/CBMieEFVX3lxTE41RnRSSnVmejNNVFNYUHhON21YZEI4YmFwTUZLLTRBMTd2MEpBMXNWUHJZeVRudXZub3lUWDJ5T1h1VnhGWC1fTWEzUzM5Z3pXeDh0S3BoMGZfUWVtSXBuZzdIR1IyVXQ0UnlYYkJ0UmdVLXFzMklGaA?oc=5",
      "published": "Fri, 09 Oct 2026 16:02:00 GMT",
      "summary": "Gold Price Forecast Next Week: Can XAU/USD Hold $4,200 Before US CPI? &nbsp;&nbsp; Markets.com",
      "relevance": 14
    },
    {
      "sourceId": "NEWS_USD_YIELDS",
      "sourceKind": "discovery",
      "category": "USD_YIELDS",
      "title": "Dollar pauses after Fed rally as yields, oil retreat - Reuters",
      "url": "https://news.google.com/rss/articles/CBMirwFBVV95cUxOTVZNWlJSb0NGaG9WNmRjR0U4YUM2anpuRFREdGRvRmRaRUhwbzVIb2JndlpsZ2g4a1hvbkdZWEl2YUV6WWRjYThBSGt2VGlzak44MmVyWkFPeTJfdlBreG1ERkhYbjVEaTVlLXpwOW9SeDRvbzZIYVJLTUdWcWc1Y2RFTFVPelhoaWNqWVpNd1YxWTR2ZWxaX2U5dzQwUUxNWWFyQXB5U2d4UFJTMXM4?oc=5",
      "published": "Thu, 17 Sep 2026 07:00:00 GMT",
      "summary": "Dollar pauses after Fed rally as yields, oil retreat &nbsp;&nbsp; Reuters",
      "relevance": 14
    },
    {
      "sourceId": "NEWS_GOLD_MACRO",
      "sourceKind": "discovery",
      "category": "GOLD_MACRO",
      "title": "Gold can’t catch a PCE break as long US yields keep climbing - tmgm.com",
      "url": "https://news.google.com/rss/articles/CBMiwwFBVV95cUxOUDRsclh5NU5WOG9wOEc2YTJfR1BxWWs0el8wcXNRNmZxYXBZc2k0YXdCYVc2aVNjeGlEdmR2R0VscWJ1RVE4cXh6dTlpOVZra3AzUkJ6MWJxNDh4eXJHQlFsVHlRMWlQdWRUQllocHBXSVBJblVkSkl4RWNoV2JlY25fTXJ0UHpDYXU2YVZxM282VjFENE5fRDV0NE1jVmtOczN0Q3NKUDlFXzdnYnM4czFKaUZ3MnMzRlRVWjdxa2ltdmM?oc=5",
      "published": "Wed, 30 Sep 2026 18:17:08 GMT",
      "summary": "Gold can’t catch a PCE break as long US yields keep climbing &nbsp;&nbsp; tmgm.com",
      "relevance": 13
    },
    {
      "sourceId": "NEWS_GOLD_MACRO",
      "sourceKind": "discovery",
      "category": "GOLD_MACRO",
      "title": "US Treasury Yields Hit Nearly 20-Year High, Dragging Gold Below $4,300: Will Gold Keep Falling? - TradingKey",
      "url": "https://news.google.com/rss/articles/CBMi6wFBVV95cUxQZ293MHh5TXhreVJUZ1lCVjFiQmtEQXlGcjU5U1d6TVVVQl9pc0JFWlBXaHNUZ0NyaUh5VDYxa29YZUhBRFVRX2FPQlJLV0JSQmhBcWpWYmFnc0Z6bTdvVkprRzZvR0dHYVN3R3h3Qkd3VVA4ZjhsWll4Wnd6VERaQl9sSzgxNW91Ri1XQldEUEdkOUI1SXl6TFFzVWkxaDNOTmh1ZEVOLVVHQi03VkQxUENqR2NReXpvTWJaNno1RE1JWXUwMjVnTmtyLTUxeEhaYzFuODlsUnhNOGV3cDdheV92TlJhaV9MeFVn?oc=5",
      "published": "Tue, 15 Sep 2026 07:00:00 GMT",
      "summary": "US Treasury Yields Hit Nearly 20-Year High, Dragging Gold Below $4,300: Will Gold Keep Falling? &nbsp;&nbsp; TradingKey",
      "relevance": 13
    },
    {
      "sourceId": "NEWS_USD_YIELDS",
      "sourceKind": "discovery",
      "category": "USD_YIELDS",
      "title": "US Dollar Price Forecast: Fed Minutes Back DXY, Can GBP/USD and EUR/USD Recover? - Yahoo Finance",
      "url": "https://news.google.com/rss/articles/CBMingFBVV95cUxNY1lTMDNOdHNjbzQ2cUh6dGxLbkRUZjBGN1NIckRPRWVlRlk2Q2pxZnpsQmhOa2Z0RzYyMzhYNzZCMEgxWWJJem1LMnNWbXYzU0dwMnJZaTVuS19OTWtpeGRVS2RsTkJyZTE4ZmUtZ2RmS29ZU1dZTVU5LURWY09iLWNOSTZVcllON0lWVlFHT1R6SGtPbWpMYlVqUmxGZw?oc=5",
      "published": "Thu, 08 Oct 2026 08:25:12 GMT",
      "summary": "US Dollar Price Forecast: Fed Minutes Back DXY, Can GBP/USD and EUR/USD Recover? &nbsp;&nbsp; Yahoo Finance",
      "relevance": 12
    },
    {
      "sourceId": "NEWS_USD_YIELDS",
      "sourceKind": "discovery",
      "category": "USD_YIELDS",
      "title": "Gold slides to two-month low as robust dollar, yields add pressure - Kitco",
      "url": "https://news.google.com/rss/articles/CBMirwFBVV95cUxQY2hpM3gyaGRGNUFvU3JJbVdmcUZOVEhiN0V5TUo0dWNpNmlybDNQbUVIeFNhXzFVM0pubWtrQ19DRkN4VWI4RWxReDg0WXhpLU9DeWZpd1phOHZyUFRoZFhILTVTRnV4c3otdlZQb0lsNFpIZnk4dW0xdTVrWm9VOU13eWtSTUpUZG9OUTBrWnlvWHF4TUhES3J3ZE85ZTFhTVVsVXF0VTgyUjNPcjlv?oc=5",
      "published": "Wed, 07 Oct 2026 16:59:20 GMT",
      "summary": "Gold slides to two-month low as robust dollar, yields add pressure &nbsp;&nbsp; Kitco",
      "relevance": 12
    },
    {
      "sourceId": "NEWS_USD_YIELDS",
      "sourceKind": "discovery",
      "category": "USD_YIELDS",
      "title": "Gold edges higher but remains capped in tight range as Dollar and yields rebound - FXStreet",
      "url": "https://news.google.com/rss/articles/CBMiswFBVV95cUxPWVZ0V29BSzhjMlRGaEctTDRzYkdYaGkzZTlMTXg0c3pVeWpUdDZrc293R1dod3BtUk5wcEp6NEM1dDJiWGgzUzdzQmgtdEpFdmNvT2d5UWxqLUd0dFE5RzNTdXBCd1BzZ1lEMjRlV0tKUEktX08wakhJLUdnNUxEUEtsVklhS2V4cVZBZDdQMzh3a3o5NWpSMG50bmlVMjByLVNuSjU4SFhraFpEVWZOVl9tVQ?oc=5",
      "published": "Fri, 09 Oct 2026 15:51:30 GMT",
      "summary": "Gold edges higher but remains capped in tight range as Dollar and yields rebound &nbsp;&nbsp; FXStreet",
      "relevance": 12
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
      "sourceId": "NEWS_USD_YIELDS",
      "sourceKind": "discovery",
      "category": "USD_YIELDS",
      "title": "Stocktwits Weekly Spread: What Shaped Treasury Yields And The Dollar This Week - TradingView",
      "url": "https://news.google.com/rss/articles/CBMi1AFBVV95cUxOWjRuQjduUGtINjFfMWQ3TmYyQkZyZ2VmYm9wRFYwenhySDRmNVNwd1hjQmYwQVgyd0ZEblN3cDBMakxqa3RNdkk4d3Q0RXVpVl9rNnJkanBUdmVHODdvc285XzhPQzFxLVk5clVtTmlkV0xEbmpER3VmUzlEZDdxUG1ibmVHMlg5Y1Qtcm5WN1lJZmtlamJwc1VwdVhsV1hOajBNWUFyYWZtRF8xcGFobG5EaExzY19QMENGRl9xc0toRDMyN2dwWExIUTZtNHVmTTJNOA?oc=5",
      "published": "Sat, 10 Oct 2026 00:18:00 GMT",
      "summary": "Stocktwits Weekly Spread: What Shaped Treasury Yields And The Dollar This Week &nbsp;&nbsp; TradingView",
      "relevance": 11
    },
    {
      "sourceId": "NEWS_USD_YIELDS",
      "sourceKind": "discovery",
      "category": "USD_YIELDS",
      "title": "US Dollar Price Forecast: High Yields Lift DXY, Can GBP/USD and EUR/USD Recover? - Yahoo Finance",
      "url": "https://news.google.com/rss/articles/CBMinwFBVV95cUxQR015Y24tbmwya2RWdE5HVDF2dTNoWW1pMnktamdiLWozc3RaVEVUUEhrVHAwMThLNHJsQjlrM01sZ0hwcFBHRTl2dExwaGRZX3oxZFM1RFdVcEtsRjFSUldiR1BadGxmZEFmVURvbGdMNjFYZ3RUbXZpSFZwNjV0MG9fWTdKekxlQW1Za2FpX0VEMEJYUUJVTnp1T3lHSTA?oc=5",
      "published": "Tue, 06 Oct 2026 08:34:26 GMT",
      "summary": "US Dollar Price Forecast: High Yields Lift DXY, Can GBP/USD and EUR/USD Recover? &nbsp;&nbsp; Yahoo Finance",
      "relevance": 11
    },
    {
      "sourceId": "NEWS_GOLD_MACRO",
      "sourceKind": "discovery",
      "category": "GOLD_MACRO",
      "title": "Gold Price Forecast September 2026: Fed Hikes Rates, Gold Rebounds Above US$4,300 - Mitrade",
      "url": "https://news.google.com/rss/articles/CBMijAFBVV95cUxNZDVYWkFVTXRzanlIS1lfUERjRmowVEtoZjdxLVZVUU9ZemQwTlhzUm5oWU94TXFseUxfMllXUDJRYW5EWnpyTDFrTnlWV2hhMHpEa0FiYW50VTFHZEF2VGVjb2tLWXdENjM4bmVXR2tBaEJPdTAtYWJUVWNNbGVONTJPNFBHckR4emNnSw?oc=5",
      "published": "Thu, 17 Sep 2026 07:00:00 GMT",
      "summary": "Gold Price Forecast September 2026: Fed Hikes Rates, Gold Rebounds Above US$4,300 &nbsp;&nbsp; Mitrade",
      "relevance": 10
    },
    {
      "sourceId": "NEWS_GOLD_MACRO",
      "sourceKind": "discovery",
      "category": "GOLD_MACRO",
      "title": "XAUUSD: Gold Steady Near $4,370, Prices Seek to Break 3-Day Losing Streak - TradingView",
      "url": "https://news.google.com/rss/articles/CBMizAFBVV95cUxNcm8xNWMwSi1zWi1oTkhuSEtZLVVSQTRpWjNrbURMbnBvcjl6cWhqUnVFdDlwNTdaM2RiYkRtV01xa2JhRkRqN1pnX2ZaYlpEa3ZRUnp4elBnWEdrX2hpYmg1T2lfQXJ5cTdLUTFVWjgyWWJVcmhFdllnYjhiejhsWm50QjhGbFNvT1NXRDBkWFdwMEtpUGlkTDVnU1RpVFppMnR5OE12eHF3YXNpS21BR0llbUVqOUxrOXdLMUZTc0NNTVV1RkJ4ZWxCUko?oc=5",
      "published": "Tue, 08 Sep 2026 07:00:00 GMT",
      "summary": "XAUUSD: Gold Steady Near $4,370, Prices Seek to Break 3-Day Losing Streak &nbsp;&nbsp; TradingView",
      "relevance": 10
    }
  ],
  "macro": [
    {
      "id": "DGS2",
      "label": "US 2Y Treasury",
      "error": "HTTP_520",
      "source": "FRED",
      "url": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2"
    },
    {
      "id": "DGS10",
      "label": "US 10Y Treasury",
      "error": "HTTP_520",
      "source": "FRED",
      "url": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10"
    },
    {
      "id": "DFII10",
      "label": "US 10Y Real Yield",
      "error": "HTTP_520",
      "source": "FRED",
      "url": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10"
    },
    {
      "id": "VIXCLS",
      "label": "VIX",
      "error": "HTTP_520",
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
