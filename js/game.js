const SERVER_WS_BASE="wss://card-game-server-test.original-card-game-dev.workers.dev";
let currentRoom="";
let preparationCompleted=false;
let gameSocket=null;
let onlinePlayerId=null;
let roomPlayerCount=0;
let lastPublicState=null;
let hasReceivedOpponentPublicState=false;
let applyingPublicState=false;
let devLocalMode=false;
let devToolsOpenDuringMulligan=false;
let cardChoiceHiddenFor=null;
let pendingAttack=null;
let rematchStateResetPending=false;

function getPublicState(){
  const x=state.players[1];
  return {life:x.life,handCount:x.hand.length,handIds:x.hand.map(c=>c.id),deckCount:x.deck.length,deckCounters:x.deckCounters||0,deckHorizontal:!!x.deckHorizontal,facedownCount:x.facedown.length,revealedHand:x.hand.filter(c=>c.revealed).map(c=>({id:c.id,name:c.name,faceUp:true,revealed:true})),facedownPublic:x.facedown.filter(c=>c.faceUp!==false),monsters:x.monsters,energy:x.energy,field:x.field,discard:x.discard,pendingDiscard:state.pendingDiscardPlayer===1,gameOver:state.gameOver||null,energyPool:x.energyPool||0,mulliganCount:state.mulligan[1].count,mulliganDone:state.mulligan[1].done,phase:state.phase};
}
function sendPublicState(){
  if(devLocalMode||applyingPublicState||!onlinePlayerId||!gameSocket||gameSocket.readyState!==WebSocket.OPEN)return;
  const publicState=JSON.stringify(getPublicState());
  if(publicState===lastPublicState)return;
  lastPublicState=publicState;
  gameSocket.send(JSON.stringify({type:"operation",action:"sync_public_state",state:JSON.parse(publicState)}));
}
function applyPublicState(playerId,publicState){
  if(!onlinePlayerId||playerId===onlinePlayerId||!publicState)return;
  const opponentId=onlinePlayerId==="player1"?"player2":"player1";if(playerId!==opponentId)return;
  const x=state.players[2],hadOpponentPublicState=hasReceivedOpponentPublicState;
  const oldOpponentCardIds=new Set([...(x.monsters||[]),...(x.energy||[]),...(x.field||[]),...(x.discard||[])].map(c=>c.id));
  const oldOpponentMonsterIds=new Set((x.monsters||[]).map(c=>c.id));
  const previousOpponentMonsters=(state._previousOpponentMonsters||x.monsters||[]).map(c=>({...c}));
  if(rematchStateResetPending){if(!publicState.gameOver||typeof publicState.gameOver!=="object")rematchStateResetPending=false;state.gameOver=null;}else if(state.phase!=="rematch_wait"&&state.phase!=="mulligan"){state.gameOver=publicState.gameOver&&typeof publicState.gameOver==="object"?{...publicState.gameOver,winner:publicState.gameOver.winner===1?2:1}:null;if(state.gameOver)state.phase="finished";}else{state.gameOver=null;}
  x.life=Number.isFinite(publicState.life)?publicState.life:x.life;
  if(state.pendingDiscardPlayer!==1)state.pendingDiscardPlayer=publicState.pendingDiscard===true?2:null;
  const handCount=Number.isInteger(publicState.handCount)&&publicState.handCount>=0?publicState.handCount:0;
  const handIds=Array.isArray(publicState.handIds)?publicState.handIds:[];
  x.hand=Array.from({length:handCount},(_,i)=>{const card=newCard("",typeof handIds[i]==="string"?handIds[i]:playerId+"h"+i);card.faceUp=false;return card});
  if(Array.isArray(publicState.revealedHand))publicState.revealedHand.forEach((card,i)=>{if(!card||typeof card.id!=="string")return;const target=x.hand.find(c=>c.id===card.id)||x.hand[i];if(!target)return;target.id=card.id;target.name=typeof card.name==="string"?card.name:"";target.faceUp=true;target.revealed=true});
  x.deckCounters=Number.isFinite(publicState.deckCounters)?publicState.deckCounters:0;x.deckHorizontal=!!publicState.deckHorizontal;
  x.monsters=Array.isArray(publicState.monsters)?publicState.monsters:[];
  x.energy=Array.isArray(publicState.energy)?publicState.energy:[];
  x.field=Array.isArray(publicState.field)?publicState.field:[];
  x.discard=Array.isArray(publicState.discard)?publicState.discard:[];
  const deckCount=Number.isInteger(publicState.deckCount)&&publicState.deckCount>=0?publicState.deckCount:0;
  x.deck=Array.from({length:deckCount},(_,i)=>newCard("",playerId+"d"+i));
  x.facedown=Array.from({length:Math.max(0,Number(publicState.facedownCount)||0)},(_,i)=>{const card=newCard("",playerId+"f"+i);card.faceUp=false;return card});
  if(Array.isArray(publicState.facedownPublic))publicState.facedownPublic.forEach(card=>{if(!card||typeof card.id!=="string")return;const target=x.facedown.find(c=>c.id===card.id)||x.facedown.find(c=>c.faceUp===false);if(!target)return;target.id=card.id;target.name=typeof card.name==="string"?card.name:"";target.faceUp=true});
  if(hadOpponentPublicState&&state.phase==="playing"){
    const entered=x.monsters.find(c=>!oldOpponentMonsterIds.has(c.id));if(entered)resolveTrapTriggers(1,"opponentEnter",entered);
    for(const oldCard of previousOpponentMonsters){const updated=x.monsters.find(c=>c.id===oldCard.id);if(updated&&(Number(updated.damage)||0)<(Number(oldCard.damage)||0))resolveTrapTriggers(1,"opponentHeal",updated)}
    const newCards=[...x.monsters,...x.energy,...x.field,...x.discard].filter(c=>!oldOpponentCardIds.has(c.id));
    const newSpell=newCards.find(c=>x.discard.some(d=>d.id===c.id)&&cardKind(c)==="spell");if(newSpell)resolveTrapTriggers(1,"opponentSpell",newSpell);
    const newOrica=newCards.find(c=>String(cardDefinition(c)?.tags||"").includes("#オリカ"));if(newOrica)resolveTrapTriggers(1,"opponentOricaUse",newOrica);
  }
  state._previousOpponentMonsters=x.monsters.map(c=>({...c}));hasReceivedOpponentPublicState=true;
}
function applyOnlinePlayers(players){
  if(!onlinePlayerId)return;
  if(players){
    const ownId=onlinePlayerId;
    const opponentId=ownId==="player1"?"player2":"player1";
    if(typeof players[ownId]==="string")state.players[1].name=players[ownId];
    if(typeof players[opponentId]==="string")state.players[2].name=players[opponentId];
  }
  const nameInput=document.querySelector("#name");
  if(nameInput)nameInput.value=state.players[1].name;
}

function showPreparationScreen(){
  const screen=document.querySelector("#prepScreen");if(screen)screen.hidden=false;
  const lobby=document.querySelector("#roomLobby");if(lobby)lobby.hidden=true;
  ["roomWaitOverlay","gameOverOverlay","rematchWaitOverlay","mulliganOverlay"].forEach(id=>{const el=document.querySelector("#"+id);if(el)el.hidden=true});
  const input=document.querySelector("#prepPlayerName");if(input)input.value=state.players[1]?.name||"プレイヤー1";
  updatePreparationDeckSummary();
}
function buildFreshPlayer(name,prefix){
  const fallback=state.players[1]?.deckList||[];
  const deckList=(state.savedDeck&&state.savedDeck.length?state.savedDeck:fallback).slice();
  const p=newPlayer(name,prefix);const pool=shuffle((deckList.length?deckList:p.deckList).slice());
  p.deckList=pool.slice();p.hand=pool.slice(0,7).map((n,i)=>newCard(n,prefix+"h"+i));p.deck=pool.slice(7).map((n,i)=>newCard(n,prefix+"d"+i));return p;
}
function resetMatchState(phase="waiting"){
  const ownName=state.players[1]?.name||"プレイヤー1",opponentName=state.players[2]?.name||"プレイヤー2";
  state.players[1]=buildFreshPlayer(ownName,"p1");state.players[2]=newPlayer(opponentName,"p2");
  state.turnPlayer=1;state.selected=null;state.pendingDiscardPlayer=null;state.pendingDiscardReason=null;state.pendingDrawCount=0;
  state.gameOver=null;state.phase=phase;state.mulligan={1:{count:0,done:false},2:{count:0,done:false}};
  state.deckInspectId=null;state.discardInspectId=null;state.discardInspectPlayer=1;state.deckInspectPlayer=1;
  state._previousOpponentMonsters=[];pendingAttack=null;rematchRequested=false;lastPublicState=null;hasReceivedOpponentPublicState=false;
}
function resetToPreparation(message=""){
  if(gameSocket){gameSocket.onclose=null;try{gameSocket.close()}catch{}gameSocket=null}
  const savedName=state.players[1]?.name||"プレイヤー1";
  onlinePlayerId=null;roomPlayerCount=0;currentRoom="";preparationCompleted=false;lastPublicState=null;hasReceivedOpponentPublicState=false;applyingPublicState=false;devLocalMode=false;pendingAttack=null;rematchRequested=false;
  state.players[1]=buildFreshPlayer(savedName,"p1");state.players[2]=newPlayer("プレイヤー2","p2");
  state.turnPlayer=1;state.selected=null;state.pendingDiscardPlayer=null;state.pendingDiscardReason=null;state.pendingDrawCount=0;state.gameOver=null;state.phase="waiting";state.mulligan={1:{count:0,done:false},2:{count:0,done:false}};
  state.deckInspectId=null;state.discardInspectId=null;state.discardInspectPlayer=1;state.deckInspectPlayer=1;state._previousOpponentMonsters=[];cardChoiceHiddenFor=null;devToolsOpenDuringMulligan=false;
  try{localStorage.removeItem("originalCardGameLocalStateDev")}catch{}
  const url=new URL(location.href);url.searchParams.delete("room");history.replaceState(null,"",url);
  const status=document.querySelector("#roomStatus");if(status)status.textContent="ルーム: -";
  const logBox=document.querySelector("#log");if(logBox)logBox.innerHTML="";
  showPreparationScreen();const prepMessage=document.querySelector("#prepMessage");if(prepMessage&&message)prepMessage.textContent=message;render();
}
function renderFlowScreens(){
  const waiting=document.querySelector("#roomWaitOverlay"),result=document.querySelector("#gameOverOverlay"),rematch=document.querySelector("#rematchWaitOverlay");
  const inRoom=!!currentRoom&&!!onlinePlayerId;
  if(waiting){waiting.hidden=!(inRoom&&state.phase==="waiting");const code=document.querySelector("#waitingRoomCode");if(code)code.textContent=currentRoom||"-"}
  if(result){
    result.hidden=!(inRoom&&state.phase==="finished"&&!!state.gameOver);
    if(state.gameOver){
      const title=document.querySelector("#gameOverTitle"),message=document.querySelector("#gameOverMessage");
      if(title)title.textContent=state.gameOver.winner===1?"勝利！":"敗北…";
      const rematchButton=document.querySelector("#requestRematch"),exitButton=document.querySelector("#exitAfterGame");if(rematchButton){rematchButton.textContent=rematchRequested?"ルームに戻る":"再戦を申し込む"}if(exitButton)exitButton.hidden=rematchRequested;
      if(message){const reason=state.gameOver.reason==="surrender"?(state.gameOver.winner===1?"相手が降参しました。":"降参しました。"):({disconnect:"相手が切断しました。",life_zero:"ライフが0以下になりました。",deck_empty:"山札切れです。"})[state.gameOver.reason]||"対戦が終了しました。";message.textContent=reason}
    }
  }
  if(rematch){rematch.hidden=!(inRoom&&state.phase==="rematch_wait");const message=document.querySelector("#rematchWaitMessage");if(message)message.textContent="再戦を申し込みました。相手の返事を待っています。";const cancel=document.querySelector("#cancelRematch");if(cancel)cancel.hidden=true;}
  const headerLeave=document.querySelector("#leaveRoom");if(headerLeave)headerLeave.textContent="降参";
}
function requestRematch(){if(rematchRequested){state.phase="finished";render();return}if(!currentRoom||!gameSocket||gameSocket.readyState!==WebSocket.OPEN){log("サーバーに接続されていないため、再戦を申し込めません");return}rematchRequested=true;state.phase="rematch_wait";gameSocket.send(JSON.stringify({type:"operation",action:"rematch_request"}));render()}
function requestRoomExit(){
  if(currentRoom&&gameSocket&&gameSocket.readyState===WebSocket.OPEN){const action=state.phase==="waiting"?"cancel_wait":"leave_room";gameSocket.send(JSON.stringify({type:"operation",action}));const status=document.querySelector("#waitingRoomMessage");if(status)status.textContent="対戦準備に戻っています…";return}
  resetToPreparation("対戦準備に戻る");
}
function surrender(){
  if(!currentRoom||!gameSocket||gameSocket.readyState!==WebSocket.OPEN){resetToPreparation("対戦準備に戻りました。");return}
  if(state.phase==="finished"){requestRoomExit();return}
  if(!confirm("降参しますか？ 降参すると敗北になります。"))return;
  gameSocket.send(JSON.stringify({type:"operation",action:"concede"}));
}
function handleRoomClosed(message){
  let note="ルームが解散されました。";
  if(message && message.winner && onlinePlayerId){
    if(message.winner===onlinePlayerId)note="対戦終了：勝利しました。対戦準備に戻りました。";
    else if(message.leavingPlayerId===onlinePlayerId)note="対戦終了：降参または退出により敗北しました。対戦準備に戻りました。";
    else note=message.reason==="disconnect"?"対戦相手が切断したため勝利です。対戦準備に戻りました。":"対戦相手がルームを退出しました。対戦準備に戻りました。";
  }else if(message && message.reason==="disconnect")note="接続が切れたため、対戦を終了しました。対戦準備に戻りました。";
  resetToPreparation(note);
}
function updatePreparationDeckSummary(){
  const screen=document.querySelector("#prepScreen");
  if(screen)screen.hidden=false;
  const input=document.querySelector("#prepPlayerName");
  if(input)input.value=state.players[1]?.name||"プレイヤー1";
  updatePreparationDeckSummary();
}
function updatePreparationDeckSummary(){
  const summary=document.querySelector("#prepDeckSummary");
  if(!summary)return;
  const deck=state.savedDeck||state.players[1]?.deckList||[];
  summary.textContent="保存済みデッキ："+deck.length+"枚";
}
function setupPreparationScreen(){
  const nameInput=document.querySelector("#prepPlayerName");
  const saveName=document.querySelector("#prepRename");
  const editDeck=document.querySelector("#prepDeckEdit");
  const enter=document.querySelector("#enterBattle");
  if(saveName)saveName.onclick=()=>{
    const name=(nameInput?.value||"").trim();
    if(!name){const m=document.querySelector("#prepMessage");if(m)m.textContent="プレイヤー名を入力してください。";return}
    const oldInput=document.querySelector("#name");
    if(oldInput)oldInput.value=name.slice(0,16);
    document.querySelector("#rename")?.click();
    const m=document.querySelector("#prepMessage");
    if(m)m.textContent="プレイヤー名の保存をリクエストしました。";
  };
  if(editDeck)editDeck.onclick=()=>{
    state.players[1].deckList=(state.savedDeck||state.players[1].deckList||[]).slice();
    document.querySelector("#deckEditor").hidden=false;
    const search=document.querySelector("#deckCardSearch");if(search)search.value="";
    renderDeckEditor();
  };
  const roomInput=document.querySelector("#prepRoomId");
  if(roomInput){
    roomInput.value=currentRoom||normalizeRoomCode(new URLSearchParams(location.search).get("room"));
    roomInput.oninput=()=>{roomInput.value=normalizeRoomCode(roomInput.value)};
    roomInput.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();enter?.click()}};
  }
  if(enter)enter.onclick=()=>{
    const enteredRoom=normalizeRoomCode(roomInput?.value);
    preparationCompleted=true;
    let entered=false;
    if(enteredRoom){
      entered=enterRoom(enteredRoom);
      if(!entered){preparationCompleted=false;return;}
    }else{
      entered=enterRoom(createRoomCode());
      if(!entered){preparationCompleted=false;return;}
    }
    const screen=document.querySelector("#prepScreen");
    if(screen)screen.hidden=true;
  };
  if(nameInput)nameInput.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();saveName?.click()}};
}
function normalizeRoomCode(value){return String(value||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6)}
function createRoomCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let code="";for(let i=0;i<6;i++)code+=chars[Math.floor(Math.random()*chars.length)];return code}
function enterRoom(room){
  const code=normalizeRoomCode(room);
  if(code.length!==6){const m=document.querySelector("#prepMessage");if(m)m.textContent="6文字のルーム番号を入力してください";return false}
  if(gameSocket){gameSocket.onclose=null;try{gameSocket.close()}catch{}gameSocket=null}
  currentRoom=code;preparationCompleted=true;resetMatchState("waiting");
  const url=new URL(location.href);url.searchParams.delete("room");history.replaceState(null,"",url);
  const prep=document.querySelector("#prepScreen");if(prep)prep.hidden=true;
  const status=document.querySelector("#roomStatus");if(status)status.textContent="ルーム: "+code;
  connectGameServer();render();return true;
}
function setupRoomLobby(){
  currentRoom="";preparationCompleted=false;roomPlayerCount=0;
  const url=new URL(location.href);if(url.searchParams.has("room")){url.searchParams.delete("room");history.replaceState(null,"",url)}
  const lobby=document.querySelector("#roomLobby");if(lobby)lobby.hidden=true;showPreparationScreen();return false;
}
function connectGameServer(){
  if(!currentRoom)return;
  try{
    const key="originalCardGamePlayerTokenDev";
    let playerToken=localStorage.getItem(key);
    if(!playerToken){
      playerToken=crypto.randomUUID();
      localStorage.setItem(key,playerToken);
    }
    gameSocket=new WebSocket(SERVER_WS_BASE+"/room/"+encodeURIComponent(currentRoom)+"?session="+encodeURIComponent(playerToken));
    gameSocket.onopen=()=>{debugLog("WebSocket接続を確立","network","success",{room:currentRoom});log("オンラインサーバーに接続しました")};
    gameSocket.onmessage=e=>{
      debugLog("サーバーからメッセージを受信","network","info",{bytes:String(e.data||"").length});
      try{
        const message=JSON.parse(e.data);
        if(message.type==="joined"){
          onlinePlayerId=message.playerId;
          applyOnlinePlayers(message.players);
          if(message.turnPlayer==="player1"||message.turnPlayer==="player2")state.turnPlayer=message.turnPlayer===onlinePlayerId?1:2;
          render();
          log("オンラインルームに参加しました（"+message.playerId+"）");
        }
        else if(message.type==="operation"&&message.action==="mulligan_update"&&!devLocalMode){
          if(message.playerId!==onlinePlayerId){state.mulligan[2].count=Number.isInteger(message.count)?message.count:0;state.mulligan[2].done=message.done===true;if(state.mulligan[1].done&&state.mulligan[2].done&&state.phase!=="playing"){state.phase="playing";if(state.turnPlayer===1)startTurn(1);else render()}else render();}
        }
        else if(message.type==="operation"&&message.action==="energy_pool"&&!devLocalMode){
          if(message.playerId!==onlinePlayerId){state.players[2].energyPool=Number.isFinite(message.value)?message.value:0;render();}
        }
        else if(message.type==="operation"&&message.action==="effect_delta"&&!devLocalMode){
          if(message.playerId!==onlinePlayerId)applyEffectDelta(message);
        }
        else if(message.type==="operation"&&message.action==="force_end_turn"&&!devLocalMode){
          if(message.playerId!==onlinePlayerId&&state.turnPlayer===1)endTurn();
        }
        else if(message.type==="operation"&&message.action==="attack_declared"&&!devLocalMode){
          if(message.playerId!==onlinePlayerId){const attacker=state.players[2].monsters.find(c=>c.id===message.cardId);if(attacker)attacker.tapped=true;const defender=message.targetCardId?state.players[1].monsters.find(c=>c.id===message.targetCardId):null;resolveTrapTriggers(1,"opponentAttack",attacker||null);if(defender)resolveCardTrigger(defender,1,"attack");render();}
        }
        else if(message.type==="public_state"&&!devLocalMode){
          applyPublicState(message.playerId,message.state);
          applyingPublicState=true;
          render();
          applyingPublicState=false;
          sendPublicState();
        }
        else if(message.type==="card_move"&&!devLocalMode){
          applyRemoteMove(message.playerId,message.zone,message.dest,message.cardId);
        }
        else if(message.type==="log"){const text=message.playerId===onlinePlayerId?message.text:String(message.text||"").replaceAll("自分",state.players[2].name);log(text,false)}
        else if(message.type==="game_finished"){
          const winner=message.winner===onlinePlayerId?1:2;state.gameOver={winner,reason:message.reason||"surrender"};state.phase="finished";render();log(winner===1?"対戦に勝利しました":"対戦に敗北しました",false);
        }
        else if(message.type==="room_closed"){handleRoomClosed(message)}
        else if(message.type==="rematch_waiting"){
          if(message.playerId!==onlinePlayerId){const text=document.querySelector("#gameOverMessage");if(text)text.textContent="相手が再戦を申し込みました。再戦する場合はボタンを押してください。"}
        }
        else if(message.type==="rematch_start"){
          resetMatchState("mulligan");rematchStateResetPending=true;roomPlayerCount=2;state.phase="mulligan";render();log("両者が再戦を選択しました。マリガンから再開します",false);
        }
        else if(message.type==="player_left"){handleRoomClosed({reason:"disconnect"})}
        else if(message.type==="room_status"){
          roomPlayerCount=Number.isInteger(message.playerCount)?message.playerCount:0;
          if(roomPlayerCount>=2&&state.phase==="waiting"){state.phase="mulligan";render();log("対戦相手がそろいました。マリガンを開始してください")}
          else if(roomPlayerCount<2&&state.phase!=="finished"&&state.phase!=="rematch_wait"){state.phase="waiting";render()}
          render();
        }
        else if(message.type==="player_joined"||message.type==="player_names"){
          applyOnlinePlayers(message.players);
          render();
          if(message.type==="player_joined")log("対戦相手が参加しました");
          else log("プレイヤー名を更新しました");
        }
        else if(message.type==="first_player_set"&&!devLocalMode){
          state.turnPlayer=message.turnPlayer===onlinePlayerId?1:2;
          render();
          log("先攻: "+state.players[state.turnPlayer].name,false);
        }
        else if(message.type==="turn_changed"&&!devLocalMode){
          state.turnPlayer=message.turnPlayer===onlinePlayerId?1:2;
          const currentPlayer=message.previousTurnPlayer===onlinePlayerId?1:2;
          if(currentPlayer===1)state.players[1].monsters.forEach(m=>{m.damage=0});
          if(currentPlayer===2)resolveTurnTriggers(1,"opponentEnd");
          if(message.turnPlayer===onlinePlayerId)startTurn(1,false);
          else {resolveTurnTriggers(1,"opponentStart");render();log("ターンが"+state.players[state.turnPlayer].name+"に移りました",false);}
        }
        else if(message.type==="error"){log("オンラインサーバー: "+message.message);if(message.message==="Room is full"){onlinePlayerId=null;currentRoom="";const url=new URL(location.href);url.searchParams.delete("room");history.replaceState(null,"",url);const lobby=document.querySelector("#roomLobby");if(lobby)lobby.hidden=false;const roomMessage=document.querySelector("#roomMessage");if(roomMessage)roomMessage.textContent="このルームは満員です。別のルームIDで参加してください";}}
      }catch{}
    };
    gameSocket.onerror=()=>{debugLog("WebSocket通信エラー","network","error",{room:currentRoom});log("オンラインサーバーへの接続に失敗しました")};
    gameSocket.onclose=e=>{debugLog("WebSocket接続を終了","network","warning",{code:e.code,reason:e.reason||"",room:currentRoom});if(currentRoom){log("オンラインサーバーとの接続が切れました",false);resetToPreparation("接続が切れたため、対戦準備に戻りました。")}};
  }catch(e){console.error(e);log("オンラインサーバーへの接続を開始できませんでした")}
}

const MAX={hand:9,monsters:7,energy:18,field:1,facedown:3};
const CARD_NAMES_URL="all_card_names.txt";

const state={turnPlayer:1,selected:null,deckInspectId:null,discardInspectId:null,discardInspectPlayer:1,pendingDiscardPlayer:null,pendingDiscardReason:null,pendingDrawCount:0,gameOver:null,players:{},savedDeck:[],deckSaveTimer:null,deckLoadTimer:null,phase:"mulligan",mulligan:{1:{count:0,done:false},2:{count:0,done:false}}};
let cardNames=[];
let cardDatabase=[];
let cardDataByName=new Map();

function createCardFace(name,orientation="portrait"){
  const face=document.createElement("div");
  face.className="card-face"+(orientation==="horizontal"?" horizontal":"");
  const tags=String(cardDataByName.get(name)?.tags||"");
  let kind="monster",color="#f0d94f";
  if(tags.includes("エネルギー")){kind="energy";color="#78d9f2"}
  else if(tags.includes("罠")){kind="trap";color="#ef8db5"}
  else if(tags.includes("フィールド")){kind="field";color="#59b96a"}
  else if(tags.includes("魔法")){kind="spell";color="#59b96a"}
  const title=document.createElement("div");
  title.className="card-face-name";
  title.textContent=name||"カード名不明";
  face.appendChild(title);
  if(orientation!=="horizontal"){
    const type=document.createElement("div");
    type.className="card-face-type";
    type.dataset.kind=kind;
    type.style.backgroundColor=kind==="field"?"#8b5a2b":color;
    type.textContent=({monster:"モンスター",spell:"魔法",trap:"罠",energy:"エネルギー",field:"フィールド"})[kind]||"モンスター";
    face.appendChild(type);
  }
  return face;
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a;}
function newCard(name,id){const data=cardDataByName.get(name)||null;return{id,name,faceUp:true,revealed:false,tapped:false,counters:0,damage:0,modification:0,power:Number.isFinite(data?.power)?data.power:0,cardDataId:data?.id||null};}
function saveLocalGameState(){
  try{
    localStorage.setItem("originalCardGameLocalStateDev",JSON.stringify({room:currentRoom||new URLSearchParams(location.search).get("room")||"",player:state.players[1],turnPlayer:state.turnPlayer,pendingDiscardPlayer:state.pendingDiscardPlayer,pendingDiscardReason:state.pendingDiscardReason,pendingDrawCount:state.pendingDrawCount,gameOver:state.gameOver,phase:state.phase,mulligan:state.mulligan}));
  }catch(e){}
}
function loadLocalGameState(){
  try{
    const raw=localStorage.getItem("originalCardGameLocalStateDev");
    if(!raw)return false;
    const saved=JSON.parse(raw);
    if(!saved||!saved.player||!Array.isArray(saved.player.hand)||!Array.isArray(saved.player.deck))return false;
    const requestedRoom=new URLSearchParams(location.search).get("room")||"";
    if((saved.room||"")!==requestedRoom)return false;
    state.players[1]=saved.player;
    if(saved.turnPlayer===1||saved.turnPlayer===2)state.turnPlayer=saved.turnPlayer;
    state.phase=saved.phase==="playing"?"playing":"mulligan";
    if(saved.mulligan&&saved.mulligan[1]&&saved.mulligan[2])state.mulligan=saved.mulligan;
    else if(state.phase==="playing")state.mulligan={1:{count:0,done:true},2:{count:0,done:true}};
    state.pendingDiscardPlayer=saved.pendingDiscardPlayer===1?1:null;
     state.pendingDiscardReason=typeof saved.pendingDiscardReason==="string"?saved.pendingDiscardReason:null;
     state.pendingDrawCount=Number.isInteger(saved.pendingDrawCount)&&saved.pendingDrawCount>0?saved.pendingDrawCount:0;
    state.gameOver=saved.gameOver&&typeof saved.gameOver==="object"?saved.gameOver:null;
    return true;
  }catch(e){return false}
}
function newPlayer(name,p){
  const pool=shuffle([...cardNames]).slice(0,50);
  return{name,life:4000,energyPool:0,deckCounters:0,deckList:pool.slice(),hand:pool.slice(0,7).map((n,i)=>newCard(n,p+"h"+i)),monsters:[],energy:[],field:[],discard:[],facedown:[],deck:pool.slice(7).map((n,i)=>newCard(n,p+"d"+i))};
}
const DEBUG_LOG_LIMIT=500;
let debugLogEntries=[];
let debugLogSequence=0;
function debugLog(message,category="system",status="info",details=null){
 const entry={id:++debugLogSequence,time:new Date().toISOString(),category,status,message:String(message||""),details,room:currentRoom||"",turn:typeof state!=="undefined"&&state.turnPlayer?state.turnPlayer:null,phase:typeof state!=="undefined"&&state.phase?state.phase:""};
 debugLogEntries.push(entry);if(debugLogEntries.length>DEBUG_LOG_LIMIT)debugLogEntries.splice(0,debugLogEntries.length-DEBUG_LOG_LIMIT);
 renderDebugLogs();return entry;
}
function classifyLogMessage(message){
 const s=String(message||"");
 if(/エラー|失敗|できませんでした|例外|未対応/.test(s))return {category:/通信|サーバー|同期|オンライン/.test(s)?"network":"effect",status:/未対応/.test(s)?"unimplemented":/できませんでした|失敗|エラー/.test(s)?"error":"warning"};
 if(/攻撃|ダメージ|戦闘|破壊/.test(s))return {category:"combat",status:"info"};
 if(/効果|罠|発動|条件|手札に加え/.test(s))return {category:"effect",status:/条件を満たしていません/.test(s)?"skipped":"info"};
 if(/オンライン|通信|接続|同期|ルーム/.test(s))return {category:"network",status:"info"};
 if(/ターン|ドロー|手札|ライフ|エネルギー|マナ/.test(s))return {category:"state",status:"info"};
 return {category:"game",status:"info"};
}
function renderDebugLogs(){
 const list=document.querySelector("#debugLogList");if(!list)return;
 const category=document.querySelector("#debugLogFilter")?.value||"all";
 const query=(document.querySelector("#debugLogSearch")?.value||"").trim().toLocaleLowerCase("ja-JP");
 const filtered=debugLogEntries.filter(e=>(category==="all"||e.category===category||category==="errors"&&["error","warning","unimplemented"].includes(e.status))&&(!query||(e.message+" "+JSON.stringify(e.details||"")).toLocaleLowerCase("ja-JP").includes(query)));
 list.innerHTML="";
 if(!filtered.length){list.innerHTML='<div class="debug-log-empty">該当するログはありません</div>';return}
 filtered.slice().reverse().forEach(entry=>{
  const row=document.createElement("button");row.type="button";row.className="debug-log-entry status-"+entry.status;
  const time=document.createElement("span");time.className="debug-log-time";time.textContent=new Date(entry.time).toLocaleTimeString("ja-JP",{hour12:false});
  const tag=document.createElement("span");tag.className="debug-log-tag";tag.textContent=({effect:"効果",combat:"戦闘",network:"通信",state:"状態",game:"対戦",system:"システム"})[entry.category]||entry.category;
  const message=document.createElement("span");message.className="debug-log-message";message.textContent=entry.message;
  row.append(time,tag,message);row.addEventListener("click",()=>{const detail=document.querySelector("#debugLogDetail");if(detail)detail.textContent=JSON.stringify({id:entry.id,time:entry.time,category:entry.category,status:entry.status,room:entry.room,turn:entry.turn,phase:entry.phase,message:entry.message,details:entry.details},null,2)});list.appendChild(row);
 });
}
function log(s,sendOnline=true){
 const message=String(s),e=document.querySelector("#log"),d=new Date().toLocaleTimeString("ja-JP"),html='<div>['+d+'] '+esc(message)+"</div>";
 if(e){e.insertAdjacentHTML("beforeend",html);e.scrollTop=e.scrollHeight}
 const v=document.querySelector("#deckViewerLog");if(v){v.insertAdjacentHTML("beforeend",html);v.scrollTop=v.scrollHeight}
 const classified=classifyLogMessage(message);debugLog(message,classified.category,classified.status);
 if(sendOnline&&!devLocalMode&&onlinePlayerId&&gameSocket&&gameSocket.readyState===WebSocket.OPEN)gameSocket.send(JSON.stringify({type:"operation",action:"log",text:message.slice(0,200)}))
}
function setupDebugLogControls(){
 document.querySelector("#debugLogFilter")?.addEventListener("change",renderDebugLogs);
 document.querySelector("#debugLogSearch")?.addEventListener("input",renderDebugLogs);
 document.querySelector("#debugLogClear")?.addEventListener("click",()=>{debugLogEntries=[];debugLogSequence=0;const detail=document.querySelector("#debugLogDetail");if(detail)detail.textContent="ログを選択すると詳細が表示されます。";renderDebugLogs()});
 document.querySelector("#debugLogCopy")?.addEventListener("click",async()=>{const text=JSON.stringify(debugLogEntries,null,2);try{await navigator.clipboard.writeText(text);const b=document.querySelector("#debugLogCopy");if(b){b.textContent="コピーしました";setTimeout(()=>b.textContent="ログをコピー",1200)}}catch(e){const detail=document.querySelector("#debugLogDetail");if(detail)detail.textContent=text;debugLog("クリップボードへのコピーに失敗しました。詳細欄からログをコピーしてください","system","warning")}});
 renderDebugLogs();
}
window.addEventListener("error",event=>debugLog("JavaScriptエラー: "+(event.message||"不明なエラー"),"system","error",{file:event.filename||"",line:event.lineno||0,column:event.colno||0}));
window.addEventListener("unhandledrejection",event=>debugLog("未処理の非同期エラー: "+String(event.reason?.message||event.reason||"不明なエラー"),"system","error"));
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function closeDiscardViewer(){const v=document.querySelector("#discardViewer");if(v)v.hidden=true;state.discardInspectId=null}
function openDiscardViewer(p=1){state.discardInspectPlayer=p;const cards=state.players[p]?.discard||[];const top=cards.length?cards[cards.length-1]:null;state.discardInspectId=top?top.id:null;state.selected=top?{p,z:"discard",id:top.id}:null;renderDiscardViewer();const v=document.querySelector("#discardViewer");if(v)v.hidden=false;render()}
function renderDiscardViewer(){
  const list=document.querySelector("#discardViewerList"),actions=document.querySelector("#discardViewerActions");if(!list||!actions)return;
  const p=state.discardInspectPlayer||1,x=state.players[p],cards=x.discard||[];list.innerHTML="";actions.innerHTML="";
  if(!cards.length){list.innerHTML='<div class="deck-viewer-empty">捨て札がありません</div>';return}
  cards.forEach(c=>{const e=document.createElement("div");e.className="discard-viewer-card"+(state.discardInspectId===c.id?" selected":"");e.appendChild(createCardFace(c.name));e.onclick=ev=>{ev.stopPropagation();state.discardInspectId=c.id;state.selected={p,z:"discard",id:c.id};renderDiscardViewer();render()};list.appendChild(e)});
  const selected=cards.find(c=>c.id===state.discardInspectId)||cards[cards.length-1];
  state.discardInspectId=selected.id;
}function moveInspectedDiscardCard(dest){if(state.pendingDiscardPlayer!==null)return log("強制捨て中は捨て札からカードを移動できません");const x=state.players[state.discardInspectPlayer||1],i=x.discard.findIndex(c=>c.id===state.discardInspectId);if(i<0)return;if(MAX[dest]!==undefined&&x[dest].length>=MAX[dest])return log(dest+" の上限のため移動をキャンセル");const c=x.discard.splice(i,1)[0];c.faceUp=dest==="facedown"?false:true;x[dest].push(c);log("捨て札から "+c.name+" を "+({"deck":"山札","hand":"手札","monsters":"モンスター","energy":"エネルギー","field":"フィールド","facedown":"罠"}[dest])+" へ移動しました");state.discardInspectId=null;render();renderDiscardViewer()}
function render(){
  const localPlayer=1;
  saveLocalGameState();
  applyOnlinePlayers();
  for(const p of[1,2]){
    const x=state.players[p];
    const playerName=document.querySelector("#p"+p+"-name");playerName.textContent=x.name;playerName.onclick=pendingAttack&&p===2?()=>resolveAttack(null):null;playerName.style.cursor=pendingAttack&&p===2?"pointer":"";playerName.title=pendingAttack&&p===2?"クリックして直接攻撃":"";
    document.querySelector("#p"+p+"-life").textContent=x.life;
    const deckCount=document.querySelector("#p"+p+"-deck-count");if(deckCount)deckCount.textContent=x.deck.length+"枚";const deckCounter=document.querySelector("#p"+p+"-deck-counter");if(deckCounter)deckCounter.textContent=x.deckCounters||0;
    zone(p,"field",x.field);
    zone(p,"discard",x.discard.slice(-1));
    const discardCount=document.querySelector("#p"+p+"-discard-count");if(discardCount)discardCount.textContent=x.discard.length+"枚";
    const discardZone=document.querySelector("#p"+p+"-discard");if(discardZone){discardZone.onclick=()=>openDiscardViewer(p);Array.from(discardZone.children).forEach(card=>{card.onclick=ev=>{ev.stopPropagation();openDiscardViewer(p)}})}
    zone(p,"facedown",x.facedown);
    const deck=document.querySelector("#p"+p+"-deck");
    deck.innerHTML="";
    const deckCounterBadge=document.createElement("b");
    deckCounterBadge.id="p"+p+"-deck-counter";
    deckCounterBadge.textContent=x.deckCounters||0;
    deckCounterBadge.hidden=!(x.deckCounters||0);
    deck.appendChild(deckCounterBadge);
    deck.onclick=null;
    if(x.deck.length)deck.onclick=()=>openDeckViewer();
    deck.classList.toggle("back",!!x.deck.length);
    deck.classList.toggle("horizontal",!!x.deckHorizontal);
    zone(p,"energy",x.energy);
    if(p===1){const tapButton=document.querySelector("#tapAllEnergy");if(tapButton)tapButton.hidden=x.energy.length===0}
    zone(p,"monsters",x.monsters);
    const endButton=document.querySelector("#p"+p+"-hand")?.closest(".player")?.querySelector("button[data-end]");
    if(endButton){
      const isOwnButton=p===localPlayer;
      const canEnd=isOwnButton&&p===state.turnPlayer;
      endButton.hidden=false;
      endButton.disabled=!canEnd;
      endButton.style.display="";
      endButton.style.visibility=canEnd?"visible":"hidden";
      endButton.style.pointerEvents=canEnd?"auto":"none";
    }
    const h=document.querySelector("#p"+p+"-hand");h.innerHTML="";
    x.hand.forEach(c=>h.appendChild(cardEl(p,"hand",c,p===1||c.revealed)));
  }
  const firstButtons=document.querySelectorAll("[data-first]");
  firstButtons.forEach(b=>{b.disabled=onlinePlayerId!==null&&roomPlayerCount<2});
  const turnName=state.players[state.turnPlayer].name;
  document.querySelector("#turnPlayer").textContent=turnName;
  const turnAreaLabel=document.querySelector("#turnAreaLabel");
  if(turnAreaLabel)turnAreaLabel.textContent=turnName+"のターン";
  for(const p of [1,2]){const pool=document.querySelector("#p"+p+"-energy-pool");if(pool)pool.textContent=String(state.players[p].energyPool||0)}
  const discardWarning=document.querySelector("#discardWarning");
  if(discardWarning){
    const pending=state.pendingDiscardPlayer;
    discardWarning.hidden=pending===null;
    if(pending!==null)discardWarning.textContent=state.players[pending].name+"：ドロー前に手札を1枚捨ててください（カードをクリック）";
  }
  selection();
  renderMulliganOverlay();
  renderFlowScreens();
  sendPublicState();
}
function zone(p,z,a){
  const e=document.querySelector("#p"+p+"-"+z);e.innerHTML="";
  if(z==="facedown"){e.style.display="flex";e.style.flexDirection="row";e.style.flexWrap="nowrap";e.style.gap="7px";e.style.alignItems="flex-start";e.style.justifyContent="flex-start"}
  (a||[]).forEach(c=>e.appendChild(cardEl(p,z,c,p===1||c.faceUp!==false)));
}
function cardEl(p,z,c,visible){
  const e=document.createElement("div");
  e.className="card zone-"+z+(c.tapped?" tapped":"")+(state.selected?.id===c.id?" selected":"");if(c.tapped){e.style.transformOrigin="center center";e.style.transform="rotate(-15deg)"}
  if(!visible||c.faceUp===false)e.classList.add("back");
  else{e.appendChild(createCardFace(c.name,z==="energy"?"horizontal":"portrait"));const def=cardDefinition(c);if(z!=="energy"&&def&&def.cost!==undefined&&def.cost!==null&&String(def.cost).trim()!==""){const cost=document.createElement("span");cost.className="card-cost";cost.textContent=String(def.cost);e.appendChild(cost)}if(z==="monsters"){const power=document.createElement("span");power.className="monster-power";const adjustment=(Number(c.modification)||0)-(Number(c.damage)||0);power.textContent=String(attackPower(c))+(adjustment?" ("+(adjustment>0?"+":"")+adjustment+")":"");e.appendChild(power)}if(c.counters)e.insertAdjacentHTML("beforeend",'<span class="counter">' +c.counters+"</span>")}
  if(c.revealed){const mark=document.createElement("span");mark.className="revealed-marker";mark.textContent="!";e.appendChild(mark)}
  e.dataset.player=String(p);e.dataset.zone=z;e.dataset.cardId=c.id;
  if(state.pendingDiscardPlayer!==null){if(state.pendingDiscardPlayer===1&&p===1&&z==="hand")e.onclick=()=>completePendingDiscard(1,c.id);else e.onclick=null}
  else if(pendingAttack&&p===2&&z==="monsters")e.onclick=()=>resolveAttack(c.id)
  else if(p===1&&z==="energy")e.onclick=()=>{state.selected={p,z,id:c.id};if(!c.tapped){c.tapped=true;state.players[1].energyPool=(state.players[1].energyPool||0)+1;broadcastEnergyPool();log("エネルギー「"+c.name+"」をタップしました（使用可能エネルギー +1）")}render()}
  else e.onclick=()=>select(p,z,c.id);
  if(state.selected?.p===p&&state.selected?.z===z&&state.selected?.id===c.id&&cardChoiceHiddenFor!==c.id&&p===1&&state.phase==="playing"&&state.pendingDiscardPlayer===null){
    const actions=document.createElement("div");actions.className="card-choice-actions";
    const s=state.selected;
    const addChoice=(label,cls,fn)=>{const b=document.createElement("button");b.type="button";b.className=cls;b.textContent=label;b.onclick=ev=>{ev.stopPropagation();fn()};actions.appendChild(b)};
    if(z==="hand"){
      const handKind=cardKind(c);
      const energyPlacementBlocked=handKind==="energy"&&state.players[1].energyPlacedThisTurn&&(Number(state.players[1].extraEnergyPlacements)||0)<=0;
      if(!energyPlacementBlocked)addChoice("○","confirm",()=>playCardFromHand(c.id));
      addChoice("×","cancel",()=>{cardChoiceHiddenFor=c.id;render()});
    }else if(z==="monsters"){
      if(state.phase==="playing")addChoice("⚔","attack",()=>declareAttack(c.id));
      const abilities=CardEffectEngine.activatedAbilities(cardDefinition(c)?.effect_text||"");
      abilities.forEach((ability,index)=>addChoice("✦","effect",()=>activateCardAbility(c.id,index)));
      addChoice("×","cancel",()=>{state.selected=null;render()});
    }else if(["discard","field","facedown"].includes(z)){
      const abilities=CardEffectEngine.activatedAbilities(cardDefinition(c)?.effect_text||"");
      abilities.forEach((ability,index)=>addChoice("✦","effect",()=>activateCardAbility(c.id,index)));
      if(abilities.length)addChoice("×","cancel",()=>{state.selected=null;render()});
    }
    if(actions.childElementCount)e.appendChild(actions);
  }
  return e;
}
function find(p,z,id){return state.players[p][z].find(c=>c.id===id)}
function select(p,z,id){const c=find(p,z,id);if(!c)return;cardChoiceHiddenFor=null;state.selected={p,z,id};render()}
function renderCardInfo(card,visible){
  const box=document.querySelector("#cardInfo");if(!box)return;box.innerHTML="";
  if(!visible||(card.faceUp===false&&state.selected?.p!==1)){box.textContent="裏向きのカード";return}
  const d=cardDefinition(card);if(!d){box.textContent=card.name||"カード情報なし";return}
  const title=document.createElement("div");title.className="card-info-name";title.textContent=d.name||card.name;box.appendChild(title);
  const fields=[["種類",String(d.tags||"").replace(/#/g,"")],["コスト",d.cost===null||d.cost===undefined?"—":String(d.cost)],["タイプ",d.types||"—"],["HP",d.power===null||d.power===undefined?"—":String(d.power)],["効果",d.effect_text||"効果なし"],["フレーバー",d.lore||"—"]];
  for(const [label,value] of fields){const row=document.createElement("div");row.className="card-info-row";const key=document.createElement("b");key.textContent=label+"：";const val=document.createElement("span");val.textContent=value;row.append(key,val);box.appendChild(row)}
}
function selection(){
  const op=document.querySelector("#ops");const info=document.querySelector("#cardInfo");if(info&&!state.selected)info.textContent="カードを選択すると、効果などの情報が表示されます。";if(!op)return;op.innerHTML="";
  if(!state.selected){op.textContent="カードを選択してください";return}
  const s=state.selected,c=find(s.p,s.z,s.id);if(!c){state.selected=null;return}
  if(pendingAttack){
    op.innerHTML="";const title=document.createElement("div");title.textContent="攻撃対象を選択："+pendingAttack.name;op.appendChild(title);
    const targetLabel=document.createElement("div");targetLabel.textContent="相手のモンスター";targetLabel.className="attack-target-heading";op.appendChild(targetLabel);
    const targets=state.players[2].monsters;
    if(!targets.length){const empty=document.createElement("div");empty.textContent="相手の場にモンスターはいません";op.appendChild(empty)}
    targets.forEach(target=>{const b=document.createElement("button");b.type="button";b.className="attack-target-button";b.textContent=target.name+"（攻撃力 "+attackPower(target)+"）";b.onclick=()=>resolveAttack(target.id);op.appendChild(b)});
    const playerButton=document.createElement("button");playerButton.type="button";playerButton.className="attack-target-button attack-player-button";playerButton.textContent=state.players[2].name+"に攻撃（プレイヤー）";playerButton.onclick=()=>resolveAttack(null);op.appendChild(playerButton);
    const cancel=document.createElement("button");cancel.type="button";cancel.textContent="攻撃をキャンセル";cancel.onclick=()=>{pendingAttack=null;render()};op.appendChild(cancel);return;
  }
  const visible=s.p===1||c.faceUp!==false;renderCardInfo(c,visible);
  if(state.pendingDiscardPlayer!==null){if(s.p===1&&s.z==="hand"&&s.p===state.pendingDiscardPlayer){add("このカードを捨てる",()=>completePendingDiscard(1,s.id));return}op.textContent="カードを捨てるまで操作できません";return}
  if(!visible){op.textContent="裏向きのカード";return}
  if(s.p!==1){op.textContent="相手のカード";return}
  if(["monsters","energy","field","facedown","discard"].includes(s.z)&&state.phase==="playing"){
    CardEffectEngine.activatedAbilities(cardDefinition(c)?.effect_text||"").forEach((ability,index)=>add("✦ 効果発動（コスト"+ability.cost+"）",()=>activateCardAbility(c.id,index)));
  }
  if(s.z==="monsters"&&state.phase==="playing"&&state.turnPlayer===1&&state.pendingDiscardPlayer===null&&!state.gameOver&&!c.tapped&&(!c.summonedThisTurn||c.canAttackOnSummon||String(cardDefinition(c)?.effect_text||"").includes("場に出たターンでも攻撃できる")))add("⚔ 攻撃を宣言",()=>declareAttack(c.id));
  if(s.z==="hand"&&state.phase==="playing")add("○ カードを使用 / セット",()=>playCardFromHand(c.id));
}
function openMonsterAdjust(c){const modal=document.querySelector("#monsterAdjustModal"),input=document.querySelector("#monsterAdjustInput");modal.hidden=false;input.value="";input.focus();const close=()=>{modal.hidden=true};const apply=(action)=>{const raw=input.value.trim();if(!raw){close();return}const n=Number(raw);if(!Number.isInteger(n)){log("ダメージ／回復の変更をキャンセルしました");close();return}const amount=Math.abs(n);if(action==="cancel"){close();return}if(action==="damage")c.damage+=amount;if(action==="heal")c.damage=Math.max(0,c.damage-amount);if(action==="change")c.modification=amount+c.damage;checkMonsterDestruction(1);state.selected={p:1,z:"monsters",id:c.id};render();close()};modal.querySelectorAll("[data-monster-action]").forEach(b=>b.onclick=()=>apply(b.dataset.monsterAction));input.onkeydown=ev=>{if(ev.key!=="Enter")return;ev.preventDefault();const raw=input.value.trim();if(!raw)return;const n=Number(raw);if(!Number.isInteger(n)){log("ダメージ／回復の変更をキャンセルしました");close();return}apply(n>0&&raw.startsWith("+")?"heal":"damage")}}
function openMonsterStatusAdjust(c){const modal=document.querySelector("#monsterStatusModal"),input=document.querySelector("#monsterStatusInput");modal.hidden=false;input.value="";input.focus();const close=()=>{modal.hidden=true};const apply=(action)=>{const raw=input.value.trim();if(!raw){close();return}const n=Number(raw);if(!Number.isInteger(n)){log("ステータス修正の変更をキャンセルしました");close();return}const amount=Math.abs(n);if(action==="cancel"){close();return}if(action==="increase")c.modification+=amount;if(action==="decrease")c.modification-=amount;if(action==="change")c.modification=amount+c.damage;checkMonsterDestruction(1);state.selected={p:1,z:"monsters",id:c.id};render();close()};modal.querySelectorAll("[data-monster-status-action]").forEach(b=>b.onclick=()=>apply(b.dataset.monsterStatusAction));input.onkeydown=ev=>{if(ev.key!=="Enter")return;ev.preventDefault();const raw=input.value.trim();if(!raw)return;const n=Number(raw);if(!Number.isInteger(n)){log("ステータス修正の変更をキャンセルしました");close();return}apply(n>0&&raw.startsWith("+")?"increase":"decrease")}}
function add(t,fn){const b=document.createElement("button");b.textContent=t;b.onclick=fn;document.querySelector("#ops").appendChild(b)}
function addCounterControls(parent,target,key){const row=document.createElement("div");row.className="counter-actions";const plus=document.createElement("button");plus.textContent="カウンター +1";plus.onclick=()=>{target[key]=(target[key]||0)+1;render()};const minus=document.createElement("button");minus.textContent="カウンター -1";minus.onclick=()=>{if((target[key]||0)===0)return log("カウンター減少をキャンセル");target[key]--;render()};row.append(plus,minus);parent.appendChild(row)}
function openDeckViewer(){state.deckInspectId=null;renderDeckViewer();const v=document.querySelector("#deckViewerLog"),l=document.querySelector("#log");if(v&&l){v.innerHTML=l.innerHTML;v.scrollTop=v.scrollHeight}document.querySelector("#deckViewer").hidden=false}
function closeDeckViewer(){state.deckInspectId=null;document.querySelector("#deckViewer").hidden=true}
function renderDeckViewer(){
  const list=document.querySelector("#deckViewerList"),actions=document.querySelector("#deckViewerActions"),preview=document.querySelector("#deckViewerPreview");if(!list||!actions||!preview)return;
  const x=state.players[1],deck=x.deck||[],displayDeck=[...deck].sort((a,b)=>cardNames.indexOf(a.name)-cardNames.indexOf(b.name));list.innerHTML="";actions.innerHTML="";preview.innerHTML="";
  if(!deck.length){list.innerHTML='<div class="deck-viewer-empty">山札がありません</div>';preview.textContent="カードを選択";return}
  displayDeck.forEach(c=>{const e=document.createElement("div");e.className="deck-viewer-card"+(state.deckInspectId===c.id?" selected":"");e.appendChild(createCardFace(c.name));e.onclick=()=>{state.deckInspectId=c.id;renderDeckViewer()};list.appendChild(e)});
  const c=displayDeck.find(v=>v.id===state.deckInspectId);if(!c){preview.textContent="カードを選択";return}
  preview.appendChild(createCardFace(c.name));const name=document.createElement("div");name.className="deck-viewer-name";name.textContent=c.name;preview.appendChild(name);
}
function moveInspectedDeckCard(dest,reveal=false){
  if(state.pendingDiscardPlayer!==null)return log("強制捨て中は山札からカードを移動できません");
  const x=state.players[1],i=x.deck.findIndex(c=>c.id===state.deckInspectId);if(i<0)return;if(MAX[dest]!==undefined&&x[dest].length>=MAX[dest])return log(dest+" の上限のため移動をキャンセル");const c=x.deck.splice(i,1)[0];c.faceUp=dest==="facedown"?false:true;c.revealed=dest==="hand"&&reveal;if(dest==="discard"){c.damage=0;c.modification=0;c.counters=0}x[dest].push(c);log("山札からカードを "+(reveal?"公開して ":"")+" "+({"hand":"手札","monsters":"モンスター","energy":"エネルギー","field":"フィールド","facedown":"罠","discard":"捨て札"}[dest])+" へ移動しました");state.deckInspectId=null;render();renderDeckViewer();
}
function applyRemoteMove(playerId,zone,dest,cardId){
  const p=playerId===onlinePlayerId?1:2;
  const x=state.players[p];
  if(!x||!Array.isArray(x[zone])||!Array.isArray(x[dest]))return;
  const i=x[zone].findIndex(c=>c.id===cardId);
  if(i<0)return;
  if(MAX[dest]!==undefined&&x[dest].length>=MAX[dest])return;
  const c=x[zone].splice(i,1)[0];
  c.tapped=false;
  c.faceUp=dest==="facedown"?false:true;
  c.revealed=dest==="hand"?!!c.revealed:false;
  if(dest==="discard"){c.damage=0;c.modification=0;c.counters=0}
  x[dest].push(c);
  if(p===1)state.selected=null;
  render();
}
function move(dest){
  const s=state.selected,x=state.players[1],src=x[s.z],i=src.findIndex(c=>c.id===s.id);
  if(i<0)return;
  if(MAX[dest]!==undefined&&x[dest].length>=MAX[dest])return log(dest+" の上限のため移動をキャンセル");
  if(onlinePlayerId!==null&&!devLocalMode){
    if(!gameSocket||gameSocket.readyState!==WebSocket.OPEN)return log("オンラインサーバーに接続されていません");
    gameSocket.send(JSON.stringify({type:"operation",action:"move_card",zone:s.z,dest,cardId:s.id}));
    return;
  }
  const c=src.splice(i,1)[0];
  c.tapped=false;
  c.faceUp=dest==="facedown"?false:true;
  c.revealed=dest==="hand"?!!c.revealed:false;
  if(dest==="discard"){c.damage=0;c.modification=0;c.counters=0}
  x[dest].push(c);
  state.selected=null;
  render();
}

function drawCards(n,p=1){if(!Number.isInteger(n)||n<=0)return log("ドロー枚数は1以上の整数にしてください");drawEffectCards(p,n);state.selected=null;render()}
function ensureDiscardWarning(){if(document.querySelector("#discardWarning"))return;const e=document.createElement("div");e.id="discardWarning";e.hidden=true;e.style.cssText="position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;background:#8b0000;color:#fff;padding:10px 18px;border:2px solid #f33;border-radius:6px;font-weight:700;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.45);";document.body.appendChild(e)}
function startTurn(p,showLog=true){if(state.phase!=="playing")return;debugLog("ターン開始処理: "+(state.players[p]?.name||("プレイヤー"+p)),"state","info",{player:p,phase:state.phase});const x=state.players[p];x.energyPlacedThisTurn=false;x.extraEnergyPlacements=0;x.energyPool=0;if(p===1)broadcastEnergyPool();x.monsters.forEach(m=>{m.tapped=false;m.summonedThisTurn=false;m.canAttackOnSummon=false;m.attacksThisTurn=0;m.cannotAttackUntilTurnEnd=false});x.energy.forEach(e=>e.tapped=false);if(x.deck.length===0){const winner=p===1?2:1;state.gameOver={winner,reason:"deck_empty"};state.phase="finished";render();log(x.name+"はターン開始時に山札が0枚だったため、"+state.players[winner].name+"の勝利です");return}if(x.deck.length&&x.hand.length>=MAX.hand){state.pendingDiscardPlayer=p;state.pendingDiscardReason="turn_start";state.pendingDrawCount=1;state.selected=null;render();log(x.name+"はドロー前に手札を1枚捨てる必要があります。手札のカードをクリックしてください");return}if(x.deck.length&&x.hand.length<MAX.hand)drawCards(1,p);resolveTurnTriggers(p,"start");render();if(showLog)log(x.name+" のターン開始")}
function completePendingDiscard(p,id){if(p!==1)return false;if(state.pendingDiscardPlayer!==p)return false;const x=state.players[p],i=x.hand.findIndex(c=>c.id===id);if(i<0)return true;const discarded=x.hand.splice(i,1)[0],reason=state.pendingDiscardReason,remaining=state.pendingDrawCount;moveToDiscard(p,discarded,"手札上限による破棄");state.pendingDiscardPlayer=null;state.pendingDiscardReason=null;state.pendingDrawCount=0;state.selected=null;log(x.name+"は「"+discarded.name+"」を捨てました");if(reason==="effect_draw"){if(remaining>0)drawEffectCards(p,remaining);render();return true}if(x.deck.length&&x.hand.length<MAX.hand)drawCards(1,p);resolveTurnTriggers(p,"start");render();log(x.name+" のターン開始");return true}
function processScheduledEndTurnEffects(p){const x=state.players[p];for(const card of [...x.monsters,...x.energy,...x.field]){if(!card.destroyAtTurnEnd)continue;card.destroyAtTurnEnd=false;for(const zone of ["monsters","energy","field"]){const i=x[zone].findIndex(c=>c.id===card.id);if(i>=0){x[zone].splice(i,1);moveToDiscard(p,card,"ターン終了時効果");if(zone==="monsters")resolveCardTrigger(card,p,"destroy");break}}}}
function endTurn(){const localPlayer=1;if(state.turnPlayer!==localPlayer||state.pendingDiscardPlayer!==null||state.phase!=="playing")return;if(onlinePlayerId!==null&&!devLocalMode){if(!gameSocket||gameSocket.readyState!==WebSocket.OPEN)return log("オンラインサーバーに接続されていません");resolveTurnTriggers(1,"end");processScheduledEndTurnEffects(1);state.players[1].monsters.forEach(m=>{m.damage=0});render();gameSocket.send(JSON.stringify({type:"operation",action:"end_turn"}));return}const p=state.turnPlayer,x=state.players[p];resolveTurnTriggers(p,"end");processScheduledEndTurnEffects(p);x.monsters.forEach(m=>{m.damage=0});state.turnPlayer=p===1?2:1;startTurn(state.turnPlayer)}

function cardDefinition(cardOrName){if(typeof cardOrName==="string")return cardDataByName.get(cardOrName)||null;const id=cardOrName?.cardDataId;if(id){const exact=cardDatabase.find(c=>c.id===id);if(exact)return exact}return cardDataByName.get(cardOrName?.name)||null}
function cardKind(card){const tag=String(cardDefinition(card)?.tags||"");if(tag.includes("#エネルギーカード"))return "energy";if(tag.includes("#フィールドカード"))return "field";if(tag.includes("#モンスターカード"))return "monster";if(tag.includes("#魔法カード"))return "spell";if(tag.includes("#罠カード"))return "trap";return "unknown"}
function cardCost(card){const value=cardDefinition(card)?.cost;if(typeof value==="number"&&Number.isFinite(value))return Math.max(0,value);if(typeof value==="string"&&/^\+?\d+$/.test(value))return Math.max(0,Number(value.replace("+","")));return 0}
function effectiveCardCost(card,p=1){
 let cost=cardCost(card);const player=state.players[p];if(!player)return cost;
 const data=cardDefinition(card),types=String(data?.types||"");
 for(const source of [...player.monsters,...player.field]){
  const text=String(cardDefinition(source)?.effect_text||"");
  const reduction=text.match(/自分の手札の\[([^\]]+)\]のコスト-(\d+)/);
  if(reduction&&types.includes(reduction[1]))cost-=Number(reduction[2]);
 }
 const ownFormula=String(data?.effect_text||"").match(/手札にある時、これのコスト-\s*[（(]自分のパワー-(\d+)の\[([^\]]+)\]の数[）)]/);
 if(ownFormula){const threshold=Number(ownFormula[1]),tag=ownFormula[2],count=player.monsters.filter(m=>String(cardDefinition(m)?.types||"").includes(tag)&&(Number(m.power)||Number(cardDefinition(m)?.power)||0)>=threshold).length;cost-=count}
 return Math.max(0,cost);
}
function broadcastEnergyPool(){if(!devLocalMode&&onlinePlayerId&&gameSocket?.readyState===WebSocket.OPEN)gameSocket.send(JSON.stringify({type:"operation",action:"energy_pool",value:state.players[1].energyPool||0}))}
function broadcastEffectDelta(delta){if(!devLocalMode&&onlinePlayerId&&gameSocket?.readyState===WebSocket.OPEN)gameSocket.send(JSON.stringify({type:"operation",action:"effect_delta",...delta}))}
function applyEffectDelta(message){
 const actorIsLocal=message.playerId===onlinePlayerId;
 const targetPlayer=["ownLife","ownEnergyPool","ownMonsterDamage"].includes(message.target)?(actorIsLocal?1:2):(actorIsLocal?2:1);
 if(message.target==="ownEnergyPool"||message.target==="opponentEnergyPool"){
  const delta=Number(message.delta)||0;state.players[targetPlayer].energyPool=Math.max(0,(Number(state.players[targetPlayer].energyPool)||0)+delta);render();return;
 }
 if(message.target==="ownLife"||message.target==="opponentLife"){const delta=Number(message.delta)||0;state.players[targetPlayer].life+=delta;if(targetPlayer===1&&delta<0)resolveTrapTriggers(1,"opponentDamagedMe");if(targetPlayer===2&&delta>0)resolveTrapTriggers(1,"opponentHeal");checkLifeWinner(targetPlayer);render();return}
 if(message.target==="ownLifeSet"){const target=actorIsLocal?1:2;if(Number.isFinite(message.value))state.players[target].life=message.value;render();return}
 if(message.target==="ownMonsterDamage"||message.target==="opponentMonsterDamage"){const c=state.players[targetPlayer].monsters.find(m=>m.id===message.cardId);if(c){c.damage=(c.damage||0)+(Number(message.delta)||0);checkMonsterDestruction(targetPlayer);render();return}}
 if(message.target==="opponentCardCounter"){const x=state.players[targetPlayer];let card=null;for(const z of ["monsters","energy","field","facedown","hand","discard"]){const i=(x[z]||[]).findIndex(c=>c.id===message.cardId);if(i>=0){card=x[z].splice(i,1)[0];break}}if(card)moveToDiscard(targetPlayer,card,"効果を打ち消された");render();return}
 if(message.target==="opponentMonsterModifier"){const c=state.players[targetPlayer].monsters.find(m=>m.id===message.cardId);if(c){c.modification=(c.modification||0)+(Number(message.delta)||0);render();return}}
 if(message.target==="opponentDisable"){const c=state.players[targetPlayer].monsters.find(m=>m.id===message.cardId);if(c){c.effectsDisabled=true;render();return}}
 if(message.target==="opponentAttackDamageZero"){const c=state.players[targetPlayer].monsters.find(m=>m.id===message.cardId);if(c){c.nextAttackDamage=0;render();return}}
 if(message.target==="opponentMonsterTap"){const c=state.players[targetPlayer].monsters.find(m=>m.id===message.cardId);if(c){c.tapped=true;render();return}}
 if(message.target==="opponentMill"){const x=state.players[targetPlayer];for(let i=0;i<Math.max(0,Number(message.count)||0)&&x.deck.length;i++)x.discard.push(x.deck.shift());render();return}
 if(message.target==="opponentMonsterDestroy"){const x=state.players[targetPlayer],c=x.monsters.find(m=>m.id===message.cardId);if(c){x.monsters=x.monsters.filter(m=>m.id!==c.id);moveToDiscard(targetPlayer,c,"効果による破壊");resolveCardTrigger(c,targetPlayer,"destroy");if(targetPlayer===1)resolveTrapTriggers(1,"ownDestroy");render()}}
}
function checkLifeWinner(p){if(state.players[p].life<=0){if(!onlinePlayerId||p===1)resolveTrapTriggers(p,"ownLifeZero");if(state.players[p].life>0)return;const winner=p===1?2:1;state.gameOver={winner,reason:"life_zero"};state.phase="finished";log(state.players[p].name+"のライフが0以下になったため、"+state.players[winner].name+"の勝利です")}}
function toggleCardTap(p,z,c){if(z==="energy"){const x=state.players[p],value=cardCost(c);if(!c.tapped)x.energyPool=(x.energyPool||0)+value;else x.energyPool=Math.max(0,(x.energyPool||0)-value);if(p===1)broadcastEnergyPool()}c.tapped=!c.tapped}
function renderMulliganOverlay(){
 const overlay=document.querySelector("#mulliganOverlay");if(!overlay)return;const lobby=document.querySelector("#roomLobby"),prep=document.querySelector("#prepScreen");overlay.hidden=devToolsOpenDuringMulligan||state.phase!=="mulligan"||!currentRoom||!!(lobby&&!lobby.hidden)||!!(prep&&!prep.hidden);const devDuring=document.querySelector("#devDuringMulligan");if(devDuring)devDuring.classList.toggle("visible",state.phase==="mulligan"&&!!currentRoom&&!(lobby&&!lobby.hidden)&&!(prep&&!prep.hidden)&&!devToolsOpenDuringMulligan);
 const own=state.mulligan[1],other=state.mulligan[2],status=document.querySelector("#mulliganStatus");
 const handView=document.querySelector("#mulliganHand");if(handView){handView.innerHTML="";state.players[1].hand.forEach(c=>{const card=document.createElement("div");card.className="card zone-hand";card.appendChild(createCardFace(c.name));const def=cardDefinition(c);if(def&&def.cost!==undefined&&def.cost!==null&&String(def.cost).trim()!==""){const cost=document.createElement("span");cost.className="card-cost";cost.textContent=String(def.cost);card.appendChild(cost)}handView.appendChild(card)})}
 if(status)status.textContent="自分："+(own.done?"確定":(7-own.count)+"枚で引き直し可能")+" ／ 相手："+(other.done?"確定":"選択中")+(onlinePlayerId&&roomPlayerCount<2?" ／ 対戦相手の参加待ち":"");
 const again=document.querySelector("#mulliganAgain"),keep=document.querySelector("#mulliganKeep");
 if(again){again.disabled=own.done||8-own.count<=0||!!onlinePlayerId&&roomPlayerCount<2;again.textContent="引き直す（"+Math.max(0,7-own.count)+"枚）"}
 if(keep)keep.disabled=own.done||!!onlinePlayerId&&roomPlayerCount<2;
 const note=document.querySelector("#mulliganNote");if(note)note.textContent=onlinePlayerId&&roomPlayerCount<2?"対戦相手が参加するとマリガンを開始できます。":own.done?(other.done?"両プレイヤー確定。ゲーム開始":"確定済み。相手の選択を待っています"):"引き直し回数："+own.count+"回。次に引き直すと"+Math.max(0,7-own.count)+"枚になります。";
}
function doMulligan(){
 if(state.phase!=="mulligan"||state.mulligan[1].done)return;
 const x=state.players[1],nextCount=state.mulligan[1].count+1,drawCount=Math.max(0,8-nextCount);
 x.deck.push(...x.hand);x.hand=[];shuffle(x.deck);
 for(let i=0;i<drawCount&&x.deck.length;i++)x.hand.push(x.deck.shift());
 state.mulligan[1].count=nextCount;state.selected=null;
 if(onlinePlayerId&&gameSocket?.readyState===WebSocket.OPEN)gameSocket.send(JSON.stringify({type:"operation",action:"mulligan_update",count:nextCount,done:false}));
 render();log("マリガン"+nextCount+"回目：手札を"+drawCount+"枚引き直しました");
}
function finishMulligan(){
 if(state.phase!=="mulligan"||state.mulligan[1].done)return;state.mulligan[1].done=true;
 if(onlinePlayerId&&gameSocket?.readyState===WebSocket.OPEN)gameSocket.send(JSON.stringify({type:"operation",action:"mulligan_update",count:state.mulligan[1].count,done:true}));
 if(!onlinePlayerId)state.mulligan[2].done=true;
 if(state.mulligan[2].done){state.phase="playing";log("両プレイヤーのマリガンが終了。ゲーム開始");if(state.turnPlayer===1){startTurn(1);return}}
 render();
}
function useEnergyCost(p,cost){const x=state.players[p],available=Number(x.energyPool)||0;if(cost>available){log("使用可能エネルギーが不足しています（必要："+cost+"、使用可能："+available+"）");return false}x.energyPool=available-cost;if(p===1)broadcastEnergyPool();return true}
function moveToDiscard(p,c,reason=""){const x=state.players[p];c.tapped=false;c.faceUp=true;c.revealed=false;c.damage=0;c.modification=0;c.counters=0;x.discard.push(c);if(reason)log("「"+c.name+"」を捨て札に置きました（"+reason+"）")}
function checkMonsterDestruction(p,triggerEffects=true){const x=state.players[p];for(const m of [...x.monsters]){const base=Number(m.power)||Number(cardDefinition(m)?.power)||0;if(base+(Number(m.modification)||0)-(Number(m.damage)||0)<=0){x.monsters=x.monsters.filter(v=>v.id!==m.id);moveToDiscard(p,m,"HPが0以下");if(triggerEffects){if(!onlinePlayerId||p===1){resolveCardTrigger(m,p,"destroy");resolveTrapTriggers(p,"ownDestroy")}if(!onlinePlayerId)resolveTrapTriggers(p===1?2:1,"opponentDestroy");else if(p===2)resolveTrapTriggers(1,"opponentDestroy")}log("「"+m.name+"」はHPが0以下になり破壊されました")}}}
function drawEffectCards(p,n){const x=state.players[p],total=Math.max(0,Math.floor(n));for(let i=0;i<total;i++){if(!x.deck.length){const winner=p===1?2:1;state.gameOver={winner,reason:"deck_empty"};state.phase="finished";log(x.name+"は山札が0枚の状態でドローしようとしたため、"+state.players[winner].name+"の勝利です");break}if(x.hand.length>=MAX.hand){if(p===1){state.pendingDiscardPlayer=1;state.pendingDiscardReason="effect_draw";state.pendingDrawCount=total-i;state.selected=null;render();log(x.name+"は効果のドロー前に手札を1枚捨てる必要があります");return}const discarded=x.hand.shift();moveToDiscard(p,discarded,"手札上限による自動破棄")}x.hand.push(x.deck.shift())}}
function resolveCardTrigger(card,p,trigger){
  const data=cardDefinition(card);
  if(!data||!data.effect_text||card.effectsDisabled||!window.CardEffectEngine)return;
  const text=String(data.effect_text);
  if(trigger==="enter"){
    if(/(?:^|。)\s*(?:攻撃できない|これ(?:は)?攻撃できない)/.test(text))card.cannotAttack=true;
    if(/(?:^|。)\s*(?:攻撃されない|これ(?:は)?攻撃されない)/.test(text))card.cannotBeAttacked=true;
    if(text.includes("アンタップ中は攻撃されない"))card.cannotBeAttackedWhileUntapped=true;
    if(text.includes("相手のモンスターはこれにしか攻撃できない"))card.mustBeAttacked=true;
    if(text.includes("相手のモンスターはプレイヤーに攻撃できない"))state.players[p].opponentMonstersCannotAttackPlayer=true;
    if(text.includes("相手の効果で選ばれない"))card.cannotBeChosenByOpponent=true;
    if(text.includes("相手の罠は発動しない"))state.players[p].disableOpponentTraps=true;
    if(text.includes("相手の「場に出た時」の効果は発動しない"))state.players[p].disableOpponentEnterEffects=true;
    if(text.includes("モンスターとの戦闘時、戦闘相手のパワーで戦闘する"))card.combatPowerUsesOpponent=true;
    if(text.includes("モンスターとの戦闘時、これのパワーの代わりに0パワーで戦闘する"))card.combatPowerOverride=0;
    const repeatAttack=text.match(/1ターンに(\d+)回攻撃できる/);
    if(repeatAttack)card.attacksPerTurn=Number(repeatAttack[1]);
    const reduction=text.match(/自分が受けるダメージ-(\d+)/);
    if(reduction)state.players[p].damageReduction=Math.max(Number(state.players[p].damageReduction)||0,Number(reduction[1]));
    const ownCardReduction=text.match(/これが受けるダメージ-(\d+)/);
    if(ownCardReduction)card.damageReduction=Math.max(Number(card.damageReduction)||0,Number(ownCardReduction[1]));
  }
  if(trigger==="enter"&&state.players[p===1?2:1].disableOpponentEnterEffects){debugLog("相手の効果により場に出た時効果を無効化: "+card.name,"effect","skipped",{player:p,card:card.name});return}
  const abilities=trigger==="spell"?CardEffectEngine.immediateAbilities(text):CardEffectEngine.forTrigger(text,trigger);
  if(!abilities.length)debugLog("カード効果の発動条件に一致なし: "+card.name+" / "+trigger,"effect","skipped",{player:p,card:card.name,trigger});
  abilities.forEach(ability=>{debugLog("カード効果を発動: "+card.name+" / "+trigger,"effect","info",{player:p,card:card.name,trigger,ability:ability.body});resolveEffectText(ability.body,p,card)});
}
function activateCardAbility(cardId,abilityIndex){
  if(state.phase!=="playing"||state.pendingDiscardPlayer!==null)return;
  const selected=state.selected;
  if(!selected||selected.p!==1||!["monsters","energy","field","facedown","discard"].includes(selected.z))return;
  const card=find(1,selected.z,cardId);if(!card)return;
  const abilities=CardEffectEngine.activatedAbilities(cardDefinition(card)?.effect_text||"");
  const ability=abilities[abilityIndex];if(!ability)return;
  if(ability.costKind==="energy"){
    if(!useEnergyCost(1,ability.costValue||0))return;
  }else if(ability.costKind==="tap"){
    if(card.tapped){log("タップ中のカードは能力を使用できません");return}
    card.tapped=true;
    if(selected.z==="energy"){state.players[1].energyPool=Math.max(0,(state.players[1].energyPool||0)-cardCost(card));broadcastEnergyPool()}
  }else if(ability.costKind==="destroy"){
    const zone=state.players[1][selected.z],index=zone.findIndex(c=>c.id===card.id);
    if(index<0)return;
    zone.splice(index,1);moveToDiscard(1,card,"能力コスト");
  }else if(ability.costKind==="counter"){
    const required=Number(ability.costValue)||0;
    if((Number(card.counters)||0)<required){log("必要なカウンターが不足しています（必要："+required+"）");return}
    card.counters=Math.max(0,(Number(card.counters)||0)-required);
  }else if(ability.costKind==="discard"){
    const count=Number(ability.costValue)||1;
    if(state.players[1].hand.length<count){log("能力コストとして捨てる手札が不足しています");return}
    for(let i=0;i<count;i++)moveToDiscard(1,state.players[1].hand.shift(),"能力コスト");
  }else{
    log("未対応の能力コストです："+(ability.costToken||"不明"));return;
  }
  log("「"+card.name+"」の能力を使用"+(ability.costKind==="energy"?"（コスト"+(ability.costValue||0)+"）":"（コスト："+(ability.costToken||"不明")+"）"));
  resolveEffectText(ability.body,1,card);
  checkMonsterDestruction(1);
  state.selected={p:1,z:selected.z,id:card.id};render();
}
function resolveSummonEffects(text,p,sourceCard){
 const own=state.players[p],sourcePattern=/自分の(手札かデッキか捨て札|手札かデッキ|デッキか捨て札|手札か捨て札|手札|デッキ|捨て札)から([\s\S]*?)(\d+)(体|枚)(?:まで)?(?:を場に|を)出す/g;
 let matched=false;
 for(const match of String(text||"").matchAll(sourcePattern)){
  matched=true;
  const sourceNames=match[1].split("か"),qualifier=match[2]||"",limit=Number(match[3]),unit=match[4];
  const costMatch=qualifier.match(/(\d+)コスト以下/),costLimit=costMatch?Number(costMatch[1]):Infinity;
  const includeNameMatch=qualifier.match(/名前に「([^」]+)」を含む/);
  const quotedNames=[...qualifier.matchAll(/「([^」]+)」/g)].map(m=>m[1]);
  const excludedNameMatch=qualifier.match(/「([^」]+)」以外/);
  const exactName=quotedNames.find(name=>(!excludedNameMatch||name!==excludedNameMatch[1])&&(!includeNameMatch||name!==includeNameMatch[1]));
  const includeName=includeNameMatch?.[1]||null;
  const typeMatch=qualifier.match(/\[([^\]]+)\]/);
  const requiredTypes=typeMatch?typeMatch[1].split(/[,、]/).map(v=>v.trim()).filter(Boolean):[];
  const kindWord=qualifier.match(/(モンスター|エネルギー|魔法|罠|フィールド)/)?.[1]||null;
  const kindMap={モンスター:"monster",エネルギー:"energy",魔法:"spell",罠:"trap",フィールド:"field"};
  const requiredKind=kindWord?kindMap[kindWord]:(unit==="体"?"monster":null);
  const sources=sourceNames.map(name=>name==="手札"?own.hand:name==="デッキ"?own.deck:own.discard);
  let summoned=0;
  for(let i=0;i<limit;i++){
   if(requiredKind==="monster"&&own.monsters.length>=MAX.monsters)break;
   if(requiredKind==="energy"&&own.energy.length>=MAX.energy)break;
   if(requiredKind==="trap"&&own.facedown.length>=MAX.facedown)break;
   let selectedSource=null,selectedIndex=-1;
   for(const source of sources){
    const index=source.findIndex(card=>{
     const data=cardDefinition(card),kind=cardKind(card);
     if(!data||kind==="unknown"||kind==="spell"&&unit==="体")return false;
     if(requiredKind&&kind!==requiredKind)return false;
     if(cardCost(card)>costLimit)return false;
     const types=String(data.types||"").split(/[,、]/).map(v=>v.trim()).filter(Boolean);
     if(requiredTypes.some(type=>!types.includes(type)))return false;
     if(exactName&&card.name!==exactName)return false;
     if(includeName&&!String(card.name||"").includes(includeName))return false;
     if(excludedNameMatch&&card.name===excludedNameMatch[1])return false;
     if(/パワー-100の/.test(qualifier)&&Number(data.power)!==-100)return false;
     return true;
    });
    if(index>=0){selectedSource=source;selectedIndex=index;break}
   }
   if(!selectedSource)break;
   const candidate=selectedSource[selectedIndex],candidateKind=cardKind(candidate);
   if(candidateKind==="monster"&&own.monsters.length>=MAX.monsters)break;
   if(candidateKind==="energy"&&own.energy.length>=MAX.energy)break;
   if(candidateKind==="trap"&&own.facedown.length>=MAX.facedown)break;
   const card=selectedSource.splice(selectedIndex,1)[0],kind=candidateKind;
   card.faceUp=kind!=="trap";card.revealed=false;card.tapped=false;
   if(kind==="monster"){
    card.power=Number(cardDefinition(card)?.power)||card.power||0;card.damage=0;card.modification=0;card.summonedThisTurn=true;card.canAttackOnSummon=String(cardDefinition(card)?.effect_text||"").includes("場に出たターンでも攻撃できる");own.monsters.push(card);
    log(own.name+"は効果で「"+card.name+"」を場に出しました");
    resolveCardTrigger(card,p,"enter");resolveTrapTriggers(p,"ownEnter",card);
    if(!onlinePlayerId)resolveTrapTriggers(p===1?2:1,"opponentEnter",card);
   }else if(kind==="energy"){
    card.tapped=String(cardDefinition(card)?.effect_text||"").includes("タップして場に出る");own.energy.push(card);
    log(own.name+"は効果で「"+card.name+"」をエネルギーに置きました");resolveCardTrigger(card,p,"enter");
   }else if(kind==="field"){
    if(own.field.length)moveToDiscard(p,own.field.shift(),"効果でフィールドカードを置換");
    own.field.push(card);log(own.name+"は効果でフィールド「"+card.name+"」を場に出しました");resolveCardTrigger(card,p,"enter");
   }else if(kind==="spell"){
    moveToDiscard(p,card,"効果で魔法を使用");resolveCardTrigger(card,p,"spell");
    if(!onlinePlayerId)resolveTrapTriggers(p===1?2:1,"opponentSpell",card);
   }else if(kind==="trap"){
    own.facedown.push(card);log(own.name+"は効果で罠「"+card.name+"」をセットしました");
   }
   summoned++;
  }
  if(summoned===0)log("効果で出せるカードがありませんでした");
 }
 return matched;
}

function resolveEffectTextCore(text,p,sourceCard,eventCard=null){
 const own=state.players[p],opp=state.players[p===1?2:1];let s=String(text||"");let handled=false,revealedCardForEffect=null;
 const countNamed=(list,name)=>list.filter(c=>String(c.name||"").includes(name)).length;
 const countTag=(list,tag)=>list.filter(c=>String(cardDefinition(c)?.types||"").split(/[,、]/).map(v=>v.trim()).includes(tag)).length;
 const extraPlacement=s.match(/(?:エネルギーを(?:手札から)?(?:追加で|さらに|もう一度)(\d*)枚?(?:置く|出す)|(?:追加で|さらに|もう一度)(\d*)枚?のエネルギーを(?:手札から)?(?:置く|出す)|エネルギーを(?:手札から)?(\d+)枚追加で(?:置く|出す))(?:ことができる|できる|してもよい|してよい)?/);
 if(extraPlacement){const amount=Math.max(1,Number(extraPlacement[1]||extraPlacement[2]||extraPlacement[3])||1);own.extraEnergyPlacements=(Number(own.extraEnergyPlacements)||0)+amount;log("このターン、手札から追加でエネルギーを"+amount+"回置けます");}
 const eventOwner=eventCard?[1,2].find(owner=>["monsters","energy","field","facedown","discard","hand"].some(zone=>state.players[owner]?.[zone]?.some(c=>c.id===eventCard.id))):null;
 if(s.includes("なら")){
  let known=false,met=true;
  if(s.includes("自分のモンスターが1体場にいるなら")){known=true;met=met&&own.monsters.length>0}
  for(const m of s.matchAll(/自分の(\d+)コスト以上の\[([^\]]+)\]が場にいるなら/g)){known=true;met=met&&own.monsters.some(c=>cardCost(c)>=Number(m[1])&&String(cardDefinition(c)?.types||"").includes(m[2]))}
  for(const m of s.matchAll(/自分のエネルギーが(\d+)枚以上場にあるなら/g)){known=true;met=met&&own.energy.length>=Number(m[1])}
  for(const m of s.matchAll(/相手の捨て札が(\d+)枚以上あるなら/g)){known=true;met=met&&opp.discard.length>=Number(m[1])}
  for(const m of s.matchAll(/自分の捨て札が(\d+)枚以上あるなら/g)){known=true;met=met&&own.discard.length>=Number(m[1])}
  for(const m of s.matchAll(/自分のマナが(\d+)以上なら/g)){known=true;met=met&&(Number(own.energyPool)||0)>=Number(m[1])}
  for(const m of s.matchAll(/自分のライフが相手より(\d+)以上低いなら/g)){known=true;met=met&&own.life<=opp.life-Number(m[1])}
  for(const m of s.matchAll(/自分のモンスターが(\d+)体以上場にいるなら/g)){known=true;met=met&&own.monsters.length>=Number(m[1])}
  for(const m of s.matchAll(/自分の名前に「([^」]+)」を含むモンスターが場にいるなら/g)){known=true;met=met&&own.monsters.some(c=>String(c.name||"").includes(m[1]))}
  for(const m of s.matchAll(/自分の\[([^\]]+)\]が(\d+)体以上場にいるなら/g)){known=true;met=met&&countTag(own.monsters,m[1])>=Number(m[2])}
  for(const m of s.matchAll(/相手の\[([^\]]+)\]が(\d+)体以上場にいるなら/g)){known=true;met=met&&countTag(opp.monsters,m[1])>=Number(m[2])}
  for(const m of s.matchAll(/自分の名前に「([^」]+)」を含むモンスターが(\d+)体以上場にいるなら/g)){known=true;met=met&&countNamed(own.monsters,m[1])>=Number(m[2])}
  for(const m of s.matchAll(/自分の手札が(\d+)枚以上なら/g)){known=true;met=met&&own.hand.length>=Number(m[1])}
  for(const m of s.matchAll(/自分の手札が(\d+)枚以下なら/g)){known=true;met=met&&own.hand.length<=Number(m[1])}
  for(const m of s.matchAll(/相手のモンスターが場に無いなら/g)){known=true;met=met&&opp.monsters.length===0}
  for(const m of s.matchAll(/自分のモンスターが場に無いなら/g)){known=true;met=met&&own.monsters.length===0}
  for(const m of s.matchAll(/これのカウンターが(\d+)個以上なら/g)){known=true;met=met&&(Number(sourceCard?.counters)||0)>=Number(m[1])}
  for(const m of s.matchAll(/自分のモンスターが場にいるなら/g)){known=true;met=met&&own.monsters.length>0}
  for(const m of s.matchAll(/自分の\[([^\]]+)\]のフィールドが場にあるなら/g)){known=true;met=met&&own.field.some(c=>String(cardDefinition(c)?.types||"").includes(m[1]))}
  for(const m of s.matchAll(/相手の\[([^\]]+)\]のフィールドが場にあるなら/g)){known=true;met=met&&opp.field.some(c=>String(cardDefinition(c)?.types||"").includes(m[1]))}
  for(const m of s.matchAll(/自分の\[([^\]]+)\]のエネルギーが場にあるなら/g)){known=true;met=met&&own.energy.some(c=>String(cardDefinition(c)?.types||"").includes(m[1]))}
  for(const m of s.matchAll(/自分の\[([^\]]+)\]のエネルギーが場に無いなら/g)){known=true;met=met&&!own.energy.some(c=>String(cardDefinition(c)?.types||"").includes(m[1]))}
  if(!known||!met){
   const conditionPos=s.indexOf("なら"),prefix=conditionPos>=0?s.slice(0,conditionPos).replace(/[、,\s]+$/,""):"";
   const hasEarlierAction=/(?:引く|回復|ダメージ|破壊|タップ|手札に加える|場に出す|カウンター\d+個を乗せる|を\s*[＋+]\s*\d+|マナ\s*[+-]\s*\d+)/.test(prefix);
   if(hasEarlierAction){s=prefix;log(!known?"条件付き部分は未対応のため、条件より前の効果のみ処理します":"条件を満たしていないため、条件より前の効果のみ処理します")}
   else{log(!known?"未対応の条件付き効果（手動で処理してください）: "+s.slice(0,90):"効果の条件を満たしていません");return}
  }
 }
 if(s.includes("場に出たターンでも攻撃できる"))own.monsters.forEach(m=>{if(m.summonedThisTurn)m.canAttackOnSummon=true});
 const manaChanges=[...s.matchAll(/(?:(自分の|相手の|お互いの))?マナ\s*([+-])\s*(\d+)/g)];
 for(const m of manaChanges){
  const scope=m[1]||"自分の",delta=(m[2]==="+"?1:-1)*Number(m[3]);
  const targets=scope==="お互いの"?[p,p===1?2:1]:[scope==="相手の"?(p===1?2:1):p];
  for(const targetPlayer of targets){
   const target=state.players[targetPlayer];target.energyPool=Math.max(0,(Number(target.energyPool)||0)+delta);
   if(onlinePlayerId&&p===1)broadcastEffectDelta({target:targetPlayer===p?"ownEnergyPool":"opponentEnergyPool",delta});
  }
  handled=true;log(scope==="お互いの"?"お互いの使用可能エネルギーを"+(delta>=0?"+"+delta:delta)+"変更しました":(scope==="相手の"?opp.name:own.name)+"の使用可能エネルギーを"+(delta>=0?"+"+delta:delta)+"変更しました");
 }
 const effectTypeMap={モンスター:"monster",魔法:"spell",罠:"trap",フィールド:"field",エネルギー:"energy"};
 const discardHand=s.match(/自分の手札から(?:(魔法|モンスター|罠|フィールド|エネルギー)\s*)?(\d+)枚(?:まで)?(?:を)?捨てる/);
 if(discardHand){const type=discardHand[1]||null,count=Number(discardHand[2]||1);for(let i=0;i<count;i++){const index=own.hand.findIndex(c=>!type||cardKind(c)===effectTypeMap[type]);if(index<0)break;const discarded=own.hand.splice(index,1)[0];moveToDiscard(p,discarded,"効果による手札の破棄");handled=true}}
 const revealHand=s.match(/自分の手札から(?:(魔法|モンスター|罠|フィールド|エネルギー)\s*)?1枚を公開する/);
 if(revealHand){const type=revealHand[1]||null,card=own.hand.find(c=>!type||cardKind(c)===effectTypeMap[type]);if(card){card.revealed=true;card.faceUp=true;revealedCardForEffect=card;handled=true;log(own.name+"は「"+card.name+"」を公開しました")}}
 const healMonster=s.match(/自分のモンスター(?:全て|1体|1体まで)を\s*(\d+)回復/);
 if(healMonster){const targets=/全て/.test(s)?own.monsters:[own.monsters.find(c=>(Number(c.damage)||0)>0)].filter(Boolean);targets.forEach(c=>c.damage=Math.max(0,(Number(c.damage)||0)-Number(healMonster[1])));if(targets.length)handled=true}
 const healSource=s.match(/これを\s*(\d+)回復/);
 if(healSource&&sourceCard&&own.monsters.some(c=>c.id===sourceCard.id)){sourceCard.damage=Math.max(0,(Number(sourceCard.damage)||0)-Number(healSource[1]));handled=true}
 const eventDamage=s.match(/それに\s*(\d+)ダメージ/);
 if(eventDamage&&eventCard&&eventOwner){const amount=Number(eventDamage[1]);eventCard.damage=(Number(eventCard.damage)||0)+amount;if(onlinePlayerId&&p===1&&eventOwner===2)broadcastEffectDelta({target:"opponentMonsterDamage",cardId:eventCard.id,delta:amount});checkMonsterDestruction(eventOwner,true);handled=true}
 const eventModifier=s.match(/それを\s*([+-]\d+)/);
 if(eventModifier&&eventCard&&eventOwner){const delta=Number(eventModifier[1]);eventCard.modification=(Number(eventCard.modification)||0)+delta;if(onlinePlayerId&&p===1&&eventOwner===2)broadcastEffectDelta({target:"opponentMonsterModifier",cardId:eventCard.id,delta});handled=true}
 if(/それが与えるダメージを0にする/.test(s)&&eventCard&&eventOwner){eventCard.nextAttackDamage=0;if(onlinePlayerId&&p===1&&eventOwner===2)broadcastEffectDelta({target:"opponentAttackDamageZero",cardId:eventCard.id});handled=true;log("「"+eventCard.name+"」が与えるダメージを0にしました（戦闘の処理は手動）")}
 if(/それの効果を消す/.test(s)&&eventCard&&eventOwner){eventCard.effectsDisabled=true;if(onlinePlayerId&&p===1&&eventOwner===2)broadcastEffectDelta({target:"opponentDisable",cardId:eventCard.id});handled=true}
 if(/それを打ち消す/.test(s)&&eventCard&&eventOwner){
  const targetState=state.players[eventOwner];let zone=null;
  for(const z of ["monsters","energy","field","facedown","hand","discard"]){const index=(targetState[z]||[]).findIndex(c=>c.id===eventCard.id);if(index>=0){targetState[z].splice(index,1);zone=z;break}}
  if(zone){moveToDiscard(eventOwner,eventCard,"効果を打ち消された");if(onlinePlayerId&&p===1&&eventOwner===2)broadcastEffectDelta({target:"opponentCardCounter",cardId:eventCard.id,zone});handled=true;log("「"+eventCard.name+"」を打ち消しました")}
 }
 if(/(?:それ|そのモンスター)を破壊する/.test(s)&&eventCard&&eventOwner&&state.players[eventOwner].monsters.some(c=>c.id===eventCard.id)){const target=state.players[eventOwner].monsters.find(c=>c.id===eventCard.id);state.players[eventOwner].monsters=state.players[eventOwner].monsters.filter(c=>c.id!==target.id);moveToDiscard(eventOwner,target,"罠の効果による破壊");if(onlinePlayerId&&p===1&&eventOwner===2)broadcastEffectDelta({target:"opponentMonsterDestroy",cardId:target.id});if(!onlinePlayerId||eventOwner===1){resolveCardTrigger(target,eventOwner,"destroy");resolveTrapTriggers(eventOwner,"ownDestroy")}if(eventOwner!==p)resolveTrapTriggers(p,"opponentDestroy");handled=true}
 if(/自分のモンスター全てを全回復/.test(s)){own.monsters.forEach(c=>c.damage=0);handled=true}
 const selfDamage=s.match(/自分に\s*(\d+)ダメージ/);
 if(selfDamage){const amount=Number(selfDamage[1]);own.life-=amount;broadcastEffectDelta({target:"ownLife",delta:-amount});checkLifeWinner(p);handled=true;log(own.name+"に"+amount+"ダメージ")}
 if(/このターンを終了する/.test(s)){state.forceEndTurnAfterEffect=true;handled=true}
 const lifeSet=s.match(/自分のライフ\s*=\s*(\d+)/);
 if(lifeSet){const value=Number(lifeSet[1]),delta=value-own.life;own.life=value;if(onlinePlayerId)broadcastEffectDelta({target:"ownLifeSet",value});else if(delta)broadcastEffectDelta({target:"ownLife",delta});handled=true;log(own.name+"のライフを"+value+"に設定しました")}
 if(/相手のモンスター全てを破壊/.test(s)){for(const target of [...opp.monsters]){opp.monsters=opp.monsters.filter(c=>c.id!==target.id);moveToDiscard(p===1?2:1,target,"効果による破壊");if(onlinePlayerId)broadcastEffectDelta({target:"opponentMonsterDestroy",cardId:target.id});else resolveCardTrigger(target,p===1?2:1,"destroy");handled=true}if(!onlinePlayerId)resolveTrapTriggers(p===1?2:1,"opponentDestroy")}
 for(const m of s.matchAll(/自分は\s*(\d+)枚引く/g)){drawEffectCards(p,Number(m[1]));handled=true}
 for(const m of s.matchAll(/相手に\s*(\d+)ダメージ/g)){opp.life-=Number(m[1]);broadcastEffectDelta({target:"opponentLife",delta:-Number(m[1])});checkLifeWinner(p===1?2:1);if(!onlinePlayerId)resolveTrapTriggers(p===1?2:1,"opponentDamagedMe");handled=true;log(opp.name+"に"+m[1]+"ダメージ")}
 for(const m of s.matchAll(/自分を\s*(\d+)回復/g)){own.life+=Number(m[1]);broadcastEffectDelta({target:"ownLife",delta:Number(m[1])});if(!onlinePlayerId)resolveTrapTriggers(p===1?2:1,"opponentHeal");handled=true;log(own.name+"は"+m[1]+"回復")}
 const allMonstersDamage=s.match(/^モンスター全てに\s*(\d+)ダメージ/);
 if(allMonstersDamage){const amount=Number(allMonstersDamage[1]);for(const targetPlayer of [1,2]){state.players[targetPlayer].monsters.forEach(mon=>{mon.damage=(mon.damage||0)+amount;if(targetPlayer!==p)broadcastEffectDelta({target:"opponentMonsterDamage",cardId:mon.id,delta:amount})});checkMonsterDestruction(targetPlayer,true)}handled=true}
 for(const m of s.matchAll(/相手のモンスター全てに\s*(\d+)ダメージ/g)){opp.monsters.forEach(mon=>{mon.damage=(mon.damage||0)+Number(m[1]);broadcastEffectDelta({target:"opponentMonsterDamage",cardId:mon.id,delta:Number(m[1])})});checkMonsterDestruction(p===1?2:1,true);handled=true}
 for(const m of s.matchAll(/これを\s*\+(\d+)/g)){if(sourceCard)sourceCard.modification=(sourceCard.modification||0)+Number(m[1]);handled=true}
 const ownBuff=s.match(/自分のモンスター(?:全て|1体|1体まで)を\s*\+(\d+)/);
 if(ownBuff){const targets=/全て/.test(s)?own.monsters:[own.monsters[0]].filter(Boolean);targets.forEach(mon=>{mon.modification=(mon.modification||0)+Number(ownBuff[1])});if(targets.length)handled=true}
 /* Counter, formula, and tagged-monster effects. */
 const ownMonsterCounter=s.match(/自分の(?:\[([^\]]+)\])?モンスター1体にカウンター(\d+)個を乗せる/);
 if(ownMonsterCounter){const tag=ownMonsterCounter[1]||"",target=own.monsters.find(m=>!tag||String(cardDefinition(m)?.types||"").includes(tag));if(target){target.counters=(Number(target.counters)||0)+Number(ownMonsterCounter[2]);handled=true;log("「"+target.name+"」にカウンター"+ownMonsterCounter[2]+"個を乗せました")}}
 const ownTagHeal=s.match(/自分の\[([^\]]+)\]1体を全回復/);
 if(ownTagHeal){const target=own.monsters.find(m=>String(cardDefinition(m)?.types||"").includes(ownTagHeal[1]));if(target){target.damage=0;handled=true}}
 const opponentTap=s.match(/相手のモンスター1体をタップする/);
 if(opponentTap){const target=opp.monsters.find(m=>!m.tapped);if(target){target.tapped=true;if(onlinePlayerId)broadcastEffectDelta({target:"opponentMonsterTap",cardId:target.id});handled=true}}
 const opponentTempCantAttack=s.match(/相手のモンスター1体は「([^」]+)」(?:ターン終了時まで)?攻撃できない/);
 if(opponentTempCantAttack){const target=opp.monsters.find(m=>String(m.name||"").includes(opponentTempCantAttack[1])||String(cardDefinition(m)?.types||"").includes(opponentTempCantAttack[1]))||opp.monsters[0];if(target){target.cannotAttackUntilTurnEnd=true;handled=true}}
 const graveFormula=s.match(/相手に\s*[（(]自分の捨て札の\[([^\]]+)\]の枚数\s*[×x*]\s*(\d+)\s*[）)]\s*ダメージ/);
 if(graveFormula){const amount=own.discard.filter(c=>String(cardDefinition(c)?.types||"").includes(graveFormula[1])).length*Number(graveFormula[2]);opp.life-=amount;broadcastEffectDelta({target:"opponentLife",delta:-amount});checkLifeWinner(p===1?2:1);handled=true;log(opp.name+"に捨て札の["+graveFormula[1]+"]の枚数に応じて"+amount+"ダメージ")}
 const ownNamePower=s.match(/これを\s*=\s*[（(]自分の名前に「([^」]+)」を含むモンスターの数\s*[×x*]\s*(\d+)\s*[）)]/);
 if(ownNamePower&&sourceCard){const amount=countNamed(own.monsters,ownNamePower[1])*Number(ownNamePower[2]);sourceCard.modification=amount-(Number(sourceCard.power)||Number(cardDefinition(sourceCard)?.power)||0);handled=true;log("「"+sourceCard.name+"」のパワーを"+amount+"に設定しました")}
 const eventPowerDiff=s.match(/相手に\s*[（(]これのパワー\s*-\s*それのパワー[）)]\s*ダメージ/);
 if(eventPowerDiff&&sourceCard&&eventCard){const amount=Math.max(0,attackPower(sourceCard)-attackPower(eventCard));opp.life-=amount;broadcastEffectDelta({target:"opponentLife",delta:-amount});checkLifeWinner(p===1?2:1);handled=true}
 const allOwnTagCounters=s.match(/自分の\[([^\]]+)\]全てにカウンター(\d+)個を乗せる/);
 if(allOwnTagCounters){own.monsters.filter(m=>String(cardDefinition(m)?.types||"").includes(allOwnTagCounters[1])).forEach(m=>m.counters=(Number(m.counters)||0)+Number(allOwnTagCounters[2]));handled=true}
 const opponentHandReveal=/相手の手札全てを公開する/.test(s);
 if(opponentHandReveal){if(!onlinePlayerId){opp.hand.forEach(c=>{c.revealed=true;c.faceUp=true})}else broadcastEffectDelta({target:"opponentRevealHand"});handled=true;log(opp.name+"の手札を公開します")}
 const randomMonsterDestroy=/他のランダムなモンスター1体を破壊する/.test(s);
 if(randomMonsterDestroy){const candidates=[...own.monsters,...opp.monsters].filter(m=>m.id!==sourceCard?.id);if(candidates.length){const target=candidates[Math.floor(Math.random()*candidates.length)],owner=own.monsters.some(m=>m.id===target.id)?p:(p===1?2:1),zone=state.players[owner].monsters;state.players[owner].monsters=zone.filter(m=>m.id!==target.id);moveToDiscard(owner,target,"ランダム効果による破壊");if(!onlinePlayerId||owner===1)resolveCardTrigger(target,owner,"destroy");if(onlinePlayerId&&owner!==p)broadcastEffectDelta({target:"opponentMonsterDestroy",cardId:target.id});handled=true;log("ランダムに「"+target.name+"」を破壊しました")}}
 const counterAdd=s.match(/これにカウンター(\d+)個を乗せる/);
 if(counterAdd&&sourceCard){sourceCard.counters=(sourceCard.counters||0)+Number(counterAdd[1]);handled=true}
 if(/これのカウンターを0個にする/.test(s)&&sourceCard){sourceCard.counters=0;handled=true}
 if(/\(これをタップ\)/.test(s)&&sourceCard){sourceCard.tapped=true;handled=true}
 if(/相手のモンスター全てをタップ/.test(s)){opp.monsters.forEach(mon=>{mon.tapped=true;broadcastEffectDelta({target:"opponentMonsterTap",cardId:mon.id})});handled=true}
 if(/相手のモンスター(?:1体|1体まで)をタップ/.test(s)){const target=opp.monsters.find(m=>!m.tapped);if(target){target.tapped=true;broadcastEffectDelta({target:"opponentMonsterTap",cardId:target.id});handled=true;log("「"+target.name+"」をタップしました")}}
 const singleDamage=s.match(/(相手のモンスター|自分のモンスター|モンスター)(?:1体|1体まで)に\s*(\d+)ダメージ/);
 if(singleDamage){const targetPlayer=singleDamage[1].startsWith("相手")?(p===1?2:1):singleDamage[1].startsWith("自分")?p:(opp.monsters.length?(p===1?2:1):p);const target=state.players[targetPlayer].monsters[0];if(target){target.damage=(target.damage||0)+Number(singleDamage[2]);if(targetPlayer!==p)broadcastEffectDelta({target:"opponentMonsterDamage",cardId:target.id,delta:Number(singleDamage[2])});checkMonsterDestruction(targetPlayer,targetPlayer===p);handled=true}}
 if(/相手のモンスター1体を破壊|相手のモンスター1体までを破壊/.test(s)){const target=opp.monsters[0];if(target){opp.monsters=opp.monsters.filter(m=>m.id!==target.id);moveToDiscard(p===1?2:1,target,"効果による破壊");broadcastEffectDelta({target:"opponentMonsterDestroy",cardId:target.id});if(!onlinePlayerId)resolveCardTrigger(target,p===1?2:1,"destroy");resolveTrapTriggers(p,"opponentDestroy");handled=true}}
 const search=s.match(/自分の(デッキ|捨て札)から(?:(\d+)コスト以下の)?(?:\[([^\]]+)\]の)?(モンスター|魔法|罠|フィールド|エネルギー)?(\d+)枚までを手札に加える/);
 if(search){const source=search[1]==="デッキ"?own.deck:own.discard,max=Number(search[5]),costLimit=search[2]===undefined?Infinity:Number(search[2]),type=search[4],element=search[3];for(let i=0;i<max;i++){const idx=source.findIndex(c=>{const d=cardDefinition(c);if(!d||cardCost(c)>costLimit)return false;if(type&&!String(d.tags||"").includes(({モンスター:"#モンスターカード",魔法:"#魔法カード",罠:"#罠カード",フィールド:"#フィールドカード",エネルギー:"#エネルギーカード"})[type]))return false;if(element&&!String(d.types||"").includes(element))return false;return true});if(idx<0||own.hand.length>=MAX.hand)break;own.hand.push(source.splice(idx,1)[0]);handled=true}if(handled)log(own.name+"は効果で"+(search[1]==="デッキ"?"山札":"捨て札")+"からカードを手札に加えました")}
 const sameNameSearch=s.match(/自分のデッキか捨て札からそれと同名のカード(\d+)枚までを手札に加える/);
 if(sameNameSearch&&revealedCardForEffect){for(let i=0;i<Number(sameNameSearch[1]);i++){let source=own.deck,idx=source.findIndex(c=>c.name===revealedCardForEffect.name);if(idx<0){source=own.discard;idx=source.findIndex(c=>c.name===revealedCardForEffect.name)}if(idx<0||own.hand.length>=MAX.hand)break;own.hand.push(source.splice(idx,1)[0]);handled=true}}
 const namedSearch=s.match(/自分の(デッキ|捨て札)から「([^」]+)」(\d+)枚までを手札に加える/);
 if(namedSearch){const source=namedSearch[1]==="デッキ"?own.deck:own.discard;for(let i=0;i<Number(namedSearch[3]);i++){const idx=source.findIndex(c=>c.name===namedSearch[2]);if(idx<0||own.hand.length>=MAX.hand)break;own.hand.push(source.splice(idx,1)[0]);handled=true}}
 /* Additional common effects: opponent draw/discard, energy deployment, and mass effects. */
 const opponentDraw=s.match(/相手は(\d+)枚引く/);
 if(opponentDraw){const count=Number(opponentDraw[1]);if(!onlinePlayerId)drawEffectCards(p===1?2:1,count);else broadcastEffectDelta({target:"opponentDraw",count});handled=true;log(opp.name+"は"+count+"枚引きます")}
 const opponentDiscard=s.match(/相手の手札から(\d+)枚を捨てる/);
 if(opponentDiscard){const count=Number(opponentDiscard[1]);if(!onlinePlayerId){for(let i=0;i<count&&opp.hand.length;i++)moveToDiscard(p===1?2:1,opp.hand.splice(Math.floor(Math.random()*opp.hand.length),1)[0],"効果によるランダム破棄")}else broadcastEffectDelta({target:"opponentDiscard",count});handled=true}
 const energyFromDeck=s.match(/自分のデッキから(?:(\d+)コスト以下の)?(?:\[([^\]]+)\]の)?エネルギー(\d+)枚までを(タップして)?出す/);
 if(energyFromDeck){const costLimit=energyFromDeck[1]===undefined?Infinity:Number(energyFromDeck[1]),tag=energyFromDeck[2]||"",count=Number(energyFromDeck[3]);for(let i=0;i<count&&own.energy.length<MAX.energy;i++){const idx=own.deck.findIndex(c=>cardKind(c)==="energy"&&cardCost(c)<=costLimit&&(!tag||String(cardDefinition(c)?.types||"").includes(tag)));if(idx<0)break;const energy=own.deck.splice(idx,1)[0];energy.tapped=!!energyFromDeck[4];own.energy.push(energy);handled=true}if(handled)log("山札からエネルギーを場に出しました")}
 const selfTurnEndDestroy=s.includes("自分のターン終了時、これを破壊する");
 if(selfTurnEndDestroy&&sourceCard){sourceCard.destroyAtTurnEnd=true;handled=true}
 const powerAsZero=/モンスターとの戦闘時、これのパワーの代わりに0パワーで戦闘する/.test(s);
 if(powerAsZero&&sourceCard){sourceCard.combatPowerOverride=0;handled=true}
 const attackTwice=s.match(/(\d+)ターンに(\d+)回攻撃できる/);
 if(attackTwice&&sourceCard){sourceCard.attacksPerTurn=Number(attackTwice[2]);handled=true}
 if(/相手のモンスター全ての効果を消す/.test(s)){opp.monsters.forEach(mon=>{mon.effectsDisabled=true;if(onlinePlayerId)broadcastEffectDelta({target:"opponentDisable",cardId:mon.id})});handled=true}
 if(/(?:他の)?モンスター全てを破壊する/.test(s)){for(const targetPlayer of [p,p===1?2:1]){const targets=[...state.players[targetPlayer].monsters].filter(mon=>!(/他の/.test(s)&&sourceCard?.id===mon.id));for(const mon of targets){state.players[targetPlayer].monsters=state.players[targetPlayer].monsters.filter(c=>c.id!==mon.id);moveToDiscard(targetPlayer,mon,"効果による全体破壊");if(!onlinePlayerId||targetPlayer===1)resolveCardTrigger(mon,targetPlayer,"destroy");if(onlinePlayerId&&targetPlayer!==p)broadcastEffectDelta({target:"opponentMonsterDestroy",cardId:mon.id})}}handled=true}
 const opponentMill=s.match(/相手のデッキの上(\d+)枚を捨てる/);
 if(opponentMill){const count=Number(opponentMill[1]);if(!onlinePlayerId){for(let i=0;i<count&&opp.deck.length;i++)opp.discard.push(opp.deck.shift())}broadcastEffectDelta({target:"opponentMill",count});handled=true}
 const ownMill=s.match(/自分のデッキの上(\d+)枚を捨てる/);
 if(ownMill){for(let i=0;i<Number(ownMill[1])&&own.deck.length;i++)own.discard.push(own.deck.shift());handled=true}
 if(/自分のフィールドカードを破壊|自分のフィールドを破壊/.test(s)&&own.field.length){moveToDiscard(p,own.field.shift(),"効果");handled=true}
 if(resolveSummonEffects(s,p,sourceCard))handled=true;
 /* Additional broadly reusable effect patterns. */
 const counterCount=Number(sourceCard?.counters)||0;
 const formulaCounterHeal=s.match(/自分を\s*[（(]これのカウンターの数\s*[×x*]\s*(\d+)[）)]\s*回復/);
 if(formulaCounterHeal){const amount=counterCount*Number(formulaCounterHeal[1]);own.life+=amount;broadcastEffectDelta({target:"ownLife",delta:amount});handled=true;log(own.name+"はカウンター数に応じて"+amount+"回復")}
 const formulaCounterDraw=s.match(/自分は\s*[（(]これのカウンターの数[）)]\s*枚引く/);
 if(formulaCounterDraw){drawEffectCards(p,counterCount);handled=true;log("カウンター数に応じて"+counterCount+"枚引きます")}
 const formulaOwnTagBuff=s.match(/これを\s*[＋+]\s*[（(]自分の場の\[([^\]]+)\]の数\s*[×x*]\s*(\d+)\s*[）)]/);
 if(formulaOwnTagBuff&&sourceCard){const amount=countTag([...own.monsters,...own.energy,...own.field],formulaOwnTagBuff[1])*Number(formulaOwnTagBuff[2]);sourceCard.modification=(Number(sourceCard.modification)||0)+amount;handled=true;log("場の["+formulaOwnTagBuff[1]+"]の数に応じて「"+sourceCard.name+"」を+"+amount)}
 const formulaPowerDamage=s.match(/相手に\s*[（(]これのパワー[）)]\s*ダメージ/);
 if(formulaPowerDamage&&sourceCard){const amount=attackPower(sourceCard);opp.life-=amount;broadcastEffectDelta({target:"opponentLife",delta:-amount});checkLifeWinner(p===1?2:1);handled=true;log(opp.name+"にパワー分の"+amount+"ダメージ")}
 const formulaTagDamage=s.match(/モンスター1体に\s*[（(]自分の名前に「([^」]+)」を含むモンスターの数\s*[×x*]\s*(\d+)\s*[）)]\s*ダメージ/);
 if(formulaTagDamage){const amount=countNamed(own.monsters,formulaTagDamage[1])*Number(formulaTagDamage[2]);const targetMonster=opp.monsters[0]||own.monsters[0];if(targetMonster){const targetOwner=opp.monsters.includes(targetMonster)?(p===1?2:1):p;targetMonster.damage=(Number(targetMonster.damage)||0)+amount;if(targetOwner!==p)broadcastEffectDelta({target:"opponentMonsterDamage",cardId:targetMonster.id,delta:amount});checkMonsterDestruction(targetOwner,true);handled=true}}
 if(/自分のモンスター1体を破壊する/.test(s)){const targetMonster=own.monsters[0];if(targetMonster){own.monsters=own.monsters.filter(c=>c.id!==targetMonster.id);moveToDiscard(p,targetMonster,"効果による破壊");resolveCardTrigger(targetMonster,p,"destroy");resolveTrapTriggers(p,"ownDestroy");handled=true}}
 if(/自分のエネルギー1枚を破壊する/.test(s)){const targetEnergy=own.energy[0];if(targetEnergy){own.energy=own.energy.filter(c=>c.id!==targetEnergy.id);moveToDiscard(p,targetEnergy,"効果による破壊");handled=true}}
 if(/自分のエネルギー全てを破壊する/.test(s)){for(const targetEnergy of [...own.energy])moveToDiscard(p,targetEnergy,"効果による破壊");own.energy=[];handled=true}
 const genericSearch=s.match(/自分の(デッキ|捨て札)(?:か(デッキ|捨て札))?から(?:(\d+)コスト以下の)?(?:名前に「([^」]+)」を含む)?(?:\[([^\]]+)\])?(カード|モンスター|魔法|罠|フィールド|エネルギー)?(\d+)枚までを手札に加える/);
 if(genericSearch&&!search&&!namedSearch){
  const sourceNames=[genericSearch[1],genericSearch[2]].filter(Boolean),sources=sourceNames.map(name=>name==="デッキ"?own.deck:own.discard);
  const costLimit=genericSearch[3]===undefined?Infinity:Number(genericSearch[3]),namePart=genericSearch[4]||"",tag=genericSearch[5]||"",type=genericSearch[6]||"",max=Number(genericSearch[7]);
  const kindByWord={モンスター:"monster",魔法:"spell",罠:"trap",フィールド:"field",エネルギー:"energy"};
  for(let i=0;i<max&&own.hand.length<MAX.hand;i++){
   let found=null,foundIndex=-1,foundSource=null;
   for(const source of sources){const idx=source.findIndex(c=>{const d=cardDefinition(c);return !!d&&cardCost(c)<=costLimit&&(!namePart||String(c.name||"").includes(namePart))&&(!tag||String(d.types||"").split(/[,、]/).map(v=>v.trim()).includes(tag))&&(!kindByWord[type]||cardKind(c)===kindByWord[type])});if(idx>=0){found=source[idx];foundIndex=idx;foundSource=source;break}}
   if(!found)break;own.hand.push(foundSource.splice(foundIndex,1)[0]);handled=true;
  }
  if(handled)log(own.name+"は条件に合うカードを効果で手札に加えました");
 }
 if(sourceCard&&/(?:^|。)\s*(?:攻撃できない|これ(?:は)?攻撃できない)/.test(s))sourceCard.cannotAttack=true;
 if(sourceCard&&/(?:^|。)\s*(?:攻撃されない|これ(?:は)?攻撃されない)/.test(s))sourceCard.cannotBeAttacked=true;
 if(sourceCard&&s.includes("相手のモンスターはこれにしか攻撃できない"))sourceCard.mustBeAttacked=true;
 if(sourceCard&&s.includes("相手のモンスターはプレイヤーに攻撃できない"))own.opponentMonstersCannotAttackPlayer=true;
 const damageReductionMatch=s.match(/自分が受けるダメージ-(\d+)/);
 if(damageReductionMatch)own.damageReduction=Math.max(Number(own.damageReduction)||0,Number(damageReductionMatch[1]));
 const ownCardReduction=s.match(/これが受けるダメージ-(\d+)/);
 if(ownCardReduction&&sourceCard)sourceCard.damageReduction=Math.max(Number(sourceCard.damageReduction)||0,Number(ownCardReduction[1]));

 if(!handled)log("未対応の効果（手動で処理してください）: "+s.slice(0,90));
}
function resolveEffectText(text,p,sourceCard,eventCard=null){
 const cardName=sourceCard?.name||"不明なカード",summary=String(text||"").slice(0,180);
 const compiled=typeof CardEffectRuntime!=="undefined"?CardEffectRuntime.summarize(text):null;
 const before={life:state.players[p]?.life,hand:state.players[p]?.hand?.length,deck:state.players[p]?.deck?.length,discard:state.players[p]?.discard?.length,monsters:state.players[p]?.monsters?.length,energy:state.players[p]?.energy?.length,field:state.players[p]?.field?.length};
 const trace=debugLog("効果処理開始: "+cardName+" / "+summary,"effect","info",{player:p,sourceCard:cardName,eventCard:eventCard?.name||null,before,compiled:compiled?{clauseCount:compiled.clauseCount,recognizedCount:compiled.recognizedCount,unrecognizedCount:compiled.unrecognizedCount,ambiguousCount:compiled.ambiguousCount,clauses:compiled.clauses.map(c=>({index:c.index,trigger:c.trigger,cost:c.cost,conditions:c.conditions,target:c.target,numeric:c.numeric,actions:c.actions,confidence:c.confidence}))}:null});
 try{
  const result=resolveEffectTextCore(text,p,sourceCard,eventCard);
  const recent=debugLogEntries.filter(entry=>entry.id>trace.id);
  const resultStatus=recent.some(entry=>entry.status==="unimplemented")?"unimplemented":recent.some(entry=>entry.status==="skipped")?"skipped":"success";
  const after={life:state.players[p]?.life,hand:state.players[p]?.hand?.length,deck:state.players[p]?.deck?.length,discard:state.players[p]?.discard?.length,monsters:state.players[p]?.monsters?.length,energy:state.players[p]?.energy?.length,field:state.players[p]?.field?.length};
  debugLog("効果処理終了: "+cardName,"effect",resultStatus,{traceId:trace.id,player:p,before,after,changed:JSON.stringify(before)!==JSON.stringify(after)});
  return result;
 }catch(error){
  debugLog("効果処理中に例外: "+cardName+" / "+String(error?.message||error),"effect","error",{traceId:trace.id,stack:error?.stack||""});throw error;
 }
}
function attackPower(card){if(card?.combatPowerOverride!==undefined&&card?.combatPowerOverride!==null)return Math.max(0,Number(card.combatPowerOverride)||0);const base=Number(card.power)||Number(cardDefinition(card)?.power)||0;return Math.max(0,base+(Number(card.modification)||0))}
function reduceIncomingDamage(target,amount){return Math.max(0,Number(amount||0)-Math.max(0,Number(target?.damageReduction)||0))}
function declareAttack(cardId){
  if(state.phase!=="playing"||state.pendingDiscardPlayer!==null||state.turnPlayer!==1||state.gameOver)return;
  const card=state.players[1].monsters.find(c=>c.id===cardId);if(!card)return;
  if(card.tapped)return log("タップしているモンスターは攻撃できません");
  if((Number(card.attacksThisTurn)||0)>=(Number(card.attacksPerTurn)||1))return log("このモンスターはこのターンに攻撃できる回数を使い切っています");
  if(card.cannotAttack||card.cannotAttackUntilTurnEnd||/(?:^|。)\s*(?:攻撃できない|これ(?:は)?攻撃できない)/.test(String(cardDefinition(card)?.effect_text||"")))return log("このモンスターは効果により攻撃できません");
  if(card.summonedThisTurn&&!card.canAttackOnSummon&&!String(cardDefinition(card)?.effect_text||"").includes("場に出たターンでも攻撃できる"))return log("このターンに場に出たモンスターは攻撃できません");
  pendingAttack={cardId:card.id,name:card.name};state.selected={p:1,z:"monsters",id:card.id};
  log("「"+card.name+"」の攻撃を宣言しました。相手のモンスターかプレイヤー名をクリックして対象を選んでください");
  render();
}
function resolveAttack(targetMonsterId){
  if(!pendingAttack||state.phase!=="playing"||state.pendingDiscardPlayer!==null)return;
  debugLog("攻撃対象を確定: "+(pendingAttack.name||"モンスター")+" → "+(targetMonsterId?("相手モンスターID "+targetMonsterId):"プレイヤーへの直接攻撃"),"combat","info",{attackerId:pendingAttack.cardId,targetMonsterId:targetMonsterId||null});
  const attacker=state.players[1].monsters.find(c=>c.id===pendingAttack.cardId);if(!attacker){pendingAttack=null;render();return}
  if(attacker.tapped){pendingAttack=null;render();return log("タップしているモンスターは攻撃できません")}
  const defender=targetMonsterId?state.players[2].monsters.find(c=>c.id===targetMonsterId):null;
  if(targetMonsterId&&!defender)return;
  const forcedTargets=state.players[2].monsters.filter(c=>c.mustBeAttacked||String(cardDefinition(c)?.effect_text||"").includes("相手のモンスターはこれにしか攻撃できない"));
  if(forcedTargets.length&&(!defender||!forcedTargets.some(c=>c.id===defender.id))){log("相手の効果により、指定されたモンスターにしか攻撃できません");return}
  if(defender&&(defender.cannotBeAttacked||(!defender.tapped&&defender.cannotBeAttackedWhileUntapped)||/(?:^|。)\s*(?:攻撃されない|これ(?:は)?攻撃されない)/.test(String(cardDefinition(defender)?.effect_text||"")))){log("そのモンスターは攻撃されません");return}
  if(!targetMonsterId&&state.players[2].opponentMonstersCannotAttackPlayer){log("相手の効果によりプレイヤーへの攻撃が禁止されています");return}
  const maxAttacks=Math.max(1,Number(attacker.attacksPerTurn)||1);
  const attackNumber=(Number(attacker.attacksThisTurn)||0)+1;
  attacker.tapped=attackNumber>=maxAttacks;
  debugLog("攻撃宣言: "+attacker.name+"（"+attackNumber+"/"+maxAttacks+"回目）","combat","info",{attackerId:attacker.id,attackNumber,maxAttacks});
  const active=state.turnPlayer,nonActive=active===1?2:1;
  debugLog("攻撃側の罠効果を確認","effect","info",{player:active,trigger:"ownAttack"});
  resolveTrapTriggers(active,"ownAttack",attacker);
  debugLog("攻撃側モンスターの攻撃時効果を確認","effect","info",{player:active,card:attacker.name});
  resolveCardTrigger(attacker,active,"attack");
  if(onlinePlayerId&&gameSocket?.readyState===WebSocket.OPEN){
    gameSocket.send(JSON.stringify({type:"operation",action:"attack_declared",cardId:attacker.id,targetCardId:defender?.id||null}));
  }else{
    debugLog("防御側の罠効果を確認","effect","info",{player:nonActive,trigger:"opponentAttack"});
    resolveTrapTriggers(nonActive,"opponentAttack",attacker);
    if(defender){debugLog("防御側モンスターの効果を確認","effect","info",{player:nonActive,card:defender.name});resolveCardTrigger(defender,nonActive,"attack")}
  }
  const attack=attacker.combatPowerUsesOpponent&&defender?attackPower(defender):attackPower(attacker);
  debugLog("戦闘ダメージを計算","combat","info",{attacker:attacker.name,attackerPower:attack,defender:defender?.name||"プレイヤー",defenderPower:defender?attackPower(defender):null});
  if(defender&&state.players[2].monsters.some(c=>c.id===defender.id)){
    const defenderPower=defender.combatPowerUsesOpponent?attackPower(attacker):attackPower(defender);
    const attackerPower=attacker.combatPowerUsesOpponent?attackPower(defender):attack;
    const counter=reduceIncomingDamage(attacker,defenderPower);
    const defenderDamage=reduceIncomingDamage(defender,attackerPower);
    attacker.damage=(Number(attacker.damage)||0)+counter;
    defender.damage=(Number(defender.damage)||0)+defenderDamage;
    log("「"+attacker.name+"」と「"+defender.name+"」が戦闘。"+attacker.name+"は"+counter+"ダメージ、"+defender.name+"は"+defenderDamage+"ダメージを受けました");
    if(onlinePlayerId&&gameSocket?.readyState===WebSocket.OPEN){gameSocket.send(JSON.stringify({type:"operation",action:"effect_delta",target:"ownMonsterDamage",cardId:attacker.id,delta:counter}));gameSocket.send(JSON.stringify({type:"operation",action:"effect_delta",target:"opponentMonsterDamage",cardId:defender.id,delta:attack}))}
    checkMonsterDestruction(1);checkMonsterDestruction(2);
  }else if(!targetMonsterId){
    const playerDamage=reduceIncomingDamage(state.players[2],attack);
    state.players[2].life-=playerDamage;
    log(state.players[2].name+"は「"+attacker.name+"」の直接攻撃で"+playerDamage+"ダメージを受けました");
    if(onlinePlayerId&&gameSocket?.readyState===WebSocket.OPEN)gameSocket.send(JSON.stringify({type:"operation",action:"effect_delta",target:"opponentLife",delta:-playerDamage}));
    checkLifeWinner(2);
  }
  attacker.attacksThisTurn=(Number(attacker.attacksThisTurn)||0)+1;
  pendingAttack=null;state.selected=null;render();
}
function trapConditionMet(owner,trigger,abilityText,eventCard){
 const match=String(abilityText||"").match(/^\s*\[([^\]]+)\]/);if(!match)return true;
 const condition=match[1],x=state.players[owner];
 if(condition.includes("2コスト以下なら")&&(!eventCard||cardCost(eventCard)>2))return false;
 if(condition.includes("[ザコ]なら")&&(!eventCard||!String(cardDefinition(eventCard)?.types||"").includes("ザコ")))return false;
 if(condition.includes("場に出たターンでも攻撃できる。")&&condition.includes("持つなら")&&(!eventCard||!String(cardDefinition(eventCard)?.effect_text||"").includes("場に出たターンでも攻撃できる。")))return false;
 if(condition.includes("[海]")&&condition.includes("フィールド")&&!x.field.some(c=>String(cardDefinition(c)?.types||"").includes("海")))return false;
 if(condition.includes("マナが3以上なら")&&(Number(x.energyPool)||0)<3)return false;
 if(condition.includes("なら")&&!/(2コスト以下なら|\[ザコ\]なら|場に出たターンでも攻撃できる。.*持つなら|\[海\].*フィールド.*あるなら|マナが3以上なら)/.test(condition)){log("未対応の罠条件（罠は発動せず待機）: "+condition.slice(0,70));return false}
 return true;
}
function forceEndTurnForTrap(owner){
 if(onlinePlayerId){
  if(state.turnPlayer===1)endTurn();
  else if(gameSocket?.readyState===WebSocket.OPEN)gameSocket.send(JSON.stringify({type:"operation",action:"force_end_turn"}));
  else log("ターン終了をオンライン相手に通知できませんでした");
  return;
 }
 const p=state.turnPlayer;resolveTurnTriggers(p,"end");state.players[p].monsters.forEach(m=>{m.damage=0});state.players[p].energyPool=0;state.turnPlayer=p===1?2:1;startTurn(state.turnPlayer);
}
function resolveTrapTriggers(owner,trigger,eventCard=null){
 const x=state.players[owner];
 const opponent=state.players[owner===1?2:1];
 if(opponent.disableOpponentTraps){debugLog("相手の効果により罠の発動を禁止","effect","skipped",{player:owner,trigger});return}if(!x||!Array.isArray(x.facedown))return;
 const source=[...x.facedown];
 for(const trap of source){
  const currentIndex=x.facedown.findIndex(c=>c.id===trap.id);if(currentIndex<0)continue;
  const text=String(cardDefinition(trap)?.effect_text||""),parts=CardEffectEngine.splitAbilities(text);let matches=part=>false;
  if(["start","end","opponentStart","opponentEnd"].includes(trigger))matches=part=>part.trigger===trigger&&part.cost===null;
  else if(trigger==="opponentEnter")matches=part=>part.cost===null&&/^\s*\[\s*相手/.test(part.body)&&/(場に出た時|場に出たとき|場に出した時|場に出したとき)/.test(part.body);
  else if(trigger==="ownEnter")matches=part=>part.cost===null&&/^\s*\[\s*自分/.test(part.body)&&/(場に出た時|場に出たとき|場に出した時|場に出したとき)/.test(part.body);
  else if(trigger==="opponentDestroy")matches=part=>part.cost===null&&/^\s*\[\s*相手/.test(part.body)&&/(破壊された時|破壊されたとき|破壊時)/.test(part.body);
  else if(trigger==="ownDestroy")matches=part=>part.cost===null&&/^\s*\[\s*自分/.test(part.body)&&/(破壊された時|破壊されたとき|破壊時)/.test(part.body);
  else if(trigger==="opponentAttack")matches=part=>part.cost===null&&/^\s*\[\s*相手/.test(part.body)&&/(攻撃時|攻撃した時|攻撃したとき)/.test(part.body);
  else if(trigger==="ownAttack")matches=part=>part.cost===null&&/^\s*\[\s*自分/.test(part.body)&&/(攻撃時|攻撃した時|攻撃したとき)/.test(part.body);
  else if(trigger==="opponentSpell")matches=part=>part.cost===null&&/^\s*\[\s*相手の魔法の使用時/.test(part.body);
  else if(trigger==="opponentHeal")matches=part=>part.cost===null&&/^\s*\[\s*相手が回復した時/.test(part.body);
  else if(trigger==="opponentDamagedMe")matches=part=>part.cost===null&&/^\s*\[\s*相手が自分にダメージを与えた時/.test(part.body);
  else if(trigger==="opponentOricaUse")matches=part=>part.cost===null&&/^\s*\[\s*相手のオリカの使用時/.test(part.body);
  else if(trigger==="ownLifeZero")matches=part=>part.cost===null&&/^\s*\[\s*自分のライフが0になった時/.test(part.body);
  const startIndex=parts.findIndex(matches);if(startIndex<0){debugLog("罠の効果条件に一致なし: "+trap.name+" / "+trigger,"effect","skipped",{player:owner,card:trap.name,trigger});continue;}
  const first=parts[startIndex];if(!trapConditionMet(owner,trigger,first.body,eventCard)){debugLog("罠の追加条件を満たさない: "+trap.name,"effect","skipped",{player:owner,card:trap.name,trigger,condition:first.body});continue;}
  const group=[first];for(let k=startIndex+1;k<parts.length;k++){if(/^\s*\[/.test(parts[k].body))break;group.push(parts[k])}
  const liveIndex=x.facedown.findIndex(c=>c.id===trap.id);if(liveIndex<0)continue;
  x.facedown.splice(liveIndex,1);trap.faceUp=true;trap.revealed=false;moveToDiscard(owner,trap,"罠の自動発動");
  log("罠「"+trap.name+"」が条件を満たしたため自動発動しました");
  group.forEach(part=>{const effectText=part.body.replace(/^\s*\[[^\]]+\]\s*/,"").replace(/^\s*\([^)]*\)\s*/,"").trim();if(effectText)resolveEffectText(effectText,owner,trap,eventCard)});
  if(state.forceEndTurnAfterEffect){state.forceEndTurnAfterEffect=false;forceEndTurnForTrap(owner)}
 }
}
function resolveTurnTriggers(p,when){
 const x=state.players[p];
 for(const m of [...x.monsters])resolveCardTrigger(m,p,when);
 for(const e of [...x.energy])resolveCardTrigger(e,p,when);
 for(const f of [...x.field])resolveCardTrigger(f,p,when);
 for(const c of [...x.discard])if(String(cardDefinition(c)?.effect_text||"").includes("捨て札にある時"))resolveCardTrigger(c,p,when);
 resolveTrapTriggers(p,when);
}
function playCardFromHand(cardId){
 if(state.phase!=="playing"||state.pendingDiscardPlayer!==null)return;const x=state.players[1],idx=x.hand.findIndex(c=>c.id===cardId);if(idx<0)return;
 const card=x.hand[idx],kind=cardKind(card),cost=effectiveCardCost(card,1),effect=String(cardDefinition(card)?.effect_text||"");
 if(effect.includes("これは使わずに場に出せない"))return log("このカードは通常の手札使用では場に出せません");
 const requiredElement=effect.match(/自分の\[([^\]]+)\]のエネルギーが場に無い時使用できず場に出せない/);
 if(requiredElement&&!x.energy.some(e=>String(cardDefinition(e)?.types||"").includes(requiredElement[1])))return log("条件を満たしていないため「"+card.name+"」は使用できません");
 const requiredEnergyTag=effect.match(/自分の\[([^\]]+)\]のエネルギーが場に無い時使用できない/);
 if(requiredEnergyTag&&!x.energy.some(e=>String(cardDefinition(e)?.types||"").includes(requiredEnergyTag[1])))return log("必要な["+requiredEnergyTag[1]+"]エネルギーが場にありません");
 const requiredNamedOrTag=effect.match(/自分の\[([^\]]+)\](?:のモンスター)?が場に無い時使用できない/);
 if(requiredNamedOrTag&&!x.monsters.some(m=>String(m.name||"").includes(requiredNamedOrTag[1])||String(cardDefinition(m)?.types||"").includes(requiredNamedOrTag[1])))return log("使用条件を満たしていません：["+requiredNamedOrTag[1]+"]が場に必要です");
 if(/自分の手札が無い時使用できない/.test(effect)&&x.hand.length===0)return log("手札が必要なため、このカードは使用できません");
 if(/自分のエネルギーが場に無い時使用できない/.test(effect)&&x.energy.length===0)return log("エネルギーが場に必要なため、このカードは使用できません");
 if(kind==="unknown")return log("カード種別を判定できないため使用できません: "+card.name);
 if(kind==="monster"&&x.monsters.length>=MAX.monsters)return log("モンスターゾーンが満杯です");
 if(kind==="energy"&&x.energy.length>=MAX.energy)return log("エネルギーゾーンが満杯です");
 if(kind==="energy"&&x.energyPlacedThisTurn&&(Number(x.extraEnergyPlacements)||0)<=0)return log("手札からエネルギーを置けるのは1ターンに1回までです");
 if(kind==="trap"&&x.facedown.length>=MAX.facedown)return log("罠ゾーンが満杯です");
 if(["monster","spell","trap","field"].includes(kind)&&!useEnergyCost(1,cost))return;
 x.hand.splice(idx,1);card.faceUp=true;card.revealed=false;
 if(kind==="monster"){card.power=Number(cardDefinition(card)?.power)||card.power||0;card.damage=0;card.modification=0;card.tapped=false;card.summonedThisTurn=true;card.canAttackOnSummon=String(cardDefinition(card)?.effect_text||"").includes("場に出たターンでも攻撃できる");x.monsters.push(card);log(x.name+"は「"+card.name+"」を使用しました（コスト"+cost+"）");resolveCardTrigger(card,1,"enter");resolveTrapTriggers(1,"ownEnter",card);if(!onlinePlayerId)resolveTrapTriggers(2,"opponentEnter",card)}
 else if(kind==="energy"){if((Number(x.extraEnergyPlacements)||0)>0)x.extraEnergyPlacements--;else x.energyPlacedThisTurn=true;card.tapped=String(cardDefinition(card)?.effect_text||"").includes("タップして場に出る");x.energy.push(card);log(x.name+"は「"+card.name+"」をエネルギーに置きました");resolveCardTrigger(card,1,"enter")}
 else if(kind==="spell"){moveToDiscard(1,card,"魔法を使用");log(x.name+"は魔法「"+card.name+"」を使用しました（コスト"+cost+"）");resolveCardTrigger(card,1,"spell")}
 else if(kind==="trap"){card.faceUp=false;card.tapped=false;x.facedown.push(card);log(x.name+"は罠「"+card.name+"」をセットしました")}
 else if(kind==="field"){if(x.field.length)moveToDiscard(1,x.field.shift(),"新しいフィールドカードに置換");card.faceUp=true;x.field.push(card);log(x.name+"はフィールド「"+card.name+"」を使用しました（コスト"+cost+"）");resolveCardTrigger(card,1,"enter")}
 if(!onlinePlayerId&&kind==="spell")resolveTrapTriggers(2,"opponentSpell",card);
 if(!onlinePlayerId&&String(cardDefinition(card)?.tags||"").includes("#オリカ"))resolveTrapTriggers(2,"opponentOricaUse",card);
 state.selected=null;checkMonsterDestruction(1);render();
}

function deckEditorCard(name){const e=document.createElement("div");e.className="deck-card";e.appendChild(createCardFace(name));const n=document.createElement("div");n.className="deck-card-name";n.textContent=name;e.appendChild(n);e.onclick=()=>{const deck=state.players[1].deckList||[];deck.push(name);deck.sort((a,b)=>cardNames.indexOf(a)-cardNames.indexOf(b));state.players[1].deckList=deck;showDeckEditorPreview(name);renderDeckEditor()};e.oncontextmenu=ev=>{ev.preventDefault();ev.stopPropagation();showDeckEditorPreview(name)};return e}
function showDeckEditorPreview(name){
  const preview=document.querySelector("#deckEditorPreview");if(!preview)return;preview.innerHTML="";preview.appendChild(createCardFace(name));const label=document.createElement("div");label.textContent=name;preview.appendChild(label);const controls=document.createElement("div");controls.className="deck-preview-controls";const plus=document.createElement("button");plus.type="button";plus.textContent="+1枚";plus.onclick=()=>addDeckEditorCards(name,1);const minus=document.createElement("button");minus.type="button";minus.textContent="−1枚";minus.onclick=()=>addDeckEditorCards(name,-1);const custom=document.createElement("button");custom.type="button";custom.textContent="指定した枚数を追加";custom.onclick=()=>{const input=prompt("追加する枚数を入力してください","1");if(input===null)return;const n=Number(input.trim());if(!Number.isInteger(n)||n<=0){alert("1以上の整数を入力してください");return}addDeckEditorCards(name,n)};controls.append(plus,minus,custom);preview.appendChild(controls)
}
function addDeckEditorCards(name,delta){const deck=state.players[1].deckList||[];if(delta<0){for(let i=0;i<Math.abs(delta);i++){const index=deck.indexOf(name);if(index<0)break;deck.splice(index,1)}}else{for(let i=0;i<delta;i++)deck.push(name)}deck.sort((a,b)=>cardNames.indexOf(a)-cardNames.indexOf(b));state.players[1].deckList=deck;renderDeckEditor()}
function renderDeckEditor(){
  const current=document.querySelector("#deckCurrentList"),candidates=document.querySelector("#deckCandidateList");if(!current||!candidates)return;current.innerHTML="";candidates.innerHTML="";const deck=state.players[1].deckList||[];const count=document.querySelector("#deckCurrentCount");if(count)count.textContent=deck.length+"枚";if(!deck.length)current.innerHTML='<div class="deck-empty">デッキにカードがありません</div>';else{const counts=new Map();deck.forEach(n=>counts.set(n,(counts.get(n)||0)+1));const orderedNames=[...counts.keys()].sort((a,b)=>cardNames.indexOf(a)-cardNames.indexOf(b));orderedNames.forEach(name=>{const count=counts.get(name);const row=document.createElement("div");row.className="deck-card-count";row.onclick=()=>showDeckEditorPreview(name);const nameEl=document.createElement("span");nameEl.textContent=name;const controls=document.createElement("span");controls.className="deck-count-controls";const minus=document.createElement("button");minus.type="button";minus.textContent="−";const countEl=document.createElement("span");countEl.textContent=count;countEl.className="deck-count-number"+(count>4?" over-limit":"");const plus=document.createElement("button");plus.type="button";plus.textContent="+";minus.onclick=e=>{e.stopPropagation();const i=state.players[1].deckList.indexOf(name);if(i>=0)state.players[1].deckList.splice(i,1);renderDeckEditor()};plus.onclick=e=>{e.stopPropagation();state.players[1].deckList.push(name);renderDeckEditor()};controls.append(minus,countEl,plus);row.append(nameEl,controls);current.appendChild(row)})}const q=(document.querySelector("#deckCardSearch")?.value||"").trim().toLocaleLowerCase("ja-JP");cardNames.filter(n=>!q||n.toLocaleLowerCase("ja-JP").includes(q)).forEach(n=>candidates.appendChild(deckEditorCard(n)))
}
function makeDeckCode(deck){const counts=new Map();(deck||[]).forEach(name=>{const i=cardNames.indexOf(name);if(i>=0)counts.set(i,(counts.get(i)||0)+1)});const bytes=[];[...counts.entries()].sort((a,b)=>a[0]-b[0]).forEach(([i,n])=>{bytes.push((i>>8)&3,i&255,n&255)});let bin="";bytes.forEach(b=>bin+=String.fromCharCode(b));return "D2-"+btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function makeLegacyDeckCode(deck){const counts=new Map();(deck||[]).forEach(name=>{const i=cardNames.indexOf(name);if(i>=0)counts.set(i,(counts.get(i)||0)+1)});return "D1-"+[...counts.entries()].sort((a,b)=>a[0]-b[0]).map(([i,n])=>i.toString(36)+"."+n.toString(36)).join("-")}
function readDeckCode(code){
  const raw=String(code||"").trim(),s=raw.toUpperCase();
  if(raw.toUpperCase().startsWith("D2-")){let b64=raw.slice(3).replace(/-/g,"+").replace(/_/g,"/");b64+="=".repeat((4-b64.length%4)%4);const bin=atob(b64),deck=[];if(bin.length%3!==0)throw new Error("デッキコードの形式が正しくありません");for(let j=0;j<bin.length;j+=3){const i=((bin.charCodeAt(j)&3)<<8)|bin.charCodeAt(j+1),n=bin.charCodeAt(j+2);if(i<0||i>=cardNames.length||n<1)throw new Error("デッキコードに不正なカードがあります");for(let k=0;k<n;k++)deck.push(cardNames[i])}return deck}
  if(!s.startsWith("D1-"))throw new Error("デッキコードの形式が正しくありません");const parts=s.slice(3).split("-").filter(Boolean),deck=[];for(const part of parts){const q=part.split(".");if(q.length!==2)throw new Error("デッキコードの形式が正しくありません");const i=parseInt(q[0],36),n=parseInt(q[1],36);if(!Number.isInteger(i)||!Number.isInteger(n)||i<0||i>=cardNames.length||n<1)throw new Error("デッキコードに不正なカードがあります");for(let k=0;k<n;k++)deck.push(cardNames[i])}return deck;
}
function activateDevLocalMode(){if(!devLocalMode){devLocalMode=true;log("開発用ローカル操作を開始しました。以後の盤面変更はこの画面だけに反映されます",false)}}
function devSkipMulligan(p){if(state.phase!=="mulligan"||state.mulligan[p].done)return;activateDevLocalMode();state.mulligan[p].done=true;log((p===1?"自分":"相手")+"のマリガンを開発用にスキップしました",false);if(state.mulligan[1].done&&state.mulligan[2].done){state.phase="playing";log("両プレイヤーのマリガンが終了。ゲーム開始",false);if(state.turnPlayer===1){startTurn(1,false);return}}render()}
function devRefreshCardOptions(){const p=Number(document.querySelector("#devSourcePlayer")?.value||1),z=document.querySelector("#devSourceZone")?.value||"hand",sel=document.querySelector("#devSourceCard");if(!sel)return;sel.innerHTML="";const cards=state.players[p]?.[z]||[];if(!cards.length){const o=document.createElement("option");o.value="";o.textContent="このゾーンにカードなし";sel.appendChild(o);return}cards.forEach(c=>{const o=document.createElement("option");o.value=c.id;o.textContent=(c.name||"(非公開カード情報なし)")+" ["+c.id+"]";sel.appendChild(o)})}
function devRefreshHiddenInfo(){const b=document.querySelector("#devHiddenInfo");if(!b)return;const p=state.players[2],fmt=a=>a.map(c=>c.name||"(カード名は未受信)").join("、")||"なし";b.textContent="相手の手札："+fmt(p.hand)+" ／ 山札："+fmt(p.deck)+" ／ 罠："+fmt(p.facedown)+"。オンライン対戦で未受信のカード名は復元できません。"}
function setupDevTools(){const normal=document.querySelector("#normalToolsPanel"),dev=document.querySelector("#devToolsPanel"),logs=document.querySelector("#debugLogPanel"),nt=document.querySelector("#normalTab"),dt=document.querySelector("#devTab"),lt=document.querySelector("#debugLogTab");const show=v=>{normal.hidden=v;dev.hidden=!v;logs.hidden=true;nt.classList.toggle("active",!v);dt.classList.toggle("active",v);lt.classList.remove("active");if(v){devRefreshCardOptions();devRefreshHiddenInfo()}};const showLogs=()=>{normal.hidden=true;dev.hidden=true;logs.hidden=false;nt.classList.remove("active");dt.classList.remove("active");lt.classList.add("active");renderDebugLogs()};const during=document.querySelector("#devDuringMulligan"),back=document.querySelector("#devReturnMulligan");const refreshMulliganAccess=()=>{const active=state.phase==="mulligan"&&!!currentRoom;during?.classList.toggle("visible",active&&!devToolsOpenDuringMulligan);if(active&&!devToolsOpenDuringMulligan)show(false)};during?.addEventListener("click",()=>{devToolsOpenDuringMulligan=true;show(true);renderMulliganOverlay()});back?.addEventListener("click",()=>{devToolsOpenDuringMulligan=false;show(false);renderMulliganOverlay()});nt?.addEventListener("click",()=>show(false));dt?.addEventListener("click",()=>show(true));lt?.addEventListener("click",showLogs);document.querySelector("#devSourcePlayer")?.addEventListener("change",devRefreshCardOptions);document.querySelector("#devSourceZone")?.addEventListener("change",devRefreshCardOptions);
document.querySelector("#devMoveCard")?.addEventListener("click",()=>{const sp=Number(document.querySelector("#devSourcePlayer").value),sz=document.querySelector("#devSourceZone").value,id=document.querySelector("#devSourceCard").value,dp=Number(document.querySelector("#devDestPlayer").value),dz=document.querySelector("#devDestZone").value,src=state.players[sp]?.[sz],dest=state.players[dp]?.[dz];if(!id||!Array.isArray(src)||!Array.isArray(dest))return log("移動元・移動先を確認してください",false);const i=src.findIndex(c=>c.id===id);if(i<0)return log("選択したカードが見つかりません",false);activateDevLocalMode();const c=src.splice(i,1)[0];c.tapped=false;c.faceUp=dz!=="facedown";c.revealed=dz==="hand"&&!!c.revealed;if(dz==="discard"){c.damage=0;c.modification=0;c.counters=0}if(dz==="field")dest.splice(0,dest.length);dest.push(c);state.selected=null;render();devRefreshCardOptions();devRefreshHiddenInfo();log("開発用：カードを制限を無視して移動しました",false)});
const setTurn=p=>{activateDevLocalMode();state.turnPlayer=p;state.phase="playing";state.pendingDiscardPlayer=null;state.pendingDiscardReason=null;state.pendingDrawCount=0;state.gameOver=null;state.mulligan[1].done=true;state.mulligan[2].done=true;render();log("開発用："+(p===1?"自分":"相手")+"のターンに設定しました",false)};document.querySelector("#devTurnSelf")?.addEventListener("click",()=>setTurn(1));document.querySelector("#devTurnOpponent")?.addEventListener("click",()=>setTurn(2));document.querySelector("#devTurnNext")?.addEventListener("click",()=>setTurn(state.turnPlayer===1?2:1));document.querySelector("#devMulliganSelf")?.addEventListener("click",()=>devSkipMulligan(1));document.querySelector("#devMulliganOpponent")?.addEventListener("click",()=>devSkipMulligan(2));document.querySelector("#devRevealOpponent")?.addEventListener("click",()=>{activateDevLocalMode();state.players[2].hand.forEach(c=>{if(c.name){c.faceUp=true;c.revealed=true}});state.players[2].facedown.forEach(c=>{c.faceUp=true});render();devRefreshHiddenInfo();log("開発用：手元に存在する相手カード情報を表示しました。未受信のカード名は表示できません",false)})}
function setup(){
  setupPreparationScreen();
  document.querySelector("#deckViewerClose").onclick=closeDeckViewer;
  const mulliganButton=document.querySelector("#mulliganAgain");if(mulliganButton)mulliganButton.onclick=doMulligan;
  const mulliganKeep=document.querySelector("#mulliganKeep");if(mulliganKeep)mulliganKeep.onclick=finishMulligan;
  setupDevTools();
  setupDebugLogControls();
  document.addEventListener("click",e=>{const v=document.querySelector("#discardViewer");if(v&&!v.hidden&&!e.target.closest("#discardViewer .discard-viewer-panel")&&!e.target.closest(".player .other .zone:nth-child(2)"))closeDiscardViewer()});
  document.querySelector("#discardViewer").onclick=e=>{if(e.target===document.querySelector("#discardViewer"))closeDiscardViewer()};
  document.querySelector("#deckEdit").onclick=()=>{state.players[1].deckList=state.savedDeck.slice();document.querySelector("#deckEditor").hidden=false;const search=document.querySelector("#deckCardSearch");if(search)search.value="";renderDeckEditor()};
  document.querySelector("#deckCardSearch").oninput=()=>renderDeckEditor();
  document.querySelector("#deckCodeCreate").onclick=()=>{const input=document.querySelector("#deckCodeInput");input.value=makeDeckCode(state.players[1].deckList||[]);input.focus();input.select();log("デッキコードを発行しました")};
  document.querySelector("#deckCodeLoad").onclick=()=>{try{const deck=readDeckCode(document.querySelector("#deckCodeInput").value);state.players[1].deckList=deck;state.players[1].deckList.sort((a,b)=>cardNames.indexOf(a)-cardNames.indexOf(b));renderDeckEditor();const b=document.querySelector("#deckCodeLoad");b.textContent="複製しました";b.classList.add("loaded");clearTimeout(state.deckLoadTimer);state.deckLoadTimer=setTimeout(()=>{b.textContent="コードから複製";b.classList.remove("loaded")},1200);log("デッキコードからデッキを複製しました")}catch(e){alert(e.message)}};
  document.querySelector("#deckClearAll").onclick=()=>{const deck=state.players[1].deckList||[];if(!deck.length)return;if(!confirm("現在のデッキのカードをすべて除きますか？"))return;state.players[1].deckList=[];renderDeckEditor();log("デッキのカードをすべて除きました")};
  document.querySelector("#deckSave").onclick=()=>{state.savedDeck=(state.players[1].deckList||[]).slice();updatePreparationDeckSummary();const b=document.querySelector("#deckSave");b.textContent="保存しました";b.classList.add("saved");clearTimeout(state.deckSaveTimer);state.deckSaveTimer=setTimeout(()=>{b.textContent="デッキを保存";b.classList.remove("saved")},1200);log("デッキを保存しました")};
  document.querySelector("#deckEditBack").onclick=()=>{const current=state.players[1].deckList||[],saved=state.savedDeck||[],same=current.length===saved.length&&current.every((name,i)=>name===saved[i]);if(!same&&!confirm("デッキの内容が保存されていません。保存せずに戻りますか？"))return;document.querySelector("#deckEditor").hidden=true;updatePreparationDeckSummary()};
  document.querySelectorAll("[data-end]").forEach(b=>b.onclick=endTurn);
  const tapAllEnergyButton=document.querySelector("#tapAllEnergy");if(tapAllEnergyButton)tapAllEnergyButton.onclick=()=>{if(state.turnPlayer!==1||state.phase!=="playing"||state.pendingDiscardPlayer!==null)return log("今はエネルギーをタップできません");const untapped=state.players[1].energy.filter(e=>!e.tapped);if(!untapped.length)return log("タップできるエネルギーがありません");untapped.forEach(e=>e.tapped=true);state.players[1].energyPool=(state.players[1].energyPool||0)+untapped.length;broadcastEnergyPool();render();log("エネルギーを"+untapped.length+"枚タップしました（使用可能エネルギー +"+untapped.length+"）")};
  const leaveRoomButton=document.querySelector("#leaveRoom");if(leaveRoomButton)leaveRoomButton.onclick=surrender;
  document.querySelector("#waitingSurrender").onclick=requestRoomExit;
  document.querySelector("#exitAfterGame").onclick=requestRoomExit;
  document.querySelector("#cancelRematch").onclick=requestRoomExit;
  document.querySelector("#requestRematch").onclick=requestRematch;
  document.querySelector("#returnToGameOver").onclick=()=>{state.phase="finished";render()};
  document.querySelectorAll("[data-first]").forEach(b=>b.onclick=()=>{
    const q=b.dataset.first;
    const target=q==="self"?"player1":q==="opponent"?"player2":(Math.random()<.5?"player1":"player2");
    if(onlinePlayerId!==null){
      if(!gameSocket||gameSocket.readyState!==WebSocket.OPEN)return log("オンラインサーバーに接続されていません");
      gameSocket.send(JSON.stringify({type:"operation",action:"set_first_player",target}));
      return;
    }
    state.turnPlayer=target==="player1"?1:2;
    render();
    log("先攻: "+state.players[state.turnPlayer].name);
  });
  document.addEventListener("contextmenu",ev=>{const card=ev.target.closest(".card");if(!card)return;const p=Number(card.dataset.player),z=card.dataset.zone,id=card.dataset.cardId;if(p!==1||(z!=="monsters"&&z!=="energy"&&z!=="facedown")||!id)return;ev.preventDefault();ev.stopPropagation();const target=find(p,z,id);if(!target)return;if(z==="facedown"){target.faceUp=target.faceUp===false;target.revealed=false}else toggleCardTap(p,z,target);state.selected={p,z,id};render()});
  document.querySelector("#rename").onclick=()=>{
    const n=document.querySelector("#name").value.trim();if(!n)return;
    if(onlinePlayerId!==null){
      if(!gameSocket||gameSocket.readyState!==WebSocket.OPEN)return log("オンラインサーバーに接続されていません");
      gameSocket.send(JSON.stringify({type:"operation",action:"set_name",name:n.slice(0,16)}));
    }else{
      state.players[1].name=n.slice(0,16);
      render();
      log("名前を変更しました");
    }
  };
  document.querySelector("#reset").onclick=()=>{if(confirm("自分の盤面をリセットしますか？")){const n=state.players[1].name;const deckList=(state.savedDeck||[]).slice();const p=newPlayer(n,"p1");const pool=shuffle((deckList.length?deckList:p.deckList).slice());p.deckList=pool.slice();p.hand=pool.slice(0,7).map((name,i)=>newCard(name,"p1h"+i));p.deck=pool.slice(7).map((name,i)=>newCard(name,"p1d"+i));state.players[1]=p;state.selected=null;state.pendingDiscardPlayer=null;state.pendingDiscardReason=null;state.pendingDrawCount=0;state.gameOver=null;state.phase="mulligan";state.mulligan={1:{count:0,done:false},2:{count:0,done:false}};lastPublicState=null;render();log("自分の盤面をリセットし、シャッフルしてマリガンを開始しました")}};
}
async function start(){
  ensureDiscardWarning();
  const [namesResponse,cardsResponse]=await Promise.all([fetch(CARD_NAMES_URL),fetch("data/cards.json")]);
  cardNames=(await namesResponse.text()).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const cardData=await cardsResponse.json();cardDatabase=Array.isArray(cardData.cards)?cardData.cards:[];
  cardDataByName=new Map();for(const card of cardDatabase){if(typeof card.name==="string"&&!cardDataByName.has(card.name))cardDataByName.set(card.name,card);}
  state.players={1:newPlayer("プレイヤー1","p1"),2:newPlayer("プレイヤー2","p2")};
  const defaultDeck=readDeckCode("D2-AFoTAJsBARYEAVUEAYgBAd0EAd4CAd8DAfEEAoUEApgE");
  const p1=state.players[1];p1.deckList=defaultDeck.slice();const shuffledDeck=shuffle(defaultDeck.slice());p1.hand=shuffledDeck.slice(0,7).map((n,i)=>newCard(n,"p1h"+i));p1.deck=shuffledDeck.slice(7).map((n,i)=>newCard(n,"p1d"+i));state.savedDeck=defaultDeck.slice();
  // Reloads always start at the preparation screen; stale match state is not restored.
  setup();render();log("カード画像を読み込みました（"+cardNames.length+"種類）");
  const hasRoom=setupRoomLobby();
  if(hasRoom){showPreparationScreen();}
  else{const lobby=document.querySelector("#roomLobby");if(lobby)lobby.hidden=true;showPreparationScreen();}
}
start().catch(e=>{console.error(e);document.querySelector("#log").textContent="カード一覧の読み込みに失敗しました。";});
