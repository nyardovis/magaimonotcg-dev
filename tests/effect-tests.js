#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const context={console};context.globalThis=context;vm.createContext(context);
for(const file of ["js/effect-engine.js","js/effect-runtime.js"])vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
const engine=context.CardEffectEngine,runtime=context.CardEffectRuntime;
let passed=0;
function test(name,fn){try{fn();passed++;console.log("PASS "+name)}catch(error){console.error("FAIL "+name+"\n"+error.stack);process.exitCode=1}}
test("runtime built-in self tests",()=>{const result=runtime.selfTest();assert.equal(result.failures.length,0,JSON.stringify(result.failures));assert.equal(result.passed,result.total)});
test("Japanese sentence splitting respects quoted punctuation",()=>{const parts=engine.splitAbilities("「海底調査。深海」1枚を手札に加える。カードを1枚引く。");assert.equal(parts.length,2)});
test("activation energy cost is parsed",()=>{const a=engine.activatedAbilities("(2) 相手に300ダメージ。");assert.equal(a.length,1);assert.equal(a[0].costKind,"energy");assert.equal(a[0].costValue,2)});
test("tap activation cost is parsed",()=>{const a=engine.activatedAbilities("(これをタップ) 相手に300ダメージ。");assert.equal(a[0].costKind,"tap")});
test("player-selected deck search is identified",()=>{const c=runtime.compile("自分のデッキから魔法1枚までを手札に加える。")[0];assert.equal(c.actions.includes("moveToHand"),true);assert.equal(c.target.selection,"player");assert.equal(c.target.zone,"デッキ")});
test("randomized effects are distinguished from player choice",()=>{const c=runtime.compile("以下からランダムに1つ行う。")[0];assert.equal(c.target?.selection==="random"||c.actions.length===0,true)});
test("damage action is classified",()=>{const c=runtime.compile("相手のモンスター1体に300ダメージ。")[0];assert.equal(c.actions.includes("damage"),true);assert.equal(c.target.owner,"相手");assert.equal(c.target.zone,"モンスター")});
test("summon and energy placement actions are classified",()=>{const c=runtime.compile("自分のデッキからエネルギー1枚までをタップして出す。")[0];assert.equal(c.actions.includes("energyToBoard"),true)});
test("all 737 card records have matching stored ability splits",()=>{const data=JSON.parse(fs.readFileSync(path.join(root,"data/cards.json"),"utf8"));assert.equal(data.cards.length,data.record_count);const mismatches=[];for(const card of data.cards){const parsed=engine.splitAbilities(card.effect_text||"").map(x=>x.raw);if(JSON.stringify(parsed)!==JSON.stringify(card.abilities||[]))mismatches.push(card.id+":"+card.name)}assert.deepEqual(mismatches,[])});
test("all non-empty effects compile without throwing",()=>{const data=JSON.parse(fs.readFileSync(path.join(root,"data/cards.json"),"utf8"));for(const card of data.cards)runtime.compile(card.effect_text||"")});
console.log("\n"+passed+" tests passed");
