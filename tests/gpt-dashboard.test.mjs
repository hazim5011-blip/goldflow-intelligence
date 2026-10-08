import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const js=readFileSync(new URL("../gpt-ui.js",import.meta.url),"utf8");
const build=readFileSync(new URL("../cloudflare/build.mjs",import.meta.url),"utf8");
const worker=readFileSync(new URL("../cloudflare/worker.js",import.meta.url),"utf8");
test("GPT tab is independent of old indicator selector and dashboard routes",()=>{
 assert.match(html,/data-page="gfGptPage"/);
 assert.match(html,/<section id="gfGptPage"/);
 assert.match(html,/id="gfGptRun"/);
 assert.match(worker,/if\(p==="\/api\/gpt-research"\)return handleGptResearch\(request,env\)/);
 assert.match(worker,/const ROUTES=/);
 assert.match(worker,/const ALIASES=/);
});
test("Cloudflare Pages copies client research UI",()=>{
 assert.match(build,/"gpt-ui.js"/);
 assert.match(html,/src="\/gpt-ui.js"/);
});
test("browser never contains admin token, OpenAI key, trade execution or localStorage history",()=>{
 assert.doesNotMatch(js,/GF_GPT_ADMIN_TOKEN|OPENAI_API_KEY|BROKER_BRIDGE_KEY|localStorage|sessionStorage|mt5\.order_send/);
 assert.match(js,/credentials:"same-origin"/);
 assert.match(js,/textContent/);
 assert.doesNotMatch(js,/innerHTML/);
});
test("owner UI never claims executable signal",()=>{
 assert.match(html,/READ ONLY/);
 assert.match(html,/tidak membuka order/);
 assert.match(js,/data\.canEnter!==false\|\|data\.isExecutedTrade!==false/);
});
