import test from "node:test";
import assert from "node:assert/strict";
import {openAIRequestConfig} from "../api/_internetResearchScout.js";

test("reasoning request defaults to bounded GPT-6.1 Sol-compatible budget",()=>{
  const old={...process.env};
  delete process.env.RECOMMENDED_AI_REASONING_EFFORT;
  delete process.env.RECOMMENDED_AI_MAX_OUTPUT_TOKENS;
  delete process.env.RECOMMENDED_AI_MAX_TOOL_CALLS;
  try{
    const q=openAIRequestConfig("gpt-6.1-sol","study");
    assert.equal(q.model,"gpt-6.1-sol");
    assert.equal(q.reasoning.effort,"medium");
    assert.equal(q.max_tool_calls,2);
    assert.equal(q.max_output_tokens,1800);
    assert.equal(q.store,false);
    assert.deepEqual(q.tools,[{type:"web_search"}]);
  }finally{
    process.env=old;
  }
});

test("reasoning budget env is clamped",()=>{
  const prev={e:process.env.RECOMMENDED_AI_REASONING_EFFORT,o:process.env.RECOMMENDED_AI_MAX_OUTPUT_TOKENS,t:process.env.RECOMMENDED_AI_MAX_TOOL_CALLS};
  process.env.RECOMMENDED_AI_REASONING_EFFORT="extreme";
  process.env.RECOMMENDED_AI_MAX_OUTPUT_TOKENS="99999";
  process.env.RECOMMENDED_AI_MAX_TOOL_CALLS="99";
  try{
    const q=openAIRequestConfig("gpt-6-luna","study");
    assert.equal(q.reasoning.effort,"medium");
    assert.equal(q.max_output_tokens,2600);
    assert.equal(q.max_tool_calls,3);
  }finally{
    if(prev.e===undefined)delete process.env.RECOMMENDED_AI_REASONING_EFFORT;else process.env.RECOMMENDED_AI_REASONING_EFFORT=prev.e;
    if(prev.o===undefined)delete process.env.RECOMMENDED_AI_MAX_OUTPUT_TOKENS;else process.env.RECOMMENDED_AI_MAX_OUTPUT_TOKENS=prev.o;
    if(prev.t===undefined)delete process.env.RECOMMENDED_AI_MAX_TOOL_CALLS;else process.env.RECOMMENDED_AI_MAX_TOOL_CALLS=prev.t;
  }
});
