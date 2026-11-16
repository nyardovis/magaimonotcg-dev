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
 monster:cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&!String(c.effect_text||"").trim()&&Number(c.power)>=600)||byTag("#モンスターカード"),
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
function mime(file){return file.endsWith(".html")?"text/html":file.endsWith(".js")?"text/javascript":file.endsWith(".json")?"application/json":file.endsWith(".css")?"text/css":"text/plain"}
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
   api.runEffect("自分は2枚引く。",1,"smoke-source");
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
  const iceWall=await page.evaluate(({sourceName,targetName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(sourceName,1,"monsters","ice-attacker");api.addCard("氷壁",2,"facedown","ice-wall");api.addCard(targetName,2,"deck","ice-draw");const result=api.attack("ice-attacker");return {opponentLife:result.players[2].life,opponentHand:result.players[2].zones.hand.length,trapDiscarded:result.players[2].zones.discard.some(c=>c.id==="ice-wall")};},{sourceName:fixtureCards.monster.name,targetName:fixtureCards.monster.name});
  assert.equal(iceWall.opponentLife,4000,"Ice Wall did not reduce the attack damage to zero");
  assert.equal(iceWall.opponentHand,1,"Ice Wall did not resolve its draw clause");
  assert.equal(iceWall.trapDiscarded,true,"Ice Wall did not move to discard after activation");

  const advanced=await page.evaluate(({energyName,monsterName,trapName,knightName,highPowerMonsterName,highPower})=>{
   const api=window.__ANKR_TEST__;
   api.reset();
   api.addCard("信じる心",1,"monsters","belief-source");
   api.addCard(monsterName,1,"deck","belief-target");
   api.addCard(energyName,1,"deck","belief-other");
   api.runEffect("自分のデッキからカード1枚までを手札に加える。",1,"belief-source");
   const beliefPending=api.snapshot();
   api.reset();
   api.addCard("苔木蜘蛛",1,"monsters","moss-source");
   api.addCard(trapName,1,"deck","moss-trap");
   api.trigger("moss-source",1,"enter");
   const mossPending=api.snapshot();
   api.reset();
   api.addCard("碧い花",1,"monsters","blue-flower");
   api.addCard(highPowerMonsterName,2,"monsters","blue-opponent");
   api.trigger("blue-flower",1,"enter");
   const blueFlower=api.snapshot();
   api.reset();
   api.addCard("転換",1,"hand","tenkan-source");
   api.addCard(energyName,1,"energy","tenkan-cost");
   api.addCard(energyName,1,"deck","tenkan-energy");
   api.addCard(monsterName,1,"deck","tenkan-draw");
   api.runEffect("自分のエネルギーが場に無い時使用できない。自分のエネルギー1枚を破壊する。自分のデッキからエネルギー1枚までをタップして出す。自分は1枚引く。",1,"tenkan-source");
   api.chooseTarget("tenkan-cost");
   const tenkanPending=api.snapshot();
   api.reset();
   api.addCard("王国の槍騎士",2,"monsters","passive-source");
   const passiveBefore=api.snapshot().players[2].zones.monsters.find(c=>c.id==="passive-source")?.cannotBeAttackedWhileUntapped||false;
   api.removeCard("passive-source",2,"monsters");
   const passiveAfter=api.snapshot().players[2].zones.monsters.some(c=>c.id==="passive-source");
   api.reset();
   api.addCard(monsterName,2,"deck","second-player-draw");
   const secondTurn=api.startTurn(2,false);
   api.reset();
   api.addCard(monsterName,1,"deck","first-player-no-draw");
   const firstTurn=api.startTurn(1,true);
   api.reset();
   api.addCard("部隊指揮官",1,"monsters","field-commander");
   api.addCard(knightName,1,"monsters","knight-target");
   api.trigger("field-commander",1,"enter");
   const commanderBuffPending=api.snapshot();
   api.reset();
   api.addCard("王国の騎士団長",1,"monsters","kingdom-commander");
   api.addCard(monsterName,1,"monsters","extra-own");
   api.addCard(monsterName,2,"monsters","commander-target");
   api.setEnergyPool(1,4);
   api.activate("kingdom-commander","monsters",0);
   const captainPending=api.snapshot();
   return {
    beliefPending:beliefPending.pendingTarget?.kind||null,beliefPicker:beliefPending.pickerOpen,
    mossPending:mossPending.pendingTarget?.kind||null,mossDestination:mossPending.pendingTarget?.destination||null,
    blueFlowerLife:blueFlower.players[1].life,expectedHighPower:highPower,
    tenkanPending:tenkanPending.pendingTarget?.kind||null,tenkanDestination:tenkanPending.pendingTarget?.destination||null,tenkanPicker:tenkanPending.pickerOpen,
    passiveBefore,passiveAfter,secondTurnHand:secondTurn.players[2].zones.hand.length,firstTurnHand:firstTurn.players[1].zones.hand.length,
    commanderBuffPending:commanderBuffPending.pendingTarget?.kind||null,captainPending:captainPending.pendingTarget?.kind||null
   };
  },{energyName:fixtureCards.energy.name,monsterName:fixtureCards.monster.name,trapName:fixtureCards.trap.name,knightName:(cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&String(c.types||"").split(/[,、]/).includes("騎士")&&Number(c.cost)<=2)||fixtureCards.monster).name,highPowerMonsterName:(cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&Number(c.power)>=700)||fixtureCards.monster).name,highPower:Number((cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&Number(c.power)>=700)||fixtureCards.monster).power)||0});
  assert.equal(advanced.beliefPending,"deckSearchMove","Believing Heart did not open a deck card picker");
  assert.equal(advanced.beliefPicker,true,"Believing Heart picker was not displayed");
  assert.equal(advanced.mossPending,"deckSearchMove","Moss Tree Spider did not open a deck trap picker");
  assert.equal(advanced.mossDestination,"facedown","Moss Tree Spider picker did not set traps face down");
  assert.equal(advanced.blueFlowerLife,4000+advanced.expectedHighPower,"Blue Flower maximum-power healing did not resolve");
  assert.equal(advanced.tenkanPending,"deckSearchMove","Tenkan did not continue to its deck-energy selection");
  assert.equal(advanced.tenkanDestination,"energy","Tenkan did not offer energy deployment");
  assert.equal(advanced.tenkanPicker,true,"Tenkan energy picker was not displayed");
  assert.equal(advanced.passiveBefore,true,"Kingdom Spearman untapped passive was not recalculated");
  assert.equal(advanced.passiveAfter,false,"Kingdom Spearman passive source removal was not reflected");
  assert.equal(advanced.secondTurnHand,1,"second player's first turn did not draw");
  assert.equal(advanced.firstTurnHand,0,"first player's initial turn incorrectly drew");
  assert.equal(advanced.commanderBuffPending,"taggedMonsterBuff","Field Commander did not request a Knight target");
  assert.equal(advanced.captainPending,"formulaMonsterDamage","Kingdom Commander did not request a board target for its damage formula");


  await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("信じる心",1,"monsters","belief-source");api.addCard(monsterName,1,"deck","belief-choice");api.runEffect("自分のデッキからカード1枚までを手札に加える。",1,"belief-source")},{monsterName:fixtureCards.monster.name});
  await page.locator('#effectDeckPicker button[data-card-id="belief-choice"]').click();
  await page.locator("#effectDeckPicker button").filter({hasText:"選択したカードを手札に加える"}).click();
  const beliefChosen=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(beliefChosen.players[1].zones.hand.some(c=>c.id==="belief-choice"),true,"Believing Heart did not move the selected deck card to hand");

  await page.evaluate(({trapName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("苔木蜘蛛",1,"monsters","moss-source");api.addCard(trapName,1,"deck","moss-trap");api.trigger("moss-source",1,"enter")},{trapName:fixtureCards.trap.name});
  await page.locator('#effectDeckPicker button[data-card-id="moss-trap"]').click();
  await page.locator("#effectDeckPicker button").filter({hasText:"選択したカードを罠として場に伏せる"}).click();
  const mossChosen=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(mossChosen.players[1].zones.facedown.some(c=>c.id==="moss-trap"),true,"Moss Tree Spider did not set the selected trap face down");

  await page.evaluate(({energyName,monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("転換",1,"hand","tenkan-source");api.addCard(energyName,1,"energy","tenkan-cost");api.addCard(energyName,1,"deck","tenkan-energy");api.addCard(monsterName,1,"deck","tenkan-draw");api.runEffect("自分のエネルギーが場に無い時使用できない。自分のエネルギー1枚を破壊する。自分のデッキからエネルギー1枚までをタップして出す。自分は1枚引く。",1,"tenkan-source");api.chooseTarget("tenkan-cost")},{energyName:fixtureCards.energy.name,monsterName:fixtureCards.monster.name});
  await page.locator('#effectDeckPicker button[data-card-id="tenkan-energy"]').click();
  await page.locator("#effectDeckPicker button").filter({hasText:"選択したカードをエネルギーとして場に出す"}).click();
  const tenkanChosen=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(tenkanChosen.players[1].zones.energy.some(c=>c.id==="tenkan-energy"&&c.tapped),true,"Tenkan did not deploy the selected energy tapped");
  assert.equal(tenkanChosen.players[1].zones.hand.length,1,"Tenkan did not draw after its energy selection");

  await page.evaluate(({knightName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("王国の騎士団長",1,"monsters","kingdom-commander");api.addCard(knightName,1,"deck","knight-summon-1");api.addCard(knightName,1,"deck","knight-summon-2");api.trigger("kingdom-commander",1,"enter")},{knightName:(cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&String(c.types||"").split(/[,、]/).includes("騎士")&&Number(c.cost)<=2&&!String(c.effect_text||"").trim())||fixtureCards.monster).name});
  const summonPickerVisible=await page.locator("#effectDeckPicker").isVisible().catch(()=>false);
  assert.equal(summonPickerVisible,true,"Kingdom Commander summon did not open a player selection picker");
  await page.locator('#effectDeckPicker button[data-card-id="knight-summon-1"]').click();
  await page.locator('#effectDeckPicker button[data-card-id="knight-summon-2"]').click();
  await page.locator("#effectDeckPicker button").filter({hasText:"選択したカードを場に出す"}).click();
  const summonedKnights=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(summonedKnights.players[1].zones.monsters.filter(c=>c.id.startsWith("knight-summon-")).length,2,"Kingdom Commander did not summon the two selected Knights");

  await page.evaluate(({knightName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("部隊指揮官",1,"monsters","field-commander");api.addCard(knightName,1,"monsters","knight-target");api.trigger("field-commander",1,"enter")},{knightName:(cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&String(c.types||"").split(/[,、]/).includes("騎士")&&!String(c.effect_text||"").trim())||fixtureCards.monster).name});
  await page.locator('.card[data-card-id="knight-target"]').click();
  const buffedKnight=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(buffedKnight.players[1].zones.monsters.find(c=>c.id==="knight-target")?.modification,300,"Field Commander did not apply +300 to the selected Knight");

  await page.evaluate(({monsterName,highPowerMonsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("王国の騎士団長",1,"monsters","kingdom-commander");api.addCard(monsterName,1,"monsters","extra-own");api.addCard(highPowerMonsterName,2,"monsters","commander-target");api.setCardPower("commander-target",2,5000);api.setEnergyPool(1,4);api.activate("kingdom-commander","monsters",0)},{monsterName:fixtureCards.monster.name,highPowerMonsterName:(cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&Number(c.power)>=700)||fixtureCards.monster).name});
  await page.locator('.card[data-card-id="commander-target"]').click();
  const captainDamage=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(captainDamage.players[2].zones.monsters.find(c=>c.id==="commander-target")?.damage,600,"Kingdom Commander did not apply its calculated damage to the clicked target");


  const blueFlowerCondition=await page.evaluate(({trapName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("碧い花",1,"monsters","blue-no-trap");api.setEnergyPool(1,2);api.activate("blue-no-trap","monsters",0);const withoutTrap=api.snapshot();api.reset();api.addCard("碧い花",1,"monsters","blue-with-trap");api.addCard(trapName,1,"facedown","blue-required-trap");api.setEnergyPool(1,2);api.activate("blue-with-trap","monsters",0);return {abilities:api.activatedAbilities("碧い花"),withoutLife:withoutTrap.players[1].life,withoutEnergy:withoutTrap.players[1].energyPool,withLife:api.snapshot().players[1].life,withEnergy:api.snapshot().players[1].energyPool,logs:api.logs()}},{trapName:fixtureCards.trap.name});
  assert.equal(blueFlowerCondition.withoutLife,4000,"Blue Flower's conditional recovery resolved without a trap");
  assert.equal(blueFlowerCondition.withoutEnergy,2,"Blue Flower incorrectly paid its cost without a trap");
  assert.equal(blueFlowerCondition.withLife,4700,"Blue Flower did not recover 700 when a trap was present: "+JSON.stringify(blueFlowerCondition));
  assert.equal(blueFlowerCondition.withEnergy,0,"Blue Flower did not pay its activation cost when its condition was met");

  await page.evaluate(({knightName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("部隊指揮官",1,"monsters","field-commander-activated");api.addCard(knightName,1,"deck","field-commander-knight");api.setEnergyPool(1,3);api.activate("field-commander-activated","monsters",0)},{knightName:(cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&String(c.types||"").split(/[,、]/).includes("騎士")&&Number(c.cost)<=2&&!String(c.effect_text||"").trim())||fixtureCards.monster).name});
  assert.equal(await page.locator("#effectDeckPicker").isVisible().catch(()=>false),true,"Field Commander activated summon did not open a deck picker");
  await page.locator('#effectDeckPicker button[data-card-id="field-commander-knight"]').click();
  await page.locator("#effectDeckPicker button").filter({hasText:"選択したカードを場に出す"}).click();
  const fieldCommanderSummon=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(fieldCommanderSummon.players[1].zones.monsters.some(c=>c.id==="field-commander-knight"),true,"Field Commander activated summon did not move the selected Knight to the field");

  const results=await page.evaluate(({cases,fixture})=>window.__ANKR_TEST__.auditBatch(cases,fixture),{cases,fixture});
  const counts={};for(const result of results)counts[result.status]=(counts[result.status]||0)+1;
  const errors=results.filter(r=>r.status==="runtime_error");
  const report={generatedAt:new Date().toISOString(),cardCount:cardsData.cards.length,clauseCount:cases.length,smoke,counts,runtimeErrorCount:errors.length,results};
  const out=process.argv[2]?path.resolve(process.argv[2]):path.join(root,"effect-live-audit-report.json");
  fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({cardCount:report.cardCount,clauseCount:report.clauseCount,smoke,counts,runtimeErrorCount:errors.length,runtimeErrors:errors.map(r=>({cardId:r.cardId,cardName:r.cardName,clauseIndex:r.clauseIndex,text:r.text,error:r.error?.message})),unimplementedExamples:results.filter(r=>r.status==="unimplemented").slice(0,20).map(r=>({cardId:r.cardId,cardName:r.cardName,clauseIndex:r.clauseIndex,text:r.text})),report:out},null,2));
  assert.equal(errors.length,0,"actual game effect resolver threw during card audit; see report");
 }catch(error){console.error(error);process.exitCode=1}
 finally{if(browser)await browser.close();server.close()}
})();
