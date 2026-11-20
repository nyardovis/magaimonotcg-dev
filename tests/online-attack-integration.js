#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");

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
const isAction=action=>message=>message.type==="operation"&&message.action===action;
async function main(){
  const room="ci-attack-"+randomUUID();
  const first=client("ci-session-a-"+room,room),second=client("ci-session-b-"+room,room);
  try{
    await first.ready;
    const firstJoined=await first.waitFor(message=>message.type==="joined","first player join");
    await second.ready;
    const secondJoined=await second.waitFor(message=>message.type==="joined","second player join");
    assert.notEqual(firstJoined.playerId,secondJoined.playerId,"two sessions were assigned the same player seat");
    assert.deepEqual(new Set([firstJoined.playerId,secondJoined.playerId]),new Set(["player1","player2"]));
    assert.equal(firstJoined.turnPlayer,secondJoined.turnPlayer,"both clients received different active-turn owners");

    const knightTokenStateAtOpponent=second.waitFor(message=>message.type==="public_state"&&message.playerId===firstJoined.playerId&&Array.isArray(message.state?.monsters)&&message.state.monsters.some(card=>card.id==="ci-knight-token"),"Knight token public-state relay");
    first.ws.send(operation({action:"sync_public_state",state:{
      life:4000,handCount:0,deckCount:0,deckCounters:0,deckHorizontal:false,facedownCount:0,
      revealedHand:[],facedownPublic:[],
      monsters:[{id:"ci-knight-token",name:"騎士・トークン",power:999,faceUp:true}],
      energy:[],field:[],discard:[],pendingDiscard:false,gameOver:null
    }}));
    const relayedKnightState=await knightTokenStateAtOpponent;
    const relayedKnight=relayedKnightState.state.monsters.find(card=>card.id==="ci-knight-token");
    assert.equal(relayedKnight?.name,"騎士・トークン","Worker did not relay the Knight token's public name");
    assert.equal("power" in relayedKnight,false,"Worker relayed untrusted printed power instead of leaving card-definition reconstruction to the client");

    const discardToDeckDeltaAtOpponent=second.waitFor(message=>message.type==="operation"&&message.action==="effect_delta"&&message.target==="opponentDiscardToDeck"&&message.playerId===firstJoined.playerId,"opponent discard-to-deck effect delta relay");
    first.ws.send(operation({action:"effect_delta",target:"opponentDiscardToDeck"}));
    const relayedDiscardToDeckDelta=await discardToDeckDeltaAtOpponent;
    assert.equal(relayedDiscardToDeckDelta.target,"opponentDiscardToDeck","Worker changed the opponent discard-to-deck effect delta target");

    const player1Client=firstJoined.playerId==="player1"?first:second;
    const player2Client=firstJoined.playerId==="player2"?first:second;
    const firstAttacker=firstJoined.turnPlayer==="player1"?player1Client:player2Client;
    const firstDefender=firstAttacker===player1Client?player2Client:player1Client;
    const firstTurnOwner=firstJoined.turnPlayer;
    assert.ok(firstTurnOwner==="player1"||firstTurnOwner==="player2","Worker returned an invalid turn owner");

    const attackId="ci-attack-one";
    const firstAttackAtAttacker=firstAttacker.waitFor(isAction("attack_declared"),"attack declaration at attacker");
    const firstAttackAtDefender=firstDefender.waitFor(isAction("attack_declared"),"attack declaration at defender");
    firstAttacker.ws.send(operation({action:"attack_declared",attackId,cardId:"ci-attacker",targetCardId:null}));
    const [firstDeclaration,secondDeclaration]=await Promise.all([firstAttackAtAttacker,firstAttackAtDefender]);
    assert.equal(firstDeclaration.attackId,attackId);
    assert.equal(firstDeclaration.playerId,firstTurnOwner);
    assert.equal(secondDeclaration.playerId,firstTurnOwner);

    const invalidResponse=firstAttacker.waitFor(message=>message.type==="error"&&message.message==="Unexpected attack response","reject attacker response");
    firstAttacker.ws.send(operation({action:"attack_response",attackId,damageOverride:0}));
    await invalidResponse;

    const blockedTurnEnd=firstAttacker.waitFor(message=>message.type==="error"&&String(message.message).includes("Wait for the attack response"),"block turn end while attack pending");
    firstAttacker.ws.send(operation({action:"end_turn"}));
    await blockedTurnEnd;

    const firstResolved=firstAttacker.waitFor(isAction("attack_response"),"defender response at attacker");
    firstDefender.ws.send(operation({action:"attack_response",attackId,damageOverride:0}));
    const resolved=await firstResolved;
    assert.equal(resolved.playerId,firstDefender===player1Client?"player1":"player2");
    assert.equal(resolved.damageOverride,0);

    const firstTurnChange=firstAttacker.waitFor(message=>message.type==="turn_changed","turn change at first attacker");
    const secondTurnChange=firstDefender.waitFor(message=>message.type==="turn_changed","turn change at first defender");
    firstAttacker.ws.send(operation({action:"end_turn"}));
    const [turnAtAttacker,turnAtDefender]=await Promise.all([firstTurnChange,secondTurnChange]);
    assert.equal(turnAtAttacker.turnPlayer,firstTurnOwner==="player1"?"player2":"player1");
    assert.equal(turnAtDefender.turnPlayer,turnAtAttacker.turnPlayer);

    const secondAttacker=firstDefender,secondDefender=firstAttacker;
    const secondTurnOwner=turnAtAttacker.turnPlayer;
    const secondAttackId="ci-attack-two";
    const secondAttackAtDefender=secondDefender.waitFor(isAction("attack_declared"),"second player attack at defender");
    const secondAttackAtAttacker=secondAttacker.waitFor(isAction("attack_declared"),"second player attack at attacker");
    secondAttacker.ws.send(operation({action:"attack_declared",attackId:secondAttackId,cardId:"ci-attacker-two",targetCardId:"ci-target"}));
    const [secondDeclarationAtDefender,secondDeclarationAtAttacker]=await Promise.all([secondAttackAtDefender,secondAttackAtAttacker]);
    assert.equal(secondDeclarationAtDefender.playerId,secondTurnOwner);
    assert.equal(secondDeclarationAtAttacker.playerId,secondTurnOwner);

    const secondResolved=secondAttacker.waitFor(isAction("attack_response"),"second player receives defender response");
    secondDefender.ws.send(operation({action:"attack_response",attackId:secondAttackId,damageOverride:null}));
    const resolvedSecond=await secondResolved;
    assert.equal(resolvedSecond.playerId,secondDefender===player1Client?"player1":"player2");
    assert.equal(resolvedSecond.damageOverride,null);
    console.log("PASS live development Worker attack declaration, defender-only response, pending-turn lock, and both player directions");
  }finally{
    try{first.ws.close()}catch{}
    try{second.ws.close()}catch{}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
