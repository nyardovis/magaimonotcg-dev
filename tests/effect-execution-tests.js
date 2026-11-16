#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const {resolve}=require("./effect-simulator");
let passed=0;
function test(name,fn){try{fn();passed++;console.log("PASS "+name)}catch(e){console.error("FAIL "+name+"\n"+e.stack);process.exitCode=1}}
function board(){return {deck:["A","B","C"],hand:[],discard:[],monsters:[{id:"m1",damage:0}],energy:[],life:{self:4000,opponent:4000},sourcePower:250};}
test("draw mutates hand and deck",()=>{const s=board();resolve("カードを2枚引く。",s);assert.deepEqual(s.hand,["A","B"]);assert.deepEqual(s.deck,["C"])});
test("damage applies to selected monster",()=>{const s=board();const r=resolve("相手のモンスター1体に300ダメージ。",s,{targetId:"m1"});assert.equal(r.status,"resolved");assert.equal(s.monsters[0].damage,300)});
test("damage refuses to guess a target",()=>{const s=board();const r=resolve("相手のモンスター1体に300ダメージ。",s);assert.equal(r.status,"needs_target");assert.equal(s.monsters[0].damage,0)});
test("heal updates life",()=>{const s=board();resolve("自分のライフを500回復する。",s);assert.equal(s.life.self,4500)});
test("deck search requires explicit selected index",()=>{const s=board();const r=resolve("自分のデッキから魔法1枚を手札に加える。",s);assert.equal(r.status,"needs_selection");assert.deepEqual(s.hand,[])});
test("deck search moves the selected card only",()=>{const s=board();resolve("自分のデッキから魔法1枚を手札に加える。",s,{index:1});assert.deepEqual(s.hand,["B"]);assert.deepEqual(s.deck,["A","C"])});
test("destroy removes selected monster to discard",()=>{const s=board();resolve("相手のモンスター1体を破壊する。",s,{targetId:"m1"});assert.equal(s.monsters.length,0);assert.equal(s.discard[0].id,"m1")});
console.log("\n"+passed+" execution tests passed");
