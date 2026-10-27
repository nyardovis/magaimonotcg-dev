/* Declarative effect compiler for the development build.
 * Converts Japanese card text into a small, inspectable intermediate representation.
 * Execution remains in game.js until each action family has migrated and passed tests.
 */
(function(root){
  "use strict";
  const TRIGGERS = [
    ["opponentStart",["相手のターンの開始時","相手のターン開始時"]],
    ["opponentEnd",["相手のターンの終了時","相手のターン終了時"]],
    ["start",["自分のターンの開始時","自分のターン開始時"]],
    ["end",["自分のターンの終了時","自分のターン終了時"]],
    ["enter",["場に出た時","場に出たとき","場に出した時","場に出したとき"]],
    ["destroy",["破壊された時","破壊されたとき","破壊時"]],
    ["attack",["攻撃した時","攻撃したとき","攻撃時"]],
    ["attacked",["攻撃された時","攻撃されたとき","攻撃を受けた時","攻撃を受けたとき"]]
  ];
  const ACTIONS = [
    ["draw",/(?:カードを)?(?:\d+|[^。]{1,32})枚引く|カードを引く/],
    ["heal",/(?:自分|相手|お互い)?(?:のライフを)?(?:\d+|[^。]{1,32})回復|回復する/],
    ["damage",/(?:\d+|[^。]{1,40})ダメージ/],
    ["destroy",/(?:破壊する|破壊することができる|破壊してもよい|破壊される)/],
    ["moveToHand",/(?:手札に加える|手札に戻す)/],
    ["summon",/(?:場に出す|場に出してもよい|召喚する|を出す)/],
    ["tap",/(?:タップする|タップさせる|タップ状態にする)/],
    ["counter",/カウンター.{0,24}(?:乗せる|置く|個|0にする|取り除く)/],
    ["energy",/(?:エネルギー|マナ).{0,40}(?:置く|増やす|減らす|加える|使用できる)/],
    ["modifyPower",/(?:攻撃力|パワー|これを).{0,45}(?:\+|＋|−|-|上げる|下げる|にする)/],
    ["reveal",/(?:公開する|見せる|公開してもよい)/],
    ["discard",/(?:捨てる|捨て札に置く|捨て札へ送る)/],
    ["preventAttack",/(?:攻撃できない|攻撃できなくする|攻撃できる|攻撃されない|これにしか攻撃できない)/],
    ["search",/(?:デッキ|捨て札|手札).{0,50}(?:探し|選び|選んで|検索|加える)/],
    ["playCard",/(?:カード|魔法|罠).{0,30}(?:使用する|発動する)/],
    ["disableEffect",/(?:効果|発動).{0,30}(?:発動しない|無効|使用できない|使えない)/],
    ["preventDamage",/(?:ダメージを受けない|受けるダメージ.{0,12}(?:減|\-)|ダメージ.{0,12}軽減)/],
    ["restriction",/(?:使用できず|使用できない|場に出せない|選ぶことができない|対象にならない)/],
    ["passive",/(?:攻撃されない|ダメージ.{0,20}(?:受けない|減らす)|相手の.{0,20}できない)/]
  ];
  const COST = /^\s*[（(]\s*(\d+|これをタップ|これを破壊|カウンター\s*\d+|手札から\d+枚捨てる)\s*[）)]\s*/;
  function detectTrigger(text){
    for(const [type,phrases] of TRIGGERS) if(phrases.some(p=>text.includes(p))) return type;
    return null;
  }
  function detectActions(text){
    const found=[];
    for(const [type,pattern] of ACTIONS) if(pattern.test(text)) found.push(type);
    return found;
  }
  function parseClause(raw,index){
    let text=String(raw||"").trim();
    const costMatch=text.match(COST);
    const costToken=costMatch?costMatch[1].replace(/\s+/g,""):null;
    if(costMatch) text=text.slice(costMatch[0].length).trim();
    const trigger=detectTrigger(text);
    const conditionMatch=text.match(/(?:なら|場合|時に|ときに)(.*)$/);
    const condition=conditionMatch?text.slice(0,conditionMatch.index+conditionMatch[0].length-conditionMatch[1].length).trim():null;
    const actions=detectActions(text);
    const target=text.match(/(自分|相手|お互い)の(モンスター|魔法|罠|フィールド|エネルギー|手札|捨て札|デッキ|ライフ)/);
    return {
      index,raw:String(raw||"").trim(),text,trigger,
      cost:costToken?{raw:costToken,kind:/^\d+$/.test(costToken)?"energy":costToken==="これをタップ"?"tap":costToken==="これを破壊"?"destroy":costToken.startsWith("カウンター")?"counter":costToken.startsWith("手札から")?"discard":"unknown",amount:(costToken.match(/\d+/)||[])[0]?Number(costToken.match(/\d+/)[0]):null}:null,
      condition, target:target?{owner:target[1],zone:target[2]}:null,
      actions,recognized:actions.length>0,
      confidence:actions.length===1?"pattern":actions.length>1?"ambiguous":"unrecognized"
    };
  }
  function compile(text){
    return String(text||"").split(/[。；;]/).map((part,index)=>({part:part.trim(),index})).filter(x=>x.part).map(x=>parseClause(x.part,x.index));
  }
  function summarize(text){
    const clauses=compile(text);
    return {clauseCount:clauses.length,recognizedCount:clauses.filter(x=>x.recognized).length,unrecognizedCount:clauses.filter(x=>!x.recognized).length,ambiguousCount:clauses.filter(x=>x.confidence==="ambiguous").length,clauses};
  }
  function selfTest(){
    const cases=[
      {text:"場に出た時、カードを2枚引く。",trigger:"enter",action:"draw"},
      {text:"攻撃時、相手に300ダメージ。",trigger:"attack",action:"damage"},
      {text:"自分のデッキから魔法1枚までを手札に加える。",trigger:null,action:"moveToHand"},
      {text:"相手のモンスターはこれにしか攻撃できない。",trigger:null,action:"preventAttack"}
    ];
    const failures=[];
    for(const item of cases){
      const clause=compile(item.text)[0];
      if(!clause||clause.trigger!==item.trigger||!clause.actions.includes(item.action))failures.push({text:item.text,expected:item,actual:clause||null});
    }
    return {passed:cases.length-failures.length,total:cases.length,failures};
  }
  root.CardEffectRuntime=Object.freeze({compile,parseClause,summarize,selfTest,actions:ACTIONS.map(x=>x[0]),triggers:TRIGGERS.map(x=>x[0])});
})(globalThis);
