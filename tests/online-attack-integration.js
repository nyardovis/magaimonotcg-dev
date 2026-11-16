#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");

const base=String(process.env.ANKR_DEV_WORKER_WS||"").replace(/\/$/,"");
if(!base){
  console.log("SKIP online attack protocol integration (ANKR_DEV_WORKER_WS is not set)");
  process.exit(0);
}
if(typeof WebSocket!=="function")throw new Error("Node.js WebSocket client is unavailable");

function client(session,room){
  const ws=new WebSocket(base+"/room/"+encodeURIComponent(room)+"?session="+encodeURIComponent(session));
  const queue=[],waiters=[];
  ws.addEventListener("message",event=>{
    let message;try{message=JSON.parse(String(event.data))}catch{return}
    const index=waiters.findIndex(waiter=>waiter.predicate(message));
    if(index>=0){const waiter=waiters.splice(index,1)[0];clearTimeout(waiter.timer);waiter.resolve(message)}
    else queue.push(message);
  });
  const ready=new Promise((resolve,reject)=>{
    ws.addEventListener("open",resolve,{once:true});
    ws.addEventListener("error",reject,{once:true});
  });
  function waitFor(predicate,label){
    const index=queue.findIndex(predicate);if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);
    return new Promise((resolve,reject)=>{
      const waiter={predicate,resolve,reject,timer:null};
      waiter.timer=setTimeout(()=>{const i=waiters.indexOf(waiter);if(i>=0)waiters.splice(i,1);reject(new Error("Timed out waiting for "+label))},10000);
      waiters.push(waiter);
    });
  }
  return {ws,ready,waitFor};
}
const operation=message=>JSON.stringify({type:"operation",...message});
const isAction=(action)=>message=>message.type==="operation"&&message.action===action;
async function main(){
  const room="ci-attack-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);
  const first=client("ci-session-a-"+room,room),second=client("ci-session-b-"+room,room);
  try{
    await first.ready;
    const firstJoined=await first.waitFor(message=>message.type==="joined","first player join");
    await second.ready;
    const secondJoined=await second.waitFor(message=>message.type==="joined","second player join");
    await first.waitFor(message=>message.type==="player_joined","opponent join");
    assert.equal(firstJoined.playerId,"player1");
    assert.equal(secondJoined.playerId,"player2");

    const attackId="ci-attack-one";
    const firstAttack=first.waitFor(isAction("attack_declared"),"attack declaration at attacker");
    const secondAttack=second.waitFor(isAction("attack_declared"),"attack declaration at defender");
    first.ws.send(operation({action:"attack_declared",attackId,cardId:"ci-attacker",targetCardId:null}));
    const [firstDeclaration,secondDeclaration]=await Promise.all([firstAttack,secondAttack]);
    assert.equal(firstDeclaration.attackId,attackId);
    assert.equal(secondDeclaration.playerId,"player1");

    const invalidResponse=first.waitFor(message=>message.type==="error"&&message.message==="Unexpected attack response","reject attacker response");
    first.ws.send(operation({action:"attack_response",attackId,damageOverride:0}));
    await invalidResponse;

    const blockedTurnEnd=first.waitFor(message=>message.type==="error"&&String(message.message).includes("Wait for the attack response"),"block turn end while attack pending");
    first.ws.send(operation({action:"end_turn"}));
    await blockedTurnEnd;

    const firstResolved=first.waitFor(isAction("attack_response"),"defender response at attacker");
    second.ws.send(operation({action:"attack_response",attackId,damageOverride:0}));
    const resolved=await firstResolved;
    assert.equal(resolved.playerId,"player2");
    assert.equal(resolved.damageOverride,0);

    const firstTurnChange=first.waitFor(message=>message.type==="turn_changed","turn change at first player");
    const secondTurnChange=second.waitFor(message=>message.type==="turn_changed","turn change at second player");
    first.ws.send(operation({action:"end_turn"}));
    await Promise.all([firstTurnChange,secondTurnChange]);

    const secondAttackId="ci-attack-two";
    const secondAttackAtFirst=first.waitFor(isAction("attack_declared"),"second player attack at defender");
    const secondAttackAtSecond=second.waitFor(isAction("attack_declared"),"second player attack at attacker");
    second.ws.send(operation({action:"attack_declared",attackId:secondAttackId,cardId:"ci-attacker-two",targetCardId:"ci-target"}));
    await Promise.all([secondAttackAtFirst,secondAttackAtSecond]);
    const secondResolved=second.waitFor(isAction("attack_response"),"second player receives defender response");
    first.ws.send(operation({action:"attack_response",attackId:secondAttackId,damageOverride:null}));
    const resolvedSecond=await secondResolved;
    assert.equal(resolvedSecond.playerId,"player1");
    assert.equal(resolvedSecond.damageOverride,null);
    console.log("PASS live development Worker attack declaration, defender-only response, pending-turn lock, and both player directions");
  }finally{
    try{first.ws.close()}catch{}
    try{second.ws.close()}catch{}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
