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
const byType=(tag,type,preferred)=>{const matches=c=>String(c.tags||"").includes(tag)&&String(c.types||"").split(/[,、]/).map(v=>v.trim()).includes(type);return cardsData.cards.find(c=>matches(c)&&c.name===preferred)||cardsData.cards.find(c=>matches(c)&&!String(c.effect_text||"").trim())||cardsData.cards.find(matches)};
const fixtureCards={
 monster:cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&!String(c.effect_text||"").trim()&&Number(c.power)>=600)||byTag("#モンスターカード"),
 energy:byTag("#エネルギーカード"),
 spell:byTag("#魔法カード"),
 trap:byTag("#罠カード"),
 field:byTag("#フィールドカード"),
 dragon:byType("#モンスターカード","ドラゴン","チビドラゴン"),
 plant:byType("#モンスターカード","植物","羊歯の魔物"),
 insect:byType("#モンスターカード","虫","テントウムシ"),
 beast:byType("#モンスターカード","獣","イノシシ"),
 darkSpell:byType("#魔法カード","闇","暗殺"),
 machine:byType("#モンスターカード","機械","戦闘兵器 : C"),
 effectfulMonster:cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&String(c.effect_text||"").trim()&&Number(c.cost)>0),
 waterEnergy:byType("#エネルギーカード","水","マリンエネルギー"),
 earthEnergy:byType("#エネルギーカード","地","フォレストエネルギー")
};
for(const [kind,card] of Object.entries(fixtureCards))if(!card)throw new Error("fixture card missing: "+kind);
const fixture=[
 {name:fixtureCards.monster.name,owner:1,zone:"monsters",id:"fx-p1-m1",state:{damage:300,tapped:true,counters:1}},
 {name:fixtureCards.monster.name,owner:1,zone:"monsters",id:"fx-p1-m2"},
 {name:fixtureCards.plant.name,owner:1,zone:"monsters",id:"fx-p1-plant"},
 {name:fixtureCards.insect.name,owner:1,zone:"monsters",id:"fx-p1-insect"},
 {name:fixtureCards.dragon.name,owner:1,zone:"monsters",id:"fx-p1-dragon"},
 {name:fixtureCards.beast.name,owner:1,zone:"monsters",id:"fx-p1-beast"},
 {name:fixtureCards.energy.name,owner:1,zone:"energy",id:"fx-p1-e1"},
 {name:fixtureCards.energy.name,owner:1,zone:"energy",id:"fx-p1-e2"},
 {name:fixtureCards.waterEnergy.name,owner:1,zone:"energy",id:"fx-p1-water"},
 {name:fixtureCards.earthEnergy.name,owner:1,zone:"energy",id:"fx-p1-earth"},
 {name:fixtureCards.monster.name,owner:1,zone:"hand",id:"fx-p1-h1"},
 {name:fixtureCards.spell.name,owner:1,zone:"deck",id:"fx-p1-d1"},
 {name:fixtureCards.monster.name,owner:1,zone:"deck",id:"fx-p1-d2"},
 {name:fixtureCards.energy.name,owner:1,zone:"deck",id:"fx-p1-d3"},
 {name:fixtureCards.trap.name,owner:1,zone:"deck",id:"fx-p1-d4"},
 {name:fixtureCards.darkSpell.name,owner:1,zone:"deck",id:"fx-p1-d5"},
 {name:fixtureCards.beast.name,owner:1,zone:"deck",id:"fx-p1-d6"},
 {name:fixtureCards.monster.name,owner:1,zone:"deck",id:"fx-p1-d7"},
 {name:fixtureCards.monster.name,owner:1,zone:"deck",id:"fx-p1-d8"},
 {name:fixtureCards.monster.name,owner:1,zone:"deck",id:"fx-p1-d9"},
 {name:fixtureCards.spell.name,owner:1,zone:"discard",id:"fx-p1-x1"},
 {name:fixtureCards.field.name,owner:1,zone:"discard",id:"fx-p1-x2"},
 {name:fixtureCards.monster.name,owner:1,zone:"discard",id:"fx-p1-x3"},
 {name:fixtureCards.trap.name,owner:1,zone:"facedown",id:"fx-p1-t1"},
 {name:fixtureCards.field.name,owner:1,zone:"field",id:"fx-p1-f1"},
 {name:fixtureCards.monster.name,owner:2,zone:"monsters",id:"fx-p2-m1",state:{tapped:true}},
 {name:fixtureCards.monster.name,owner:2,zone:"monsters",id:"fx-p2-m2"},
 {name:fixtureCards.energy.name,owner:2,zone:"energy",id:"fx-p2-e1"},
 {name:fixtureCards.monster.name,owner:2,zone:"hand",id:"fx-p2-h1"},
 {name:fixtureCards.spell.name,owner:2,zone:"deck",id:"fx-p2-d1"},
 {name:fixtureCards.spell.name,owner:2,zone:"discard",id:"fx-p2-x1"},
 {name:fixtureCards.field.name,owner:2,zone:"field",id:"fx-p2-f1"},
 {name:fixtureCards.trap.name,owner:2,zone:"facedown",id:"fx-p2-t1"}
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
  cases.push({cardId:card.id,cardName:card.name,sourceZone,clauseIndex:ability.index,text,raw:ability.raw,cardEffectText:effect,trigger:ability.trigger,isActivated:ability.isActivated,costKind:ability.costKind});
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
  assert.equal(smoke.activatedPending,"sourcePowerMonsterDamage","activated ability did not request a board target");
  assert.equal(smoke.archerTapped,true,"tap activation cost was not paid");
  await page.locator('.card[data-card-id="archer-target"]').click();
  const clickedTarget=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  const archerCard=clickedTarget.players[1].zones.monsters.find(c=>c.id==="archer");
  assert.equal(clickedTarget.players[2].zones.monsters.find(c=>c.id==="archer-target")?.damage,archerCard?.power||0,"clicking the actual board target did not resolve the activated ability");

  const crossbowPending=await page.evaluate(({targetName})=>{
   const api=window.__ANKR_TEST__;api.reset();
   const source=api.addCard("弩弓の騎士",1,"monsters","crossbow-source");
   api.addCard(targetName,2,"monsters","crossbow-target");
   api.setCardPower("crossbow-source",1,600);
   api.setCardPower("crossbow-target",2,2000);
   api.snapshot();
   api.activate(source,"monsters",0);
   return api.snapshot();
  },{targetName:fixtureCards.monster.name});
  const crossbowSource=crossbowPending.players[1].zones.monsters.find(c=>c.id==="crossbow-source");
  assert.equal(crossbowPending.pendingTarget?.kind,"sourcePowerMonsterDamage","Crossbow Knight did not request a board target for its power-based activated damage");
  assert.equal(crossbowSource?.tapped,true,"Crossbow Knight did not pay its tap activation cost");
  assert.equal(crossbowSource?.power,0,"Crossbow Knight fixture did not retain its zero combat-power value");
  await page.locator('.card[data-card-id="crossbow-target"]').click();
  const crossbowResolved=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(crossbowResolved.players[2].zones.monsters.find(c=>c.id==="crossbow-target")?.damage,600,"Crossbow Knight's ability incorrectly used its zero combat power instead of its printed/effect power");

  const iceWall=await page.evaluate(({sourceName,targetName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(sourceName,1,"monsters","ice-attacker");api.addCard("氷壁",2,"facedown","ice-wall");api.addCard(targetName,2,"deck","ice-draw");const result=api.attack("ice-attacker");return {opponentLife:result.players[2].life,opponentHand:result.players[2].zones.hand.length,trapDiscarded:result.players[2].zones.discard.some(c=>c.id==="ice-wall")};},{sourceName:fixtureCards.monster.name,targetName:fixtureCards.monster.name});
  assert.equal(iceWall.opponentLife,4000,"Ice Wall did not reduce the attack damage to zero");
  assert.equal(iceWall.opponentHand,1,"Ice Wall did not resolve its draw clause");
  assert.equal(iceWall.trapDiscarded,true,"Ice Wall did not move to discard after activation");

  const blueFlowerAbility=await page.evaluate(({trapName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("碧い花",1,"monsters","blue-flower-activated");api.addCard(trapName,1,"facedown","blue-flower-activation-trap");api.setEnergyPool(1,2);return api.activate("blue-flower-activated","monsters",0)},{trapName:fixtureCards.trap.name});
  assert.equal(blueFlowerAbility.players[1].life,4700,"Blue Flower's activated 700-heal ability did not resolve");
  assert.equal(blueFlowerAbility.players[1].energyPool,0,"Blue Flower's activated ability did not pay its two-energy cost");
  const blueFlowerWithoutTrap=await page.evaluate(()=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("碧い花",1,"monsters","blue-flower-no-trap");api.setEnergyPool(1,2);return api.activate("blue-flower-no-trap","monsters",0)});
  assert.equal(blueFlowerWithoutTrap.players[1].life,4000,"Blue Flower activated without its required set trap");
  assert.equal(blueFlowerWithoutTrap.players[1].energyPool,2,"Blue Flower paid its cost when its trap condition was not met");

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

  await page.evaluate(({trapName})=>{
   const api=window.__ANKR_TEST__;api.reset();
   api.addCard("苔木蜘蛛",1,"monsters","moss-selection-source");
   api.addCard(trapName,1,"deck","moss-selection-trap");
   api.trigger("moss-selection-source",1,"enter");
   return api.snapshot();
  },{trapName:fixtureCards.trap.name});
  assert.equal(await page.locator("#effectDeckPicker").isVisible().catch(()=>false),true,"Moss Tree Spider did not open its deck trap selection UI");
  await page.locator('#effectDeckPicker button[data-card-id="moss-selection-trap"]').click();
  await page.locator("#effectDeckPicker button").filter({hasText:"選択したカードを罠として場に伏せる"}).click();
  const mossTrapPlaced=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  const selectedMossTrap=mossTrapPlaced.players[1].zones.facedown.find(c=>c.id==="moss-selection-trap");
  assert.ok(selectedMossTrap,"Moss Tree Spider did not move the selected trap from the deck to the facedown zone");
  assert.equal(mossTrapPlaced.players[1].zones.facedown.length,1,"Moss Tree Spider did not keep the selected trap in the facedown zone");
  assert.equal(mossTrapPlaced.players[1].zones.deck.length,0,"Moss Tree Spider did not remove the selected trap from the deck");
  assert.equal(mossTrapPlaced.pendingTarget,null,"Moss Tree Spider left a stale selection pending after confirmation");
  assert.equal(advanced.blueFlowerLife,4000+advanced.expectedHighPower,"Blue Flower maximum-power healing did not resolve");
  assert.equal(advanced.tenkanPending,"deckSearchMove","Tenkan did not continue to its deck-energy selection");
  assert.equal(advanced.tenkanDestination,"energy","Tenkan did not offer energy deployment");
  assert.equal(advanced.tenkanPicker,true,"Tenkan energy picker was not displayed");
  assert.equal(advanced.passiveBefore,true,"Kingdom Spearman untapped passive was not recalculated");
  assert.equal(advanced.passiveAfter,false,"Kingdom Spearman passive source removal was not reflected");

  const passiveSources=await page.evaluate(()=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("深森の守護者",1,"monsters","no-direct-attack");const directBefore=api.snapshot().playerPassives[2].opponentMonstersCannotAttackPlayer;api.removeCard("no-direct-attack");const directAfter=api.snapshot().playerPassives[2].opponentMonstersCannotAttackPlayer;api.reset();api.addCard("魔風のハーピー",1,"monsters","trap-lock");const trapBefore=api.snapshot().playerPassives[2].disableOpponentTraps;api.removeCard("trap-lock");const trapAfter=api.snapshot().playerPassives[2].disableOpponentTraps;api.reset();api.addCard("鼓膜破り",1,"monsters","enter-lock");const enterBefore=api.snapshot().playerPassives[2].disableOpponentEnterEffects;api.removeCard("enter-lock");const enterAfter=api.snapshot().playerPassives[2].disableOpponentEnterEffects;api.reset();api.addCard("結界機兵",1,"monsters","damage-reduction");const reductionBefore=api.snapshot().playerPassives[1].damageReduction;api.removeCard("damage-reduction");const reductionAfter=api.snapshot().playerPassives[1].damageReduction;return {directBefore,directAfter,trapBefore,trapAfter,enterBefore,enterAfter,reductionBefore,reductionAfter}});
  assert.equal(passiveSources.directBefore,true,"Deep Forest Guardian player-level attack restriction was not derived");
  assert.equal(passiveSources.directAfter,false,"Player-level attack restriction remained after its source left");
  assert.equal(passiveSources.trapBefore,true,"Harpy trap suppression was not derived");
  assert.equal(passiveSources.trapAfter,false,"Trap suppression remained after its source left");
  assert.equal(passiveSources.enterBefore,true,"Enter-effect suppression was not derived");
  assert.equal(passiveSources.enterAfter,false,"Enter-effect suppression remained after its source left");
  assert.equal(passiveSources.reductionBefore,300,"Player damage reduction passive was not derived");
  assert.equal(passiveSources.reductionAfter,0,"Player damage reduction remained after its source left");

  const entryTriggers=await page.evaluate(({machineName,beastName})=>{
   const api=window.__ANKR_TEST__;
   api.reset();
   api.addCard("プラスラッシャー",1,"monsters","plus-source");
   api.trigger("plus-source",1,"enter");
   const plusSelf=api.snapshot().players[1].zones.monsters.find(c=>c.id==="plus-source")?.modification||0;
   api.addCard(machineName,1,"monsters","plus-entered");
   api.trigger("plus-entered",1,"enter");
   const plusAfter=api.snapshot().players[1].zones.monsters.find(c=>c.id==="plus-source")?.modification||0;
   api.reset();
   api.addCard("火口の溶魚",1,"monsters","lava-source");
   api.addCard(beastName,2,"monsters","opponent-entered");
   api.trigger("opponent-entered",2,"enter");
   const lavaDamage=api.snapshot().players[2].zones.monsters.find(c=>c.id==="opponent-entered")?.damage||0;
   api.reset();
   api.addCard("還り門の森",1,"field","forest-field");
   api.addCard(beastName,1,"monsters","forest-entered");
   api.trigger("forest-entered",1,"enter");
   const fieldBuff=api.snapshot().players[1].zones.monsters.find(c=>c.id==="forest-entered")?.modification||0;
   return {plusSelf,plusAfter,lavaDamage,fieldBuff};
  },{machineName:fixtureCards.machine.name,beastName:fixtureCards.beast.name});
  assert.equal(entryTriggers.plusSelf,0,"Plus Slasher incorrectly triggered on itself despite the 'other' qualifier");
  assert.equal(entryTriggers.plusAfter,100,"Plus Slasher did not trigger when another Machine monster entered");
  assert.equal(entryTriggers.lavaDamage,300,"Crater Fish did not damage an opponent monster entering the field");
  assert.equal(entryTriggers.fieldBuff,100,"Returning Forest did not buff an entering Beast");

  const costReduction=await page.evaluate(({emptyName,effectfulName})=>{
   const api=window.__ANKR_TEST__;
   api.reset();
   api.addCard("雲のゴーレム",1,"monsters","golem-source");
   const golemEmpty=api.addCard(emptyName,1,"hand","golem-empty");
   const golemEffectful=api.addCard(effectfulName,1,"hand","golem-effectful");
   const withGolemEmpty=api.effectiveCost(golemEmpty);
   const withGolemEffectful=api.effectiveCost(golemEffectful);
   api.reset();
   api.addCard("持たざる者の闘技場",1,"field","arena-source");
   const arenaEmpty=api.addCard(emptyName,1,"hand","arena-empty");
   const withArena=api.effectiveCost(arenaEmpty);
   api.setCardState("arena-source",1,"field",{effectsDisabled:true});
   const afterArenaDisabled=api.effectiveCost(arenaEmpty);
   return {withGolemEmpty,withGolemEffectful,withArena,afterArenaDisabled};
  },{emptyName:fixtureCards.monster.name,effectfulName:fixtureCards.effectfulMonster.name});
  const emptyBaseCost=Number(cardsData.cards.find(c=>c.name===fixtureCards.monster.name)?.cost)||0;
  const effectfulBaseCost=Number(fixtureCards.effectfulMonster.cost)||0;
  assert.equal(costReduction.withGolemEmpty,Math.max(0,emptyBaseCost-1),"Cloud Golem did not reduce the cost of an effectless monster");
  assert.equal(costReduction.withGolemEffectful,effectfulBaseCost,"Cloud Golem incorrectly reduced the cost of a monster with an effect");
  assert.equal(costReduction.withArena,Math.max(0,emptyBaseCost-1),"Arena of the Unpossessing did not reduce the cost of an effectless monster");
  assert.equal(costReduction.afterArenaDisabled,emptyBaseCost,"An effect-disabled Arena continued reducing costs");

  const onlineEntryTrigger=await page.evaluate(({machineName})=>{
   const api=window.__ANKR_TEST__;
   api.reset();
   api.addCard("火口の溶魚",1,"monsters","online-lava-source");
   api.addCard("プラスラッシャー",2,"monsters","remote-plus-source");
   api.setOnlineTestMode();
   const state=api.applyOpponentMonsterForTest(machineName,"online-machine-entered");
   return {
    enteringDamage:state.players[2].zones.monsters.find(c=>c.id==="online-machine-entered")?.damage||0,
    remoteSourceModification:state.players[2].zones.monsters.find(c=>c.id==="remote-plus-source")?.modification||0
   };
  },{machineName:fixtureCards.machine.name});
  assert.equal(onlineEntryTrigger.enteringDamage,300,"Local player's opponent-entry trigger did not resolve from an online public-state update");
  assert.equal(onlineEntryTrigger.remoteSourceModification,0,"The local client incorrectly executed the remote player's own ally-entry trigger");

  assert.equal(advanced.secondTurnHand,1,"second player's first turn did not draw");
  assert.equal(advanced.firstTurnHand,0,"first player's initial turn incorrectly drew");
  assert.equal(advanced.commanderBuffPending,"taggedMonsterBuff","Field Commander did not request a Knight target");
  assert.equal(advanced.captainPending,"formulaMonsterDamage","Kingdom Commander did not request a board target for its damage formula");


  await page.evaluate(({knightName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("部隊指揮官",1,"monsters","commander-buff-source");api.addCard(knightName,1,"monsters","commander-buff-target");api.trigger("commander-buff-source",1,"enter");return api.snapshot()},{knightName:(cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&String(c.types||"").split(/[,、]/).includes("騎士")&&Number(c.cost)<=2&&!String(c.effect_text||"").trim())||fixtureCards.monster).name});
  assert.equal((await page.evaluate(()=>window.__ANKR_TEST__.snapshot())).pendingTarget?.kind,"taggedMonsterBuff","Field Commander did not enter board-click target selection");
  await page.locator('.card[data-card-id="commander-buff-target"]').click();
  const commanderBuffed=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(commanderBuffed.players[1].zones.monsters.find(c=>c.id==="commander-buff-target")?.modification,300,"Field Commander did not apply +300 to the selected Knight");

  await page.evaluate(({knightName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("王国の騎士団長",1,"monsters","kingdom-summon-source");api.addCard(knightName,1,"deck","kingdom-summon-a");api.addCard(knightName,1,"deck","kingdom-summon-b");api.trigger("kingdom-summon-source",1,"enter");return api.snapshot()},{knightName:(cardsData.cards.find(c=>String(c.tags||"").includes("#モンスターカード")&&String(c.types||"").split(/[,、]/).includes("騎士")&&Number(c.cost)<=2&&!String(c.effect_text||"").trim())||fixtureCards.monster).name});
  assert.equal(await page.locator("#effectDeckPicker").isVisible().catch(()=>false),true,"Kingdom Commander did not open a player-selected deck summon picker");
  assert.equal(await page.locator('#effectDeckPicker button[data-card-id="kingdom-summon-a"]').count(),1,"Kingdom Commander picker omitted the first eligible Knight");
  await page.locator('#effectDeckPicker button[data-card-id="kingdom-summon-a"]').click();
  await page.locator('#effectDeckPicker button[data-card-id="kingdom-summon-b"]').click();
  await page.locator("#effectDeckPicker button").filter({hasText:"選択したカードを場に出す"}).click();
  const kingdomSummoned=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(kingdomSummoned.players[1].zones.monsters.some(c=>c.id==="kingdom-summon-a"),true,"Kingdom Commander did not summon the first selected Knight");
  assert.equal(kingdomSummoned.players[1].zones.monsters.some(c=>c.id==="kingdom-summon-b"),true,"Kingdom Commander did not summon the second selected Knight");

  await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("王国の騎士団長",1,"monsters","kingdom-damage-source");api.addCard(monsterName,1,"monsters","kingdom-damage-own-count");api.addCard(monsterName,2,"monsters","kingdom-damage-target");api.setCardPower("kingdom-damage-target",2,2000);api.setEnergyPool(1,4);return api.activate("kingdom-damage-source","monsters",0)},{monsterName:fixtureCards.monster.name});
  assert.equal((await page.evaluate(()=>window.__ANKR_TEST__.snapshot())).pendingTarget?.kind,"formulaMonsterDamage","Kingdom Commander did not request its formula damage target");
  await page.locator('.card[data-card-id="kingdom-damage-target"]').click();
  const kingdomDamage=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(kingdomDamage.players[2].zones.monsters.find(c=>c.id==="kingdom-damage-target")?.damage,600,"Kingdom Commander did not apply damage based on the own monster count");

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

  await page.evaluate(({energyName,monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("転換",1,"hand","tenkan-source");api.addCard(energyName,1,"energy","tenkan-cost");api.addCard(energyName,1,"deck","tenkan-energy");api.addCard(monsterName,1,"deck","tenkan-draw");api.runEffect("自分のエネルギーが場に無い時使用できない。自分のエネルギー1枚を破壊する。自分のデッキからエネルギー1枚までをタップして出す。自分は1枚引く。",1,"tenkan-source")},{energyName:fixtureCards.energy.name,monsterName:fixtureCards.monster.name});
  await page.locator('.card[data-card-id="tenkan-cost"]').click();
  await page.locator('#effectDeckPicker button[data-card-id="tenkan-energy"]').click();
  await page.locator("#effectDeckPicker button").filter({hasText:"選択したカードをエネルギーとして場に出す"}).click();
  const tenkanChosen=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(tenkanChosen.players[1].zones.energy.some(c=>c.id==="tenkan-energy"&&c.tapped),true,"Tenkan did not deploy the selected energy tapped");
  assert.equal(tenkanChosen.players[1].zones.hand.length,1,"Tenkan did not draw after its energy selection");

  await page.evaluate(({trapName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("蜘蛛の目",1,"hand","spider-eye-source");api.addCard(trapName,1,"deck","spider-eye-trap");api.runEffect("自分のデッキから罠1枚までを秘密裏に伏せる。",1,"spider-eye-source")},{trapName:fixtureCards.trap.name});
  assert.equal(await page.locator("#effectDeckPicker").isVisible().catch(()=>false),true,"Spider's Eye did not open a trap selection picker");
  await page.locator('#effectDeckPicker button[data-card-id="spider-eye-trap"]').click();
  await page.locator("#effectDeckPicker button").filter({hasText:"選択したカードを罠として場に伏せる"}).click();
  assert.equal((await page.evaluate(()=>window.__ANKR_TEST__.snapshot())).players[1].zones.facedown.some(c=>c.id==="spider-eye-trap"),true,"Spider's Eye did not set the selected trap face down");

  await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.setCardEffectText(monsterName,"攻撃できない。");api.addCard(monsterName,1,"monsters","erase-own");api.addCard(monsterName,2,"monsters","erase-opponent");api.addCard("光の蝕み",1,"hand","light-erosion");api.runEffect("モンスター1体の効果を消す。",1,"light-erosion")},{monsterName:fixtureCards.monster.name});
  assert.equal(await page.locator('.card[data-card-id="erase-opponent"]').isVisible().catch(()=>false),true,"generic effect erasure did not expose board targets");
  await page.locator('.card[data-card-id="erase-opponent"]').click();
  let erased=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(erased.players[2].zones.monsters.find(c=>c.id==="erase-opponent")?.effectsDisabled,true,"Light Erosion did not disable the selected opponent monster");

  const counterTest=await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"monsters","counter-own");api.addCard(monsterName,2,"monsters","counter-opponent");api.runEffect("モンスター1体にカウンターを1個を乗せる。",1);return api.snapshot()},{monsterName:fixtureCards.monster.name});
  assert.equal(counterTest.pendingTarget?.kind,"counterMonster","generic counter effect did not request a board target");
  await page.locator('.card[data-card-id="counter-own"]').click();
  assert.equal((await page.evaluate(()=>window.__ANKR_TEST__.snapshot())).players[1].zones.monsters.find(c=>c.id==="counter-own")?.counters,1,"generic counter effect did not add a counter to the selected monster");

  await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"monsters","heal-target");api.setCardState("heal-target",1,"monsters",{damage:300});api.runEffect("自分のモンスター1体を全回復。",1)},{monsterName:fixtureCards.monster.name});
  assert.equal(await page.locator('.card[data-card-id="heal-target"]').isVisible().catch(()=>false),true,"single-monster full heal did not request a board target");
  await page.locator('.card[data-card-id="heal-target"]').click();
  assert.equal((await page.evaluate(()=>window.__ANKR_TEST__.snapshot())).players[1].zones.monsters.find(c=>c.id==="heal-target")?.damage,0,"single-monster full heal did not clear damage");

  const allCounters=await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"monsters","counter-all-1");api.addCard(monsterName,1,"monsters","counter-all-2");api.runEffect("自分のモンスター全てにカウンター1個を乗せる。",1);return api.snapshot()},{monsterName:fixtureCards.monster.name});
  assert.equal(allCounters.players[1].zones.monsters.every(c=>c.counters===1),true,"group counter effect did not update every own monster");

  const allDisabled=await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.setCardEffectText(monsterName,"攻撃できない。");api.addCard(monsterName,1,"monsters","disable-all-own");api.addCard(monsterName,2,"monsters","disable-all-opponent");api.runEffect("モンスター全ての効果を消す。",1);return api.snapshot()},{monsterName:fixtureCards.monster.name});
  assert.equal(allDisabled.players[1].zones.monsters[0].effectsDisabled,true,"Wind Erosion did not disable own monster effects");
  assert.equal(allDisabled.players[2].zones.monsters[0].effectsDisabled,true,"Wind Erosion did not disable opponent monster effects");

  const selfDisabled=await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.setCardEffectText(monsterName,"攻撃できない。");api.addCard(monsterName,1,"monsters","disable-self-own");api.addCard(monsterName,2,"monsters","disable-self-opponent");api.runEffect("自分のモンスター全ての効果を消す。",1);return api.snapshot()},{monsterName:fixtureCards.monster.name});
  assert.equal(selfDisabled.players[1].zones.monsters[0].effectsDisabled,true,"Supercritical did not disable own monster effects");
  assert.equal(selfDisabled.players[2].zones.monsters[0].effectsDisabled,false,"Supercritical incorrectly disabled opponent monster effects");

  const allUntapped=await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"monsters","untap-target");api.setCardState("untap-target",1,"monsters",{tapped:true});api.runEffect("自分のモンスター全てをアンタップする。",1);return api.snapshot()},{monsterName:fixtureCards.monster.name});
  assert.equal(allUntapped.players[1].zones.monsters[0].tapped,false,"Clockwork Package did not untap all own monsters");

  const drawToLimit=await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();for(let i=0;i<8;i++)api.addCard(monsterName,1,"hand","limit-hand-"+i);for(let i=0;i<8;i++)api.addCard(monsterName,1,"deck","limit-deck-"+i);api.runEffect("自分は上限まで引く。",1);return api.snapshot()},{monsterName:fixtureCards.monster.name});
  assert.equal(drawToLimit.players[1].zones.hand.length,9,"Heavenly Revelation did not draw up to the hand limit");
  assert.equal(drawToLimit.players[1].zones.deck.length,7,"Heavenly Revelation drew more than the number needed to reach the hand limit");

  const formulaEffects=await page.evaluate(({dragonName,drawName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(dragonName,1,"monsters","formula-dragon-1");api.addCard(dragonName,1,"monsters","formula-dragon-2");api.addCard(drawName,1,"deck","formula-draw-1");api.addCard(drawName,1,"deck","formula-draw-2");api.runEffect("自分に1000ダメージ。",1);api.runEffect("自分は（自分の[ドラゴン]の数）枚引く。",1);api.runEffect("自分を（自分の[ドラゴン]の数×300）回復。",1);return api.snapshot()},{dragonName:fixtureCards.dragon.name,drawName:fixtureCards.monster.name});
  assert.equal(formulaEffects.players[1].zones.hand.length,2,"Dragon-count draw did not draw the matching number of cards");
  assert.equal(formulaEffects.players[1].life,3600,"Dragon-count healing did not use the current number of Dragon monsters");

  const manaFormulas=await page.evaluate(({energyName,plantName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(energyName,1,"energy","formula-energy-1");api.addCard(energyName,1,"energy","formula-energy-2");api.addCard(plantName,1,"monsters","formula-plant-1");api.addCard(plantName,1,"monsters","formula-plant-2");api.setEnergyPool(1,1);api.runEffect("自分のマナ+（自分のエネルギーの数）。",1);api.runEffect("自分のマナ+（自分の[植物]の数）。",1);const beforeSpend=api.snapshot().players[1].energyPool;api.runEffect("自分のマナ-（自分の残りマナ）。",1);return {beforeSpend,afterSpend:api.snapshot().players[1].energyPool}},{energyName:fixtureCards.energy.name,plantName:fixtureCards.plant.name});
  assert.equal(manaFormulas.beforeSpend,5,"energy and Plant counts did not increase available mana");
  assert.equal(manaFormulas.afterSpend,0,"spending all remaining mana did not reduce available mana to zero");

  const handDiscard=await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"hand","hand-discard-target");api.runEffect("自分は手札から1枚を捨てる。",1);return api.snapshot()},{monsterName:fixtureCards.monster.name});
  assert.equal(handDiscard.pendingTarget?.kind,"discardHand","one-card hand discard did not request an explicit card selection");
  await page.locator('.card[data-card-id="hand-discard-target"]').click();
  let afterHandDiscard=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(afterHandDiscard.players[1].zones.discard.some(c=>c.id==="hand-discard-target"),true,"selected hand card was not moved to discard");

  await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"monsters","modifier-own");api.addCard(monsterName,2,"monsters","modifier-opponent");api.runEffect("相手のモンスター1体を-500。",1)},{monsterName:fixtureCards.monster.name});
  await page.locator('.card[data-card-id="modifier-opponent"]').click();
  let afterOpponentModifier=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(afterOpponentModifier.players[2].zones.monsters.find(c=>c.id==="modifier-opponent")?.modification,-500,"opponent single-monster modifier did not apply the selected negative modifier");

  await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"monsters","return-own");api.runEffect("自分のモンスター1体を手札に戻す。",1)},{monsterName:fixtureCards.monster.name});
  await page.locator('.card[data-card-id="return-own"]').click();
  let afterOwnReturn=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(afterOwnReturn.players[1].zones.hand.some(c=>c.id==="return-own"),true,"own monster was not returned to hand");

  await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"monsters","return-any-own");api.addCard(monsterName,2,"monsters","return-any-opponent");api.runEffect("モンスター1体を手札に戻す。",1)},{monsterName:fixtureCards.monster.name});
  await page.locator('.card[data-card-id="return-any-opponent"]').click();
  let afterOpponentReturn=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(afterOpponentReturn.players[2].zones.hand.some(c=>c.id==="return-any-opponent"),true,"generic return-to-hand effect did not return the selected opponent monster");

  await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"monsters","destroy-any-own");api.addCard(monsterName,2,"monsters","destroy-any-opponent");api.runEffect("モンスター1体を破壊する。",1)},{monsterName:fixtureCards.monster.name});
  await page.locator('.card[data-card-id="destroy-any-opponent"]').click();
  let afterGenericDestroy=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(afterGenericDestroy.players[2].zones.discard.some(c=>c.id==="destroy-any-opponent"),true,"generic monster destruction did not move the selected opponent monster to discard");

  await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,2,"monsters","discard-any-opponent");api.runEffect("場から相手のモンスター1体を捨てる。",1)},{monsterName:fixtureCards.monster.name});
  await page.locator('.card[data-card-id="discard-any-opponent"]').click();
  let afterFieldDiscard=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(afterFieldDiscard.players[2].zones.discard.some(c=>c.id==="discard-any-opponent"),true,"field-to-discard effect did not move the selected opponent monster to discard");

  await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"monsters","bottom-own");api.addCard(monsterName,2,"monsters","bottom-opponent");api.runEffect("モンスター1体をデッキの下に戻す。",1)},{monsterName:fixtureCards.monster.name});
  await page.locator('.card[data-card-id="bottom-opponent"]').click();
  let afterBottomDeck=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(afterBottomDeck.players[2].zones.deck.some(c=>c.id==="bottom-opponent"),true,"generic bottom-deck effect did not move the selected opponent monster to the bottom of the deck");

  await page.evaluate(({energyName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(energyName,2,"energy","destroy-opponent-energy");api.runEffect("相手のエネルギー1枚を破壊する。",1)},{energyName:fixtureCards.energy.name});
  await page.locator('.card[data-card-id="destroy-opponent-energy"]').click();
  let afterEnergyDestroy=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(afterEnergyDestroy.players[2].zones.discard.some(c=>c.id==="destroy-opponent-energy"),true,"opponent energy destruction did not move the selected energy to discard");

  const voidEnergyStart=await page.evaluate(({energyName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(energyName,1,"energy","void-own-energy-a");api.addCard(energyName,1,"energy","void-own-energy-b");api.addCard(energyName,2,"energy","void-opponent-energy-a");api.addCard(energyName,2,"energy","void-opponent-energy-b");return api.runEffect("自分と相手のエネルギー1枚ずつを破壊する。",1)},{energyName:fixtureCards.energy.name});
  assert.equal(voidEnergyStart.pendingTarget?.kind,"bothPlayersEnergyDestroy","VOID did not request explicit energy targets");
  assert.equal(voidEnergyStart.pendingTarget?.candidates.length,2,"VOID did not offer the controller's own energy cards first");
  await page.locator('.card[data-card-id="void-own-energy-b"]').click();
  const voidAfterOwn=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(voidAfterOwn.players[1].zones.discard.some(c=>c.id==="void-own-energy-b"),true,"VOID did not destroy the selected own energy");
  assert.equal(voidAfterOwn.players[1].zones.energy.some(c=>c.id==="void-own-energy-a"),true,"VOID destroyed an unselected own energy");
  assert.equal(voidAfterOwn.pendingTarget?.kind,"bothPlayersEnergyDestroy","VOID did not continue to the opponent energy selection");
  assert.equal(voidAfterOwn.pendingTarget?.candidates.length,2,"VOID did not offer the opponent's eligible energy cards");
  await page.locator('.card[data-card-id="void-opponent-energy-a"]').click();
  const voidAfterBoth=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(voidAfterBoth.players[2].zones.discard.some(c=>c.id==="void-opponent-energy-a"),true,"VOID did not destroy the selected opponent energy");
  assert.equal(voidAfterBoth.players[2].zones.energy.some(c=>c.id==="void-opponent-energy-b"),true,"VOID destroyed an unselected opponent energy");
  assert.equal(voidAfterBoth.players[1].zones.energy.length,1,"VOID did not destroy exactly one own energy");
  assert.equal(voidAfterBoth.players[2].zones.energy.length,1,"VOID did not destroy exactly one opponent energy");

  const afterFieldDestroy=await page.evaluate(({fieldName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(fieldName,2,"field","destroy-opponent-field");api.runEffect("相手のフィールドを破壊する。",1);return api.snapshot()},{fieldName:fixtureCards.field.name});
  assert.equal(afterFieldDestroy.players[2].zones.field.length,0,"opponent field destruction left the field card in play");
  assert.equal(afterFieldDestroy.players[2].zones.discard.some(c=>c.id==="destroy-opponent-field"),true,"opponent field destruction did not move the field card to discard");

  const boardWipe=await page.evaluate(({monsterName,trapName,fieldName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"monsters","blast-own-monster");api.addCard(monsterName,2,"monsters","blast-opponent-monster");api.addCard(trapName,1,"facedown","blast-own-trap");api.addCard(trapName,2,"facedown","blast-opponent-trap");api.addCard(fieldName,1,"field","blast-own-field");api.addCard(fieldName,2,"field","blast-opponent-field");api.runEffect("モンスターと罠とフィールド全てを破壊する。",1);return api.snapshot()},{monsterName:fixtureCards.monster.name,trapName:fixtureCards.trap.name,fieldName:fixtureCards.field.name});
  for(const id of ["blast-own-monster","blast-own-trap","blast-own-field"])assert.equal(boardWipe.players[1].zones.discard.some(c=>c.id===id),true,"Super Explosion did not discard own "+id);
  for(const id of ["blast-opponent-monster","blast-opponent-trap","blast-opponent-field"])assert.equal(boardWipe.players[2].zones.discard.some(c=>c.id===id),true,"Super Explosion did not discard opponent "+id);
  assert.equal(boardWipe.players[1].zones.monsters.length,0,"Super Explosion left own monsters in play");
  assert.equal(boardWipe.players[2].zones.monsters.length,0,"Super Explosion left opponent monsters in play");
  assert.equal(boardWipe.players[1].zones.facedown.length,0,"Super Explosion left own traps set");
  assert.equal(boardWipe.players[2].zones.facedown.length,0,"Super Explosion left opponent traps set");
  assert.equal(boardWipe.players[1].zones.field.length,0,"Super Explosion left own field in play");
  assert.equal(boardWipe.players[2].zones.field.length,0,"Super Explosion left opponent field in play");

  await page.evaluate(()=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("ハナバチ",1,"discard","grave-power-100-a");api.addCard("テントウムシ",1,"discard","grave-power-100-b");api.addCard("兵隊アリ",1,"discard","grave-power-200");api.runEffect("自分の捨て札からパワー100の[虫]3体までを出す。",1)});
  assert.equal(await page.locator("#effectDeckPicker").isVisible().catch(()=>false),true,"Exact-power graveyard summon did not open a player selection picker");
  assert.equal(await page.locator('#effectDeckPicker button[data-card-id="grave-power-100-a"]').count(),1,"Exact-power graveyard summon omitted a matching 100-power Insect");
  assert.equal(await page.locator('#effectDeckPicker button[data-card-id="grave-power-100-b"]').count(),1,"Exact-power graveyard summon omitted a second matching 100-power Insect");
  assert.equal(await page.locator('#effectDeckPicker button[data-card-id="grave-power-200"]').count(),0,"Exact-power graveyard summon incorrectly offered a 200-power Insect");
  await page.locator('#effectDeckPicker button[data-card-id="grave-power-100-a"]').click();
  await page.locator('#effectDeckPicker button[data-card-id="grave-power-100-b"]').click();
  await page.locator("#effectDeckPicker button").filter({hasText:"選択したカードを場に出す"}).click();
  const exactPowerGraveSummon=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(exactPowerGraveSummon.players[1].zones.monsters.some(c=>c.id==="grave-power-100-a"),true,"Exact-power graveyard summon did not move the first selected Insect to the field");
  assert.equal(exactPowerGraveSummon.players[1].zones.monsters.some(c=>c.id==="grave-power-100-b"),true,"Exact-power graveyard summon did not move the second selected Insect to the field");
  assert.equal(exactPowerGraveSummon.players[1].zones.discard.some(c=>c.id==="grave-power-200"),true,"Exact-power graveyard summon moved a non-matching Insect out of discard");

  const oneKnightToken=await page.evaluate(()=>{const api=window.__ANKR_TEST__;api.reset();api.runEffect("騎士・トークン (1/300/ヒト,騎士) 1体を出す。",1);return api.snapshot()});
  const oneToken=oneKnightToken.players[1].zones.monsters;
  assert.equal(oneToken.length,1,"Knight token summon did not create one monster");
  assert.equal(oneToken[0].name,"騎士・トークン","created token has the wrong name");
  assert.equal(oneToken[0].power,300,"created token did not use its printed 300 power");

  const threeKnightTokens=await page.evaluate(()=>{const api=window.__ANKR_TEST__;api.reset();api.runEffect("騎士・トークン (1/300/ヒト,騎士) 3体を出す。",1);return api.snapshot()});
  const threeTokens=threeKnightTokens.players[1].zones.monsters;
  assert.equal(threeTokens.length,3,"Three Swords Will did not create three Knight tokens");
  assert.equal(new Set(threeTokens.map(c=>c.id)).size,3,"Knight token IDs are not unique");
  assert.equal(threeTokens.every(c=>c.power===300),true,"one or more Knight tokens have the wrong power");

  const cappedKnightTokens=await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();for(let i=0;i<6;i++)api.addCard(monsterName,1,"monsters","token-cap-"+i);api.runEffect("騎士・トークン (1/300/ヒト,騎士) 3体を出す。",1);return api.snapshot()},{monsterName:fixtureCards.monster.name});
  assert.equal(cappedKnightTokens.players[1].zones.monsters.length,7,"Knight token generation exceeded the seven-monster zone limit");
  assert.equal(cappedKnightTokens.players[1].zones.monsters.filter(c=>c.name==="騎士・トークン").length,1,"Knight token generation did not stop at the available zone capacity");

  const upToKnightTokens=await page.evaluate(()=>{const api=window.__ANKR_TEST__,originalPrompt=window.prompt;api.reset();window.prompt=()=> "4";try{api.runEffect("騎士・トークン (1/300/ヒト,騎士) 10体までを出す。",1)}finally{window.prompt=originalPrompt}return api.snapshot()});
  assert.equal(upToKnightTokens.players[1].zones.monsters.filter(c=>c.name==="騎士・トークン").length,4,"Start of War did not honor the selected token count");

  const cappedUpToKnightTokens=await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__,originalPrompt=window.prompt;api.reset();for(let i=0;i<6;i++)api.addCard(monsterName,1,"monsters","token-up-to-cap-"+i);window.prompt=()=> "1";try{api.runEffect("騎士・トークン (1/300/ヒト,騎士) 10体までを出す。",1)}finally{window.prompt=originalPrompt}return api.snapshot()},{monsterName:fixtureCards.monster.name});
  assert.equal(cappedUpToKnightTokens.players[1].zones.monsters.length,7,"up-to token generation exceeded the monster zone limit");

  const strongAssault=await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("強襲",1,"hand","strong-assault-source");api.addCard(monsterName,2,"monsters","strong-assault-target");api.setCardPower("strong-assault-target",2,1000);api.runEffect("騎士・トークン (1/300/ヒト,騎士) 1体を出す。相手のモンスター1体に700ダメージ。",1,"strong-assault-source");return api.snapshot()},{monsterName:fixtureCards.monster.name});
  assert.equal(strongAssault.players[1].zones.monsters.some(c=>c.name==="騎士・トークン"),true,"Strong Assault did not create its Knight token before resolving its damage effect");
  assert.equal(strongAssault.pendingTarget?.kind,"monsterDamage","Strong Assault did not request an explicit opponent monster target");
  await page.locator('.card[data-card-id="strong-assault-target"]').click();
  const afterStrongAssault=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(afterStrongAssault.players[2].zones.monsters.find(c=>c.id==="strong-assault-target")?.damage,700,"Strong Assault did not damage the selected opponent monster");

  const remoteKnightToken=await page.evaluate(()=>{const api=window.__ANKR_TEST__;api.reset();api.setOnlineTestMode();return api.applyPublicStateForTest("player2",{life:4000,handCount:0,deckCount:0,deckCounters:0,deckHorizontal:false,facedownCount:0,monsters:[{id:"remote-knight-token",name:"騎士・トークン",faceUp:true,revealed:false,tapped:false,counters:0,damage:0,modification:0}],energy:[],field:[],discard:[],pendingDiscard:false,gameOver:null})});
  assert.equal(remoteKnightToken.players[2].zones.monsters[0]?.name,"騎士・トークン","sanitized opponent public state lost the Knight token name");
  assert.equal(remoteKnightToken.players[2].zones.monsters[0]?.power,300,"remote client did not reconstruct the Knight token's printed power from its shared definition");

  const remoteSync=await page.evaluate(({monsterName,energyName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"monsters","sync-return");api.applyEffectDeltaForTest({playerId:"remote",target:"opponentMonsterReturnToHand",cardId:"sync-return"});api.addCard(monsterName,1,"monsters","sync-bottom");api.applyEffectDeltaForTest({playerId:"remote",target:"opponentMonsterBottomDeck",cardId:"sync-bottom"});api.addCard(monsterName,1,"monsters","sync-discard");api.applyEffectDeltaForTest({playerId:"remote",target:"opponentMonsterDiscard",cardId:"sync-discard"});api.addCard(monsterName,1,"monsters","sync-counter");api.applyEffectDeltaForTest({playerId:"remote",target:"opponentMonsterCounter",cardId:"sync-counter",delta:1});api.addCard(monsterName,1,"monsters","sync-modifier");api.applyEffectDeltaForTest({playerId:"remote",target:"opponentMonsterModifier",cardId:"sync-modifier",delta:-100});api.addCard(energyName,1,"energy","sync-energy");api.applyEffectDeltaForTest({playerId:"remote",target:"opponentCardDestroy",cardId:"sync-energy"});api.addCard(monsterName,2,"monsters","sync-own-destroy");api.applyEffectDeltaForTest({playerId:"remote",target:"ownMonsterDestroy",cardId:"sync-own-destroy"});return api.snapshot()},{monsterName:fixtureCards.monster.name,energyName:fixtureCards.energy.name});
  assert.equal(remoteSync.players[1].zones.hand.some(c=>c.id==="sync-return"),true,"remote return-to-hand effect delta was not applied");
  assert.equal(remoteSync.players[1].zones.deck.some(c=>c.id==="sync-bottom"),true,"remote bottom-deck effect delta was not applied");
  assert.equal(remoteSync.players[1].zones.discard.some(c=>c.id==="sync-discard"),true,"remote discard effect delta was not applied");
  assert.equal(remoteSync.players[1].zones.monsters.find(c=>c.id==="sync-counter")?.counters,1,"remote counter effect delta was not applied");
  assert.equal(remoteSync.players[1].zones.monsters.find(c=>c.id==="sync-modifier")?.modification,-100,"remote modifier effect delta was not applied");
  assert.equal(remoteSync.players[1].zones.discard.some(c=>c.id==="sync-energy"),true,"remote card destruction effect delta was not applied");
  assert.equal(remoteSync.players[2].zones.discard.some(c=>c.id==="sync-own-destroy"),true,"remote own-monster destruction effect delta was not applied");

  const remoteDiscardToDeck=await page.evaluate(({monsterName})=>{const api=window.__ANKR_TEST__;api.reset();api.addCard(monsterName,1,"discard","sync-discard-to-deck-a");api.addCard(monsterName,1,"discard","sync-discard-to-deck-b");api.applyEffectDeltaForTest({playerId:"remote",target:"opponentDiscardToDeck"});return api.snapshot()},{monsterName:fixtureCards.monster.name});
  assert.equal(remoteDiscardToDeck.players[1].zones.deck.some(c=>c.id==="sync-discard-to-deck-a")&&remoteDiscardToDeck.players[1].zones.deck.some(c=>c.id==="sync-discard-to-deck-b"),true,"remote opponent-discard-to-deck effect delta did not move every discard card into the deck");
  assert.equal(remoteDiscardToDeck.players[1].zones.discard.length,0,"remote opponent-discard-to-deck effect delta left cards in discard");

  await page.evaluate(({monsterName,originalText})=>{window.__ANKR_TEST__.setCardEffectText(monsterName,originalText);},{monsterName:fixtureCards.monster.name,originalText:fixtureCards.monster.effect_text||""});

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


  await page.evaluate(()=>{const api=window.__ANKR_TEST__;api.reset();api.addCard("ドラゴンヘッド",1,"monsters","dragon-head");api.addCard("火花",1,"deck","spark-use");api.setEnergyPool(1,0);api.trigger("dragon-head",1,"enter")});
  assert.equal(await page.locator("#effectDeckPicker").isVisible().catch(()=>false),true,"Dragon Head did not open a picker for a spell in the deck");
  await page.locator('#effectDeckPicker button[data-card-id="spark-use"]').click();
  await page.locator("#effectDeckPicker button").filter({hasText:"選択したカードを使用する"}).click();
  const freeUse=await page.evaluate(()=>window.__ANKR_TEST__.snapshot());
  assert.equal(freeUse.players[1].zones.discard.some(c=>c.id==="spark-use"),true,"The selected spell was not used from the deck");
  assert.equal(freeUse.players[2].life,3700,"The spell used from the deck did not resolve");
  assert.equal(freeUse.players[1].energyPool,0,"A card used by an effect incorrectly paid its normal energy cost");

   const attackedTrigger=await page.evaluate(({monsterName,drawName,originalText})=>{
    const api=window.__ANKR_TEST__;api.reset();
    api.setCardEffectText(monsterName,"攻撃された時、自分は1枚引く。");
    api.addCard(monsterName,1,"monsters","attacked-trigger-attacker");
    api.addCard(monsterName,2,"monsters","attacked-trigger-defender");
    api.addCard(drawName,2,"deck","attacked-trigger-draw");
    const result=api.attack("attacked-trigger-attacker","attacked-trigger-defender");
    api.setCardEffectText(monsterName,originalText);
    return result.players[2].zones.hand.length;
   },{monsterName:fixtureCards.monster.name,drawName:fixtureCards.energy.name,originalText:fixtureCards.monster.effect_text||""});
   assert.equal(attackedTrigger,1,"A defending monster's attacked trigger did not resolve when attacked");

  const results=await page.evaluate(({cases,fixture})=>window.__ANKR_TEST__.auditBatch(cases,fixture),{cases,fixture});
  const counts={},auditClassCounts={};for(const result of results){counts[result.status]=(counts[result.status]||0)+1;auditClassCounts[result.auditClass]=(auditClassCounts[result.auditClass]||0)+1}
  const errors=results.filter(r=>r.status==="runtime_error");
  const unimplementedCandidates=results.filter(r=>r.auditClass==="unimplemented_candidate");
   const report={generatedAt:new Date().toISOString(),cardCount:cardsData.cards.length,clauseCount:cases.length,smoke,counts,auditClassCounts,unimplementedCandidateCount:unimplementedCandidates.length,runtimeErrorCount:errors.length,results};
  const out=process.argv[2]?path.resolve(process.argv[2]):path.join(root,"effect-live-audit-report.json");
  fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({cardCount:report.cardCount,clauseCount:report.clauseCount,smoke,counts,runtimeErrorCount:errors.length,runtimeErrors:errors.map(r=>({cardId:r.cardId,cardName:r.cardName,clauseIndex:r.clauseIndex,text:r.text,error:r.error?.message})),auditClassCounts,unimplementedCandidateCount:unimplementedCandidates.length,unimplementedExamples:unimplementedCandidates.slice(0,20).map(r=>({cardId:r.cardId,cardName:r.cardName,clauseIndex:r.clauseIndex,text:r.text})),report:out},null,2));
  assert.equal(results.find(r=>r.cardName==="苔木蜘蛛"&&r.clauseIndex===0)?.auditClass,"trigger_selection_requested","A triggered deck-search effect should be classified as a trigger that requests player selection, not as an unimplemented effect");
   assert.equal(results.find(r=>r.cardName==="碧い花"&&r.clauseIndex===1)?.auditClass,"activation_entry_not_exercised","Costed abilities must be separated from direct effect-text execution");
   assert.equal(results.find(r=>r.cardName==="竹の魔物"&&r.text.includes("何枚でも"))?.auditClass,"deckbuilding_rule","Deckbuilding rules must not be counted as unimplemented effects");
   assert.equal(results.find(r=>r.cardName==="氷壁"&&r.clauseIndex===0)?.auditClass,"trigger_not_exercised","Bracketed trap timing must be classified as a trigger, not an unsupported immediate effect");
   assert.equal(results.find(r=>r.cardName==="マントゴブリン"&&r.text.includes("場に出たターンでも"))?.auditClass,"passive_or_continuous_rule","Haste permissions must not be counted as unimplemented immediate effects");
   assert.equal(results.find(r=>r.cardName==="竜討毒の鳥"&&r.text.startsWith("①"))?.auditClass,"activation_entry_not_exercised","Circled-number abilities must be classified as activation-entry effects");
   assert.equal(results.find(r=>r.cardName==="誤射"&&r.clauseIndex===2)?.status,"needs_choice","A cancelled target prompt must not be reported as an unimplemented effect");
   assert.equal(results.find(r=>r.cardName==="誤射"&&r.clauseIndex===0)?.auditClass,"explanatory_fragment","Explanatory text backed by an operational parenthetical must not be counted as an independent effect");
   assert.equal(results.find(r=>r.cardName==="ボルケーノエネルギー"&&r.clauseIndex===0)?.auditClass,"deckbuilding_rule","Alternate spelling of the deckbuilding rule must be recognized");
   assert.equal(results.find(r=>r.cardName==="古びた駆動部品"&&r.clauseIndex===0)?.auditClass,"fixture_may_lack_filtered_target","Tag-filtered targets absent from the generic fixture must be reported as unverified");
   const spiderEyeSearch=results.find(r=>r.cardName==="蜘蛛の目"&&r.text.includes("秘密裏に伏せる"));
   assert.equal(spiderEyeSearch?.status,"needs_card_selection","Spider's Eye must request a trap selection when a trap exists in the fixture deck");
   assert.notEqual(spiderEyeSearch?.auditClass,"unimplemented_candidate","Spider's Eye's selection effect must not be mislabeled as unimplemented");
   const superExplosion=results.find(r=>r.cardName==="超爆発"&&r.text.includes("モンスターと罠とフィールド全てを破壊する"));
   assert.notEqual(superExplosion?.auditClass,"unimplemented_candidate","Super Explosion should not remain an unimplemented candidate after its board-wipe regression");
   assert.equal(errors.length,0,"actual game effect resolver threw during card audit; see report");
 }catch(error){console.error(error);process.exitCode=1}
 finally{if(browser)await browser.close();server.close()}
})();
