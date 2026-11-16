/* Deterministic test-only effect resolver. This is not the live game executor. */
"use strict";
function resolve(text,state,choice){
  const context={CardEffectRuntime:null};
  context.globalThis=context;
  const vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../js/effect-runtime.js"),"utf8"),context);
  const clauses=context.CardEffectRuntime.compile(text);
  const results=[];
  for(const clause of clauses){
    const amount=clause.numeric?.kind==="constant"?clause.numeric.value:
      clause.numeric?.kind==="sourcePower"?(state.sourcePower||0):null;
    for(const action of clause.actions){
      if(action==="draw"){
        const n=amount??1; for(let i=0;i<n&&state.deck.length;i++)state.hand.push(state.deck.shift());
        results.push({action,count:n});
      }else if(action==="damage"){
        if(clause.target?.selection==="player"||clause.target?.zone==="ライフ"){
          const who=clause.target?.owner==="自分"?"self":"opponent";
          state.life[who]=Math.max(0,state.life[who]-(amount??0));
        }else{
          if(!choice?.targetId)return {status:"needs_target",action};
          const target=state.monsters.find(x=>x.id===choice.targetId);
          if(!target)return {status:"invalid_target",action};
          target.damage=(target.damage||0)+(amount??0);
        }
        results.push({action,amount});
      }else if(action==="heal"){
        const who=clause.target?.owner==="相手"?"opponent":"self";
        state.life[who]+=amount??0; results.push({action,amount});
      }else if(action==="moveToHand"){
        const zone=clause.target?.zone==="捨て札"?"discard":"deck";
        if(!choice||!Number.isInteger(choice.index))return {status:"needs_selection",action,zone};
        const source=state[zone]; if(choice.index<0||choice.index>=source.length)return {status:"invalid_selection",action,zone};
        state.hand.push(source.splice(choice.index,1)[0]); results.push({action,zone});
      }else if(action==="discard"){
        if(!choice||!Number.isInteger(choice.index))return {status:"needs_selection",action,zone:"hand"};
        if(choice.index<0||choice.index>=state.hand.length)return {status:"invalid_selection",action,zone:"hand"};
        state.discard.push(state.hand.splice(choice.index,1)[0]); results.push({action});
      }else if(action==="summon"||action==="energyToBoard"){
        const zone=action==="energyToBoard"?"energy":"monsters";
        if(!choice||!Number.isInteger(choice.index))return {status:"needs_selection",action,zone:"deck"};
        if(choice.index<0||choice.index>=state.deck.length)return {status:"invalid_selection",action,zone:"deck"};
        const card=state.deck.splice(choice.index,1)[0]; state[zone].push(card); results.push({action,card});
      }else if(action==="destroy"){
        if(!choice?.targetId)return {status:"needs_target",action};
        const i=state.monsters.findIndex(x=>x.id===choice.targetId);
        if(i<0)return {status:"invalid_target",action};
        state.discard.push(state.monsters.splice(i,1)[0]); results.push({action});
      }
    }
  }
  return {status:"resolved",results};
}
module.exports={resolve};
