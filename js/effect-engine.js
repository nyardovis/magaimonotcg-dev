/* Card effect text parser for the development build only. */
(function (root) {
  "use strict";
  const TRIGGERS = {
    enter:["場に出た時","場に出たとき","場に出した時","場に出したとき"],
    start:["自分のターン開始時","自分のターンの開始時","自分のターンの始め"],
    end:["自分のターン終了時","自分のターンの終了時","自分のターンの終わり"],
    opponentStart:["相手のターン開始時","相手のターンの開始時"],
    opponentEnd:["相手のターン終了時","相手のターンの終了時"],
    destroy:["破壊時","破壊された時","破壊されたとき"],
    attack:["攻撃時","攻撃した時","攻撃したとき"],
    attacked:["攻撃された時","攻撃されたとき","攻撃を受けた時","攻撃を受けたとき"],
    allyEnter:["自分の他の","自分のモンスターが場に出た時","自分のモンスターが場に出たとき","自分のカードが場に出た時"],
    opponentEnter:["相手のモンスターが場に出た時","相手のモンスターが場に出たとき","相手のカードが場に出た時"],
    cardUse:["自分のカードの使用時","自分のカードを使用した時","カードの使用時","カードを使用した時"],
    opponentCardUse:["相手のカードの使用時","相手のカードを使用した時"],
    opponentHeal:["相手が回復した時","相手が回復したとき"],
    ownDamaged:["自分がダメージを受けた時","自分がダメージを受けたとき"],
    opponentDamaged:["相手がダメージを受けた時","相手がダメージを受けたとき"],
    anyDestroy:["モンスターの破壊時","モンスターが破壊された時","モンスターが破壊されたとき"]
  };
  function splitAbilities(text) {
    const source=String(text||"");
    if(!source.trim())return [];
    return source.split("。").map((part,index,all)=>(part.trim()?part.trim()+(index<all.length-1?"。":""):"")).filter(Boolean).map((raw,index)=>{
      const costMatch=raw.match(/^\s*[（(]\s*(\d+|これをタップ|これを破壊|カウンター\s*\d+|手札から\d+枚捨てる)\s*[）)]\s*/);
      const costToken=costMatch?costMatch[1].replace(/\s+/g,""):null;
      const body=costMatch?raw.slice(costMatch[0].length).trim():raw.trim();
      let trigger=null;
      const entries=Object.entries(TRIGGERS).sort((a,b)=>Math.max(...b[1].map(x=>x.length))-Math.max(...a[1].map(x=>x.length)));
      for(const [name,phrases] of entries){if(phrases.some(phrase=>body.includes(phrase))){trigger=name;break}}
      let costKind=null,costValue=null,energyCost=null;
      if(costToken!==null){
        if(/^\d+$/.test(costToken)){costKind="energy";costValue=Number(costToken);energyCost=Number(costToken)}
        else if(costToken==="これをタップ")costKind="tap";
        else if(costToken==="これを破壊")costKind="destroy";
        else if(costToken.startsWith("カウンター")){costKind="counter";costValue=Number(costToken.match(/\d+/)?.[0]||0)}
        else if(costToken.startsWith("手札から")){costKind="discard";costValue=Number(costToken.match(/\d+/)?.[0]||1)}
      }
      return {index,raw,body,cost:energyCost,costToken,costKind,costValue,isActivated:costMatch!==null,trigger};
    });
  }
  function forTrigger(text,trigger){return splitAbilities(text).filter(a=>a.trigger===trigger&&!a.isActivated)}
  function immediateAbilities(text){return splitAbilities(text).filter(a=>!a.isActivated&&a.trigger===null)}
  function activatedAbilities(text){return splitAbilities(text).filter(a=>a.isActivated&&a.trigger===null)}
  root.CardEffectEngine=Object.freeze({splitAbilities,forTrigger,immediateAbilities,activatedAbilities,triggers:TRIGGERS});
})(globalThis);
