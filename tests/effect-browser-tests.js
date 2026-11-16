#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const http=require("node:http");
const path=require("node:path");
const vm=require("node:vm");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"..");
const cardsData=JSON.parse(fs.readFileSync(path.join(root,"data/cards.json"),"utf8"));
const parserContext={console};parserContext.globalThis=parserContext;vm.createContext(parserContext);
vm.runInContext(fs.readFileSync(path.join(root,"js/effect-engine.js"),"utf8"),parserContext);
const engine=parserContext.CardEffectEngine;
const excludedNames=new Set(["愛おしき放課後","いぬ"]);
const deckRuleNames=new Set(["量産型タイロス","ノーマルエネルギー"]);
const first=(predicate)=>cardsData.cards.find(predicate)||cardsData.cards.find(c=>predicate(c,false));
const byTag=(tag)=>cardsData.cards.find(c=>String(c.tags||"").includes(tag)&&!String(c.effect_text||"").trim())||first(c=>String(c.tags||"").includes(tag));
const fixtureCards={
 monster:byTag("#モンスターカード"),
 energy:byTag("#エネルギーカード"),
 spell:byTag("#魔法カード"),
 trap:byTag("#罠カード"),
 field:byTag("#フィールドカード")
};
for(const [kind,card] of Object.entries(fixtureCards))if(!card)throw new Error("fixture card missing: "+kind);
const fixture=[
 {name:fixtureCards.monster.name,owner:1,zone:"monsters",id:"fx-p1-m1"},
 {name:fixtureCards.monster.name,owner:1,zone:"monsters",id:"fx-p1-m2"},
 {name:fixtureCards.energy.name,owner:1,zone:"energy",id:"fx-p1-e1"},
 {name:fixtureCards.energy.name,owner:1,zone:"energy",id:"fx-p1-e2"},
 {name:fixtureCards.monster.name,owner:1,zone:"hand",id:"fx-p1-h1"},
 {name:fixtureCards.spell.name,owner:1,zone:"deck",id:"fx-p1-d1"},
 {name:fixtureCards.monster.name,owner:1,zone:"deck",id:"fx-p1-d2"},
 {name:fixtureCards.energy.name,owner:1,zone:"deck",id:"fx-p1-d3"},
 {name:fixtureCards.spell.name,owner:1,zone:"discard",id:"fx-p1-x1"},
 {name:fixtureCards.trap.name,owner:1,zone:"facedown",id:"fx-p1-t1"},
 {name:fixtureCards.field.name,owner:1,zone:"field",id:"fx-p1-f1"},
 {name:fixtureCards.monster.name,owner:2,zone:"monsters",id:"fx-p2-m1"},
 {name:fixtureCards.monster.name,owner:2,zone:"monsters",id:"fx-p2-m2"},
 {name:fixtureCards.energy.name,owner:2,zone:"energy",id:"fx-p2-e1"},
 {name:fixtureCards.monster.name,owner:2,zone:"hand",id:"fx-p2-h1"},
 {name:fixtureCards.spell.name,owner:2,zone:"deck",id:"fx-p2-d1"},
 {name:fixtureCards.spell.name,owner:2,zone:"discard",id:"fx-p2-x1"}
];
const cases=[];
for(const card of cardsData.cards){
 const effect=String(card.effect_text||"").trim();
 if(!effect||excludedNames.has(card.name))continue;
 if(deckRuleNames.has(card.name)&&/何枚でもデッキに入れることができる/.test(effect))continue;
 const sourceZone=String(card.tags||"").includes("#エネルギーカード")?"energy":String(card.tags||"").includes("#罠カード")?"facedown":String(card.tags||"").includes("#フィールドカード")?"field":String(card.tags||"").includes("#魔法カード")?"discard":"monsters";
 for(const ability of engine.splitAbilities(effect)){
  const text=String(ability.body||ability.raw||"").trim();
  if(!text)continue;
  cases.push({cardId:card.id,cardName:card.name,sourceZone,clauseIndex:ability.index,text});
 }
}
function mime(file){return file.endsWith(".js")?"text/javascript":file.endsWith(".json")?"application/json":file.endsWith(".css")?"text/css":"text/plain"}
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
 const target=path.resolve(root,"."+pathname);
 if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);return res.end("Forbidden")}
 fs.readFile(target,(err,body)=>{if(err){res.writeHead(404);return res.end("Not found")}res.writeHead(200,{"content-type":mime(target)});res.end(body)});
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  const pageErrors=[],consoleErrors=[],failedRequests=[];
  page.on("pageerror",error=>pageErrors.push(String(error?.stack||error)));
  page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text())});
  page.on("requestfailed",request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText||"unknown"}));
  await page.addInitScript(()=>{window.prompt=()=>null;window.confirm=()=>true;window.alert=()=>{}});
  const address=server.address();
  await page.goto("http://127.0.0.1:"+address.port+"/index.html?ankrTest=1");
  await page.waitForFunction(()=>window.__ANKR_TEST__||window.__ANKR_TEST_BOOT_ERROR__,null,{timeout:60000});
  const boot=await page.evaluate(()=>({api:!!window.__ANKR_TEST__,error:window.__ANKR_TEST_BOOT_ERROR__||null}));
  if(!boot.api)throw new Error("live game test bridge did not initialize: "+JSON.stringify({boot,pageErrors,consoleErrors,failedRequests}));
  const apiReady=boot.api;
  assert.equal(apiReady,true,"live game test bridge did not initialize");
  const smoke=await page.evaluate(({fixture,sourceName,targetName})=>{
   const api=window.__ANKR_TEST__;
   api.reset();
   api.addCard(sourceName,1,"monsters","smoke-source");
   api.addCard(targetName,2,"monsters","smoke-target");
   api.addCard(targetName,1,"deck","smoke-draw-1");
   api.addCard(targetName,1,"deck","smoke-draw-2");
   api.runEffect("カードを2枚引く。",1,"smoke-source");
   const draw=api.snapshot();
   api.reset();
   api.addCard(sourceName,1,"monsters","damage-source");
   api.addCard(targetName,2,"monsters","damage-target");
   api.runEffect("相手のモンスター1体に300ダメージ。",1,"damage-source");
   const pending=api.snapshot();
   api.chooseTarget("damage-target");
   const damage=api.snapshot();
   api.reset();
   const enterSource=api.addCard("紅魚",1,"monsters","enter-source");
   api.trigger(enterSource,1,"enter");
   const enter=api.snapshot();
   api.reset();
   const archer=api.addCard("王国の弓騎士",1,"monsters","archer");
   api.addCard(targetName,2,"monsters","archer-target");
   api.activate(archer,"monsters",0);
   const activatedPending=api.snapshot();
   return {drawHand:draw.players[1].zones.hand.length,drawDeck:draw.players[1].zones.deck.length,pendingTarget:pending.pendingTarget?.kind||null,targetDamage:damage.players[2].zones.monsters.find(c=>c.id==="damage-target")?.damage||0,enterOpponentLife:enter.players[2].life,activatedPending:activatedPending.pendingTarget?.kind||null,archerTapped:activatedPending.players[1].zones.monsters.find(c=>c.id==="archer")?.tapped||false};
  },{fixture,sourceName:fixtureCards.monster.name,targetName:fixtureCards.monster.name});
  assert.equal(smoke.drawHand,2,"live executor draw smoke test failed");
  assert.equal(smoke.drawDeck,0,"live executor draw did not remove cards from deck");
  assert.equal(smoke.pendingTarget,"monsterDamage","live executor did not request a board target for monster damage");
  assert.equal(smoke.targetDamage,300,"live executor did not apply damage to the chosen target");
  assert.equal(smoke.enterOpponentLife,3900,"live enter trigger did not apply the card effect");
  assert.equal(smoke.activatedPending,"kingdomArcherDamage","activated ability did not request a board target");
  assert.equal(smoke.archerTapped,true,"tap activation cost was not paid");
  await page.locator('.card[data-card-id="archer-target"]').click();
  const clickedTarget=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  const archerCard=clickedTarget.players[1].zones.monsters.find(c=>c.id==="archer");
  assert.equal(clickedTarget.players[2].zones.monsters.find(c=>c.id==="archer-target")?.damage,archerCard?.power||0,"clicking the actual board target did not resolve the activated ability");
  const results=await page.evaluate(({cases,fixture})=>window.__ANKR_TEST__.auditBatch(cases,fixture),{cases,fixture});
  const counts={};for(const result of results)counts[result.status]=(counts[result.status]||0)+1;
  const errors=results.filter(r=>r.status==="runtime_error");
  const report={generatedAt:new Date().toISOString(),cardCount:cardsData.cards.length,clauseCount:cases.length,smoke,counts,runtimeErrorCount:errors.length,results};
  const out=process.argv[2]?path.resolve(process.argv[2]):path.join(root,"effect-live-audit-report.json");
  fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({cardCount:report.cardCount,clauseCount:report.clauseCount,smoke,counts,runtimeErrorCount:errors.length,report:out},null,2));
  assert.equal(errors.length,0,"actual game effect resolver threw during card audit; see report");
 }catch(error){console.error(error);process.exitCode=1}
 finally{if(browser)await browser.close();server.close()}
})();
