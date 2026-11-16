#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const data=JSON.parse(fs.readFileSync(path.join(root,"data/cards.json"),"utf8"));
const context={console};
context.globalThis=context;
vm.createContext(context);
for(const file of ["js/effect-engine.js","js/effect-runtime.js"]){
  vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
}
const engine=context.CardEffectEngine;
const runtime=context.CardEffectRuntime;
const issues=[];
const seenIds=new Set();
const stats={total:data.cards.length,withEffect:0,withoutEffect:0,excluded:0,clauses:0,recognized:0,unrecognized:0,ambiguous:0,playerSelection:0,automaticSelection:0,triggered:0,activated:0,deckbuildingOnly:0,abilityMismatches:0};
const EXEMPT_NAMES=new Set(["愛おしき放課後","いぬ"]);
const DECK_RULE_NAMES=new Set(["量産型タイロス","ノーマルエネルギー"]);
const report=[];
if(data.record_count!==data.cards.length)issues.push({type:"record_count_mismatch",expected:data.record_count,actual:data.cards.length});
for(const card of data.cards){
  if(!card.id)issues.push({type:"missing_id",name:card.name});
  else if(seenIds.has(card.id))issues.push({type:"duplicate_id",id:card.id,name:card.name});
  else seenIds.add(card.id);
  if(!card.name)issues.push({type:"missing_name",id:card.id});
  const text=String(card.effect_text||"").trim();
  const split=engine.splitAbilities(text).map(x=>x.raw);
  const saved=Array.isArray(card.abilities)?card.abilities:[];
  const mismatch=JSON.stringify(split)!==JSON.stringify(saved);
  if(mismatch){stats.abilityMismatches++;issues.push({type:"abilities_mismatch",id:card.id,name:card.name,expected:split,stored:saved});}
  if(!text){stats.withoutEffect++;report.push({id:card.id,name:card.name,status:"no_effect",clauses:[]});continue;}
  stats.withEffect++;
  if(EXEMPT_NAMES.has(card.name)){stats.excluded++;report.push({id:card.id,name:card.name,status:"user_exempt",clauses:[]});continue;}
  if(DECK_RULE_NAMES.has(card.name)&&/何枚でもデッキに入れることができる/.test(text)){stats.deckbuildingOnly++;report.push({id:card.id,name:card.name,status:"deckbuilding_rule_ignored",clauses:[]});continue;}
  const clauses=runtime.compile(text);
  let unrecognized=0,ambiguous=0;
  for(const clause of clauses){
    stats.clauses++;
    if(clause.recognized)stats.recognized++;else{stats.unrecognized++;unrecognized++;}
    if(clause.confidence==="ambiguous"){stats.ambiguous++;ambiguous++;}
    if(clause.target?.selection==="player")stats.playerSelection++;
    if(clause.target?.selection==="automatic")stats.automaticSelection++;
    if(clause.trigger)stats.triggered++;
    if(clause.cost)stats.activated++;
  }
  report.push({id:card.id,name:card.name,status:unrecognized?"needs_review":ambiguous?"ambiguous":"parsed",clauses:clauses.map(c=>({text:c.part,trigger:c.trigger,cost:c.cost,actions:c.actions,confidence:c.confidence,target:c.target,conditions:c.conditions}))});
}
const summary={generatedAt:new Date().toISOString(),stats,issueCount:issues.length,issues,reviewCards:report.filter(x=>x.status==="needs_review"||x.status==="ambiguous"),cards:report};
const outPath=process.argv[2]?path.resolve(process.argv[2]):null;
if(outPath){fs.writeFileSync(outPath,JSON.stringify(summary,null,2)+"\n");}
console.log(JSON.stringify({stats,issueCount:issues.length,reviewCardCount:summary.reviewCards.length,output:outPath||"stdout"},null,2));
if(issues.length)process.exitCode=1;
