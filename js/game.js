const SERVER_WS_BASE="wss://card-game-server-test.original-card-game-dev.workers.dev";
let currentRoom="";
let gameSocket=null;
let onlinePlayerId=null;
let roomPlayerCount=0;
let lastPublicState=null;
let applyingPublicState=false;

function getPublicState(){
  const x=state.players[1];
  return {life:x.life,handCount:x.hand.length,handIds:x.hand.map(c=>c.id),deckCount:x.deck.length,deckCounters:x.deckCounters||0,deckHorizontal:!!x.deckHorizontal,facedownCount:x.facedown.length,revealedHand:x.hand.filter(c=>c.revealed).map(c=>({id:c.id,name:c.name,faceUp:true,revealed:true})),facedownPublic:x.facedown.filter(c=>c.faceUp!==false),monsters:x.monsters,energy:x.energy,field:x.field,discard:x.discard,pendingDiscard:state.pendingDiscardPlayer===1,gameOver:state.gameOver||null,energyPool:x.energyPool||0,mulliganCount:state.mulligan[1].count,mulliganDone:state.mulligan[1].done,phase:state.phase};
}
function sendPublicState(){
  if(applyingPublicState||!onlinePlayerId||!gameSocket||gameSocket.readyState!==WebSocket.OPEN)return;
  const publicState=JSON.stringify(getPublicState());
  if(publicState===lastPublicState)return;
  lastPublicState=publicState;
  gameSocket.send(JSON.stringify({type:"operation",action:"sync_public_state",state:JSON.parse(publicState)}));
}
function applyPublicState(playerId,publicState){
  if(!onlinePlayerId||playerId===onlinePlayerId||!publicState)return;
  const opponentId=onlinePlayerId==="player1"?"player2":"player1";
  if(playerId!==opponentId)return;
  const x=state.players[2];
  state.gameOver=publicState.gameOver&&typeof publicState.gameOver==="object"?publicState.gameOver:null;
  x.life=Number.isFinite(publicState.life)?publicState.life:x.life;
  if(state.pendingDiscardPlayer!==1)state.pendingDiscardPlayer=publicState.pendingDiscard===true?2:null;
  const handCount=Number.isInteger(publicState.handCount)&&publicState.handCount>=0?publicState.handCount:0;
  const handIds=Array.isArray(publicState.handIds)?publicState.handIds:[];
  x.hand=Array.from({length:handCount},(_,i)=>{const card=newCard("",typeof handIds[i]==="string"?handIds[i]:playerId+"h"+i);card.faceUp=false;return card});
  if(Array.isArray(publicState.revealedHand))publicState.revealedHand.forEach((card,i)=>{if(!card||typeof card.id!=="string")return;const target=x.hand.find(c=>c.id===card.id)||x.hand[i];if(!target)return;target.id=card.id;target.name=typeof card.name==="string"?card.name:"";target.faceUp=true;target.revealed=true});
  x.deckCounters=Number.isFinite(publicState.deckCounters)?publicState.deckCounters:0;
  x.deckHorizontal=!!publicState.deckHorizontal;
  x.monsters=Array.isArray(publicState.monsters)?publicState.monsters:[];
  x.energy=Array.isArray(publicState.energy)?publicState.energy:[];
  x.field=Array.isArray(publicState.field)?publicState.field:[];
  x.discard=Array.isArray(publicState.discard)?publicState.discard:[];
  const deckCount=Number.isInteger(publicState.deckCount)&&publicState.deckCount>=0?publicState.deckCount:0;
  x.deck=Array.from({length:deckCount},(_,i)=>newCard("",playerId+"d"+i));
  x.facedown=Array.from({length:Math.max(0,Number(publicState.facedownCount)||0)},(_,i)=>{const card=newCard("",playerId+"f"+i);card.faceUp=false;return card});
  if(Array.isArray(publicState.facedownPublic))publicState.facedownPublic.forEach(card=>{if(!card||typeof card.id!=="string")return;const target=x.facedown.find(c=>c.id===card.id)||x.facedown.find(c=>c.faceUp===false);if(!target)return;target.id=card.id;target.name=typeof card.name==="string"?card.name:"";target.faceUp=true});
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

function normalizeRoomCode(value){return String(value||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6)}
function createRoomCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let code="";for(let i=0;i<6;i++)code+=chars[Math.floor(Math.random()*chars.length)];return code}
function enterRoom(room){
  const code=normalizeRoomCode(room);
  if(code.length!==6){const m=document.querySelector("#roomMessage");if(m)m.textContent="6文字のルームIDを入力してください";return false}
  currentRoom=code;
  const url=new URL(location.href);url.searchParams.set("room",code);history.replaceState(null,"",url);
  const lobby=document.querySelector("#roomLobby");if(lobby)lobby.hidden=true;
  const status=document.querySelector("#roomStatus");if(status)status.textContent="ルーム: "+code;
  connectGameServer();
  return true;
}
function setupRoomLobby(){
  const params=new URLSearchParams(location.search);
  const room=normalizeRoomCode(params.get("room"));
  const lobby=document.querySelector("#roomLobby");
  const create=document.querySelector("#roomCreate");
  const input=document.querySelector("#roomInput");
  const join=document.querySelector("#roomJoin");
  if(create)create.onclick=()=>enterRoom(createRoomCode());
  if(join)join.onclick=()=>enterRoom(input?.value);
  if(input)input.onkeydown=e=>{if(e.key==="Enter")enterRoom(input.value)};
  if(room.length===6){
    currentRoom=room;
    if(lobby)lobby.hidden=true;
    const status=document.querySelector("#roomStatus");if(status)status.textContent="ルーム: "+room;
    return true;
  }
  if(lobby)lobby.hidden=false;
  return false;
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
    gameSocket.onopen=()=>log("オンラインサーバーに接続しました");
    gameSocket.onmessage=e=>{
      try{
        const message=JSON.parse(e.data);
        if(message.type==="joined"){
          onlinePlayerId=message.playerId;
          applyOnlinePlayers(message.players);
          if(message.turnPlayer==="player1"||message.turnPlayer==="player2")state.turnPlayer=message.turnPlayer===onlinePlayerId?1:2;
          render();
          log("オンラインルームに参加しました（"+message.playerId+"）");
        }
        else if(message.type==="operation"&&message.action==="mulligan_update"){
          if(message.playerId!==onlinePlayerId){state.mulligan[2].count=Number.isInteger(message.count)?message.count:0;state.mulligan[2].done=message.done===true;if(state.mulligan[1].done&&state.mulligan[2].done&&state.phase!=="playing"){state.phase="playing";if(state.turnPlayer===1)startTurn(1);else render()}else render();}
        }
        else if(message.type==="operation"&&message.action==="energy_pool"){
          if(message.playerId!==onlinePlayerId){state.players[2].energyPool=Number.isFinite(message.value)?message.value:0;render();}
        }
        else if(message.type==="operation"&&message.action==="effect_delta"){
          if(message.playerId!==onlinePlayerId)applyEffectDelta(message);
        }
        else if(message.type==="public_state"){
          applyPublicState(message.playerId,message.state);
          applyingPublicState=true;
          render();
          applyingPublicState=false;
        }
        else if(message.type==="card_move"){
          applyRemoteMove(message.playerId,message.zone,message.dest,message.cardId);
        }
        else if(message.type==="log"){const text=message.playerId===onlinePlayerId?message.text:String(message.text||"").replaceAll("自分",state.players[2].name);log(text,false)}
        else if(message.type==="player_left"){log("対戦相手が退出しました",false)}
        else if(message.type==="room_status"){roomPlayerCount=Number.isInteger(message.playerCount)?message.playerCount:0;render()}
        else if(message.type==="player_joined"||message.type==="player_names"){
          applyOnlinePlayers(message.players);
          render();
          if(message.type==="player_joined")log("対戦相手が参加しました");
          else log("プレイヤー名を更新しました");
        }
        else if(message.type==="first_player_set"){
          state.turnPlayer=message.turnPlayer===onlinePlayerId?1:2;
          render();
          log("先攻: "+state.players[state.turnPlayer].name,false);
        }
        else if(message.type==="turn_changed"){
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
    gameSocket.onerror=()=>log("オンラインサーバーへの接続に失敗しました");
    gameSocket.onclose=e=>{if(e.code!==1000)log("オンラインサーバーとの接続が切れました")};
  }catch(e){console.error(e);log("オンラインサーバーへの接続を開始できませんでした")}
}

const MAX={hand:9,monsters:7,energy:18,field:1,facedown:3};
const CARD_NAMES_URL="all_card_names.txt";
const CARD_IMAGE_BASE="https://raw.githubusercontent.com/Omezi42/AnokoroImageFolder/main/images/captured_cards/";
const CROPPED_CARD_IMAGE_BASE="https://raw.githubusercontent.com/Omezi42/AnokoroImageFolder/main/images/cropped_cards/";

const state={turnPlayer:1,selected:null,deckInspectId:null,discardInspectId:null,discardInspectPlayer:1,pendingDiscardPlayer:null,gameOver:null,players:{},savedDeck:[],deckSaveTimer:null,deckLoadTimer:null,phase:"mulligan",mulligan:{1:{count:0,done:false},2:{count:0,done:false}}};
let cardNames=[];
let cardDatabase=[];
let cardDataByName=new Map();

function imageUrl(name){return CARD_IMAGE_BASE+encodeURIComponent(name)+".png";}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a;}
function newCard(name,id){const data=cardDataByName.get(name)||null;return{id,name,faceUp:true,revealed:false,tapped:false,counters:0,damage:0,modification:0,power:Number.isFinite(data?.power)?data.power:0,cardDataId:data?.id||null};}
function saveLocalGameState(){
  try{
    localStorage.setItem("originalCardGameLocalStateDev",JSON.stringify({room:currentRoom||new URLSearchParams(location.search).get("room")||"",player:state.players[1],turnPlayer:state.turnPlayer,pendingDiscardPlayer:state.pendingDiscardPlayer,gameOver:state.gameOver,phase:state.phase,mulligan:state.mulligan}));
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
    state.gameOver=saved.gameOver&&typeof saved.gameOver==="object"?saved.gameOver:null;
    return true;
  }catch(e){return false}
}
function newPlayer(name,p){
  const pool=shuffle([...cardNames]).slice(0,50);
  return{name,life:4000,energyPool:0,deckCounters:0,deckList:pool.slice(),hand:pool.slice(0,7).map((n,i)=>newCard(n,p+"h"+i)),monsters:[],energy:[],field:[],discard:[],facedown:[],deck:pool.slice(7).map((n,i)=>newCard(n,p+"d"+i))};
}
function log(s,sendOnline=true){const e=document.querySelector("#log"),d=new Date().toLocaleTimeString("ja-JP"),html='<div>['+d+'] '+esc(s)+"</div>";e.insertAdjacentHTML("beforeend",html);e.scrollTop=e.scrollHeight;const v=document.querySelector("#deckViewerLog");if(v){v.insertAdjacentHTML("beforeend",html);v.scrollTop=v.scrollHeight}if(sendOnline&&onlinePlayerId&&gameSocket&&gameSocket.readyState===WebSocket.OPEN)gameSocket.send(JSON.stringify({type:"operation",action:"log",text:String(s).slice(0,200)}))}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function closeDiscardViewer(){const v=document.querySelector("#discardViewer");if(v)v.hidden=true;state.discardInspectId=null}
function openDiscardViewer(p=1){state.discardInspectPlayer=p;const cards=state.players[p]?.discard||[];const top=cards.length?cards[cards.length-1]:null;state.discardInspectId=top?top.id:null;state.selected=top?{p,z:"discard",id:top.id}:null;renderDiscardViewer();const v=document.querySelector("#discardViewer");if(v)v.hidden=false;render()}
function renderDiscardViewer(){
  const list=document.querySelector("#discardViewerList"),actions=document.querySelector("#discardViewerActions");if(!list||!actions)return;
  const p=state.discardInspectPlayer||1,x=state.players[p],cards=x.discard||[];list.innerHTML="";actions.innerHTML="";
  if(!cards.length){list.innerHTML='<div class="deck-viewer-empty">捨て札がありません</div>';return}
  cards.forEach(c=>{const e=document.createElement("div");e.className="discard-viewer-card"+(state.discardInspectId===c.id?" selected":"");const img=document.createElement("img");img.src=imageUrl(c.name);img.alt=c.name;img.loading="lazy";img.onerror=()=>{img.replaceWith(document.createTextNode(c.name))};e.appendChild(img);e.onclick=ev=>{ev.stopPropagation();state.discardInspectId=c.id;state.selected={p,z:"discard",id:c.id};renderDiscardViewer();render()};list.appendChild(e)});
  const selected=cards.find(c=>c.id===state.discardInspectId)||cards[cards.length-1];
  state.discardInspectId=selected.id;
}function moveInspectedDiscardCard(dest){if(state.pendingDiscardPlayer!==null)return log("強制捨て中は捨て札からカードを移動できません");const x=state.players[state.discardInspectPlayer||1],i=x.discard.findIndex(c=>c.id===state.discardInspectId);if(i<0)return;if(MAX[dest]!==undefined&&x[dest].length>=MAX[dest])return log(dest+" の上限のため移動をキャンセル");const c=x.discard.splice(i,1)[0];c.faceUp=dest==="facedown"?false:true;x[dest].push(c);log("捨て札から "+c.name+" を "+({"deck":"山札","hand":"手札","monsters":"モンスター","energy":"エネルギー","field":"フィールド","facedown":"罠"}[dest])+" へ移動しました");state.discardInspectId=null;render();renderDiscardViewer()}
function render(){
  const localPlayer=1;
  saveLocalGameState();
  applyOnlinePlayers();
  for(const p of[1,2]){
    const x=state.players[p];
    document.querySelector("#p"+p+"-name").textContent=x.name;
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
    if(x.deck.length)deck.onclick=()=>{state.selected={p,z:"deck",id:"deck"};render()};
    deck.classList.toggle("back",!!x.deck.length);
    deck.classList.toggle("horizontal",!!x.deckHorizontal);
    zone(p,"energy",x.energy);
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
  const revealedStatus=document.querySelector("#revealedStatus");
  if(revealedStatus){
    let statusText="カードを選択してください";
    const selected=state.selected;
    if(selected&&selected.p===1&&selected.z==="hand"){
      const selectedCard=state.players[1].hand.find(v=>v.id===selected.id);
      if(selectedCard)statusText=selectedCard.revealed?"公開中":"非公開";
    }
    revealedStatus.textContent=statusText;
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
  else{const img=document.createElement("img");img.src=(z==="energy"?CROPPED_CARD_IMAGE_BASE:CARD_IMAGE_BASE)+encodeURIComponent(c.name)+".png"+(z==="energy"?"?energyv=3":"");img.alt=c.name;img.loading="lazy";img.onerror=()=>{img.replaceWith(document.createTextNode(c.name))};e.appendChild(img);const a=c.modification-c.damage;if(a)e.insertAdjacentHTML("beforeend",'<span class="adjust">'+(a>0?"+":"")+a+"</span>");if(c.counters)e.insertAdjacentHTML("beforeend",'<span class="counter">'+c.counters+"</span>")}
  if(c.revealed){const mark=document.createElement("span");mark.className="revealed-marker";mark.textContent="!";e.appendChild(mark)}
  e.dataset.player=String(p);e.dataset.zone=z;e.dataset.cardId=c.id;
  if(state.pendingDiscardPlayer!==null){
    if(state.pendingDiscardPlayer===1&&p===1&&z==="hand")e.onclick=()=>select(p,z,c.id);
    else e.onclick=()=>select(p,z,c.id);
  }else e.onclick=()=>select(p,z,c.id);
  return e;
}
function find(p,z,id){return state.players[p][z].find(c=>c.id===id)}
function select(p,z,id){const c=find(p,z,id);if(!c)return;state.selected={p,z,id};render()}
function renderCardInfo(card,visible){
 const box=document.querySelector("#cardInfo");if(!box)return;box.innerHTML="";
 if(!visible||(card.faceUp===false&&state.selected?.p!==1)){box.textContent="裏向きのカード";return}
 const d=cardDefinition(card);if(!d){box.textContent=card.name||"カード情報なし";return}
 const title=document.createElement("div");title.className="card-info-name";title.textContent=d.name||card.name;box.appendChild(title);
 const fields=[["種類",String(d.tags||"").replace(/#/g,"")],["コスト",d.cost===null||d.cost===undefined?"—":String(d.cost)],["タイプ",d.types||"—"],["HP",d.power===null||d.power===undefined?"—":String(d.power)],["効果",d.effect_text||"効果なし"],["フレーバー",d.lore||"—"]];
 for(const [label,value] of fields){const row=document.createElement("div");row.className="card-info-row";const key=document.createElement("b");key.textContent=label+"：";const val=document.createElement("span");val.textContent=value;row.append(key,val);box.appendChild(row)}
}
function selection(){
  const pr=document.querySelector("#preview"),op=document.querySelector("#ops");
  if(!state.selected){pr.innerHTML="カードを選択";op.textContent="カードを選択してください";const info=document.querySelector("#cardInfo");if(info)info.textContent="カードを選択してください";return}
  const s=state.selected;
  if(s.z==="deck"){pr.textContent="山札";const info=document.querySelector("#cardInfo");if(info)info.textContent="山札の内容は「山札を確認」から確認できます";op.innerHTML="";if(s.p!==1){op.innerHTML="";return}add("山札を確認",()=>openDeckViewer());if(state.pendingDiscardPlayer!==null)return;add("1枚引く",()=>drawCards(1));add("好きな枚数を引く",()=>{const n=Number(prompt("引く枚数を入力してください"));if(Number.isInteger(n)&&n>0)drawCards(n)});const deckSpacer=document.createElement("div");deckSpacer.style.height="12px";op.appendChild(deckSpacer);addCounterControls(op,state.players[1],"deckCounters");add("山札を横向きにする",()=>{state.players[1].deckHorizontal=!state.players[1].deckHorizontal;state.selected=null;render()});add("山札をシャッフルする",()=>{shuffle(state.players[1].deck);state.selected=null;render();log("山札をシャッフルしました")});return}
  const c=find(s.p,s.z,s.id);if(!c){state.selected=null;return render()}
  renderCardInfo(c,s.p===1||c.faceUp!==false);
  const pendingLocked=state.pendingDiscardPlayer!==null;
  pr.innerHTML="";
  if(c.faceUp!==false||(s.p===1&&s.z==="facedown")){const img=document.createElement("img");img.src=imageUrl(c.name);img.alt=c.name;img.onerror=()=>{img.replaceWith(document.createTextNode(c.name))};pr.appendChild(img);if(c.faceUp===false&&s.z==="facedown"){const name=document.createElement("div");name.textContent=c.name;name.style.marginTop="4px";pr.appendChild(name)}}else pr.textContent="裏向きのカード";
  op.innerHTML="";
  if(pendingLocked){
    if(s.p===state.pendingDiscardPlayer&&s.z==="hand"&&s.p===1){add("このカードを捨てる",()=>completePendingDiscard(1,s.id));return}
    op.textContent="カードを捨てるまで操作できません";return
  }
  if(s.p!==1){op.textContent="相手のカードは確認のみ";return}
  if(s.z==="monsters"||s.z==="energy")add("タップ / アンタップ",()=>{toggleCardTap(s.p,s.z,c);state.selected={p:s.p,z:s.z,id:c.id};render()});
  if(s.z==="energy"){const energySpacer=document.createElement("div");energySpacer.style.height="12px";document.querySelector("#ops").appendChild(energySpacer)}
  if(s.z==="monsters"){add("ダメージ / 回復",()=>openMonsterAdjust(c));add("ステータスを修正",()=>openMonsterStatusAdjust(c));addCounterControls(op,c,"counters");const monsterSpacer=document.createElement("div");monsterSpacer.style.height="12px";op.appendChild(monsterSpacer)}
  if(s.z==="field")addCounterControls(op,c,"counters");
  const destinations=[["hand","手札へ"],["monsters","モンスターへ"],["energy","エネルギーへ"],["discard","捨て札へ"],["field","フィールドへ"],["facedown","罠へ"],["deck","山札へ"]];
  if(s.z==="field")for(let i=destinations.length-1;i>=0;i--)if(["monsters","energy","facedown"].includes(destinations[i][0]))destinations.splice(i,1);
  if(s.z==="facedown"){const keep=new Set(["hand","discard","deck"]);for(let i=destinations.length-1;i>=0;i--)if(!keep.has(destinations[i][0]))destinations.splice(i,1)}
  if(s.z==="energy"){for(let i=destinations.length-1;i>=0;i--)if(!["hand","discard","deck"].includes(destinations[i][0]))destinations.splice(i,1);}
  if(s.z==="monsters"){destinations.splice(2,1);destinations.splice(3,1)}
  for(const[z,label]of destinations)if(z!==s.z&&!(s.z==="monsters"&&z==="facedown"))add(label,()=>move(z));
  if(s.z==="facedown"){const spacer=document.createElement("div");spacer.style.height="12px";op.appendChild(spacer);add(c.faceUp===false?"表向きにする":"裏向きにする",()=>{c.faceUp=c.faceUp===false;c.revealed=false;state.selected={p:s.p,z:s.z,id:c.id};render()})}
  if(s.z==="hand"){const spacer=document.createElement("div");spacer.style.height="12px";op.appendChild(spacer);if(state.phase==="playing"&&s.p===1)add("このカードを使用 / セット",()=>playCardFromHand(c.id));if(c.revealed)add("公開をやめる",()=>{c.revealed=false;state.selected={p:s.p,z:s.z,id:c.id};render()});else add("相手に公開する",()=>{c.revealed=true;c.faceUp=true;state.selected={p:s.p,z:s.z,id:c.id};render()});add("手札を全て公開",()=>{state.players[1].hand.forEach(card=>{card.revealed=true;card.faceUp=true});state.selected={p:s.p,z:s.z,id:c.id};render();log("手札を全て公開しました")})}
}
function openMonsterAdjust(c){const modal=document.querySelector("#monsterAdjustModal"),input=document.querySelector("#monsterAdjustInput");modal.hidden=false;input.value="";input.focus();const close=()=>{modal.hidden=true};const apply=(action)=>{const raw=input.value.trim();if(!raw){close();return}const n=Number(raw);if(!Number.isInteger(n)){log("ダメージ／回復の変更をキャンセルしました");close();return}const amount=Math.abs(n);if(action==="cancel"){close();return}if(action==="damage")c.damage+=amount;if(action==="heal")c.damage=Math.max(0,c.damage-amount);if(action==="change")c.modification=amount+c.damage;state.selected={p:1,z:"monsters",id:c.id};render();close()};modal.querySelectorAll("[data-monster-action]").forEach(b=>b.onclick=()=>apply(b.dataset.monsterAction));input.onkeydown=ev=>{if(ev.key!=="Enter")return;ev.preventDefault();const raw=input.value.trim();if(!raw)return;const n=Number(raw);if(!Number.isInteger(n)){log("ダメージ／回復の変更をキャンセルしました");close();return}apply(n>0&&raw.startsWith("+")?"heal":"damage")}}
function openMonsterStatusAdjust(c){const modal=document.querySelector("#monsterStatusModal"),input=document.querySelector("#monsterStatusInput");modal.hidden=false;input.value="";input.focus();const close=()=>{modal.hidden=true};const apply=(action)=>{const raw=input.value.trim();if(!raw){close();return}const n=Number(raw);if(!Number.isInteger(n)){log("ステータス修正の変更をキャンセルしました");close();return}const amount=Math.abs(n);if(action==="cancel"){close();return}if(action==="increase")c.modification+=amount;if(action==="decrease")c.modification-=amount;if(action==="change")c.modification=amount+c.damage;state.selected={p:1,z:"monsters",id:c.id};render();close()};modal.querySelectorAll("[data-monster-status-action]").forEach(b=>b.onclick=()=>apply(b.dataset.monsterStatusAction));input.onkeydown=ev=>{if(ev.key!=="Enter")return;ev.preventDefault();const raw=input.value.trim();if(!raw)return;const n=Number(raw);if(!Number.isInteger(n)){log("ステータス修正の変更をキャンセルしました");close();return}apply(n>0&&raw.startsWith("+")?"increase":"decrease")}}
function add(t,fn){const b=document.createElement("button");b.textContent=t;b.onclick=fn;document.querySelector("#ops").appendChild(b)}
function addCounterControls(parent,target,key){const row=document.createElement("div");row.className="counter-actions";const plus=document.createElement("button");plus.textContent="カウンター +1";plus.onclick=()=>{target[key]=(target[key]||0)+1;render()};const minus=document.createElement("button");minus.textContent="カウンター -1";minus.onclick=()=>{if((target[key]||0)===0)return log("カウンター減少をキャンセル");target[key]--;render()};row.append(plus,minus);parent.appendChild(row)}
function openDeckViewer(){state.deckInspectId=null;renderDeckViewer();const v=document.querySelector("#deckViewerLog"),l=document.querySelector("#log");if(v&&l){v.innerHTML=l.innerHTML;v.scrollTop=v.scrollHeight}document.querySelector("#deckViewer").hidden=false}
function closeDeckViewer(){state.deckInspectId=null;document.querySelector("#deckViewer").hidden=true}
function renderDeckViewer(){
  const list=document.querySelector("#deckViewerList"),actions=document.querySelector("#deckViewerActions"),preview=document.querySelector("#deckViewerPreview");if(!list||!actions||!preview)return;
  const x=state.players[1],deck=x.deck||[],displayDeck=[...deck].sort((a,b)=>cardNames.indexOf(a.name)-cardNames.indexOf(b.name));list.innerHTML="";actions.innerHTML="";preview.innerHTML="";
  if(!deck.length){list.innerHTML='<div class="deck-viewer-empty">山札がありません</div>';preview.textContent="カードを選択";return}
  displayDeck.forEach(c=>{const e=document.createElement("div");e.className="deck-viewer-card"+(state.deckInspectId===c.id?" selected":"");const img=document.createElement("img");img.src=imageUrl(c.name);img.alt=c.name;img.loading="lazy";img.onerror=()=>{img.replaceWith(document.createTextNode(c.name))};e.appendChild(img);e.onclick=()=>{state.deckInspectId=c.id;renderDeckViewer()};list.appendChild(e)});
  const c=displayDeck.find(v=>v.id===state.deckInspectId);if(!c){preview.textContent="カードを選択";return}
  const img=document.createElement("img");img.src=imageUrl(c.name);img.alt=c.name;img.onerror=()=>{img.replaceWith(document.createTextNode(c.name))};preview.appendChild(img);const name=document.createElement("div");name.className="deck-viewer-name";name.textContent=c.name;preview.appendChild(name);
  for(const[z,label]of[["hand","手札へ"],["hand","公開して手札へ"],["monsters","モンスターへ"],["energy","エネルギーへ"],["field","フィールドへ"],["facedown","罠へ"],["discard","捨て札へ"]]){const b=document.createElement("button");b.textContent=label;b.onclick=()=>moveInspectedDeckCard(z,label==="公開して手札へ");actions.appendChild(b)}
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
  if(onlinePlayerId!==null){
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

function drawCards(n,p=1){const x=state.players[p];if(x.hand.length+n>MAX.hand)return log("手札の上限のためドローをキャンセル");if(x.deck.length===0){const winner=p===1?2:1;state.gameOver={winner,reason:"deck_empty"};log(x.name+"は山札が0枚の状態でドローしようとしたため、"+state.players[winner].name+"の勝利です");return}if(x.deck.length<n)return log("山札が足りないためドローをキャンセル");for(let i=0;i<n;i++)x.hand.push(x.deck.shift());state.selected=null;render()}
function ensureDiscardWarning(){if(document.querySelector("#discardWarning"))return;const e=document.createElement("div");e.id="discardWarning";e.hidden=true;e.style.cssText="position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;background:#8b0000;color:#fff;padding:10px 18px;border:2px solid #f33;border-radius:6px;font-weight:700;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.45);";document.body.appendChild(e)}
function startTurn(p,showLog=true){if(state.phase!=="playing")return;const x=state.players[p];x.energyPool=0;if(p===1)broadcastEnergyPool();x.monsters.forEach(m=>m.tapped=false);x.energy.forEach(e=>e.tapped=false);if(x.deck.length===0){const winner=p===1?2:1;state.gameOver={winner,reason:"deck_empty"};render();log(x.name+"はターン開始時に山札が0枚だったため、"+state.players[winner].name+"の勝利です");return}if(x.deck.length&&x.hand.length>=MAX.hand){state.pendingDiscardPlayer=p;state.selected=null;render();log(x.name+"はドロー前に手札を1枚捨てる必要があります。手札のカードをクリックしてください");return}if(x.deck.length&&x.hand.length<MAX.hand)drawCards(1,p);resolveTurnTriggers(p,"start");render();if(showLog)log(x.name+" のターン開始")}
function completePendingDiscard(p,id){if(p!==1)return false;if(state.pendingDiscardPlayer!==p)return false;const x=state.players[p],i=x.hand.findIndex(c=>c.id===id);if(i<0)return true;const discarded=x.hand.splice(i,1)[0];x.discard.push(discarded);state.pendingDiscardPlayer=null;state.selected=null;log(x.name+"はドロー前に「"+discarded.name+"」を捨てました");if(x.deck.length&&x.hand.length<MAX.hand)drawCards(1,p);resolveTurnTriggers(p,"start");render();log(x.name+" のターン開始");return true}
function endTurn(){const localPlayer=1;if(state.turnPlayer!==localPlayer||state.pendingDiscardPlayer!==null||state.phase!=="playing")return;if(onlinePlayerId!==null){if(!gameSocket||gameSocket.readyState!==WebSocket.OPEN)return log("オンラインサーバーに接続されていません");resolveTurnTriggers(1,"end");state.players[1].monsters.forEach(m=>{m.damage=0});state.players[1].energyPool=0;broadcastEnergyPool();render();gameSocket.send(JSON.stringify({type:"operation",action:"end_turn"}));return}const p=state.turnPlayer,x=state.players[p];resolveTurnTriggers(p,"end");x.monsters.forEach(m=>{m.damage=0});x.energyPool=0;state.turnPlayer=p===1?2:1;startTurn(state.turnPlayer)}

function cardDefinition(cardOrName){return typeof cardOrName==="string"?cardDataByName.get(cardOrName)||null:cardDataByName.get(cardOrName?.name)||null}
function cardKind(card){const tag=String(cardDefinition(card)?.tags||"");if(tag.includes("#エネルギーカード"))return "energy";if(tag.includes("#フィールドカード"))return "field";if(tag.includes("#モンスターカード"))return "monster";if(tag.includes("#魔法カード"))return "spell";if(tag.includes("#罠カード"))return "trap";return "unknown"}
function cardCost(card){const value=cardDefinition(card)?.cost;if(typeof value==="number"&&Number.isFinite(value))return Math.max(0,value);if(typeof value==="string"&&/^\+?\d+$/.test(value))return Math.max(0,Number(value.replace("+","")));return 0}
function broadcastEnergyPool(){if(onlinePlayerId&&gameSocket?.readyState===WebSocket.OPEN)gameSocket.send(JSON.stringify({type:"operation",action:"energy_pool",value:state.players[1].energyPool||0}))}
function broadcastEffectDelta(delta){if(onlinePlayerId&&gameSocket?.readyState===WebSocket.OPEN)gameSocket.send(JSON.stringify({type:"operation",action:"effect_delta",...delta}))}
function applyEffectDelta(message){
 const actorIsLocal=message.playerId===onlinePlayerId;
 const targetPlayer=message.target==="ownLife"?(actorIsLocal?1:2):(actorIsLocal?2:1);
 if(message.target==="ownLife"||message.target==="opponentLife"){state.players[targetPlayer].life+=Number(message.delta)||0;checkLifeWinner(targetPlayer);render();return}
 if(message.target==="opponentMonsterDamage"){const c=state.players[targetPlayer].monsters.find(m=>m.id===message.cardId);if(c){c.damage=(c.damage||0)+(Number(message.delta)||0);checkMonsterDestruction(targetPlayer);render();return}}
 if(message.target==="opponentMonsterTap"){const c=state.players[targetPlayer].monsters.find(m=>m.id===message.cardId);if(c){c.tapped=true;render();return}}
 if(message.target==="opponentMill"){const x=state.players[targetPlayer];for(let i=0;i<Math.max(0,Number(message.count)||0)&&x.deck.length;i++)x.discard.push(x.deck.shift());render();return}
 if(message.target==="opponentMonsterDestroy"){const x=state.players[targetPlayer],c=x.monsters.find(m=>m.id===message.cardId);if(c){x.monsters=x.monsters.filter(m=>m.id!==c.id);moveToDiscard(targetPlayer,c,"効果による破壊");resolveCardTrigger(c,targetPlayer,"destroy");render()}}
}
function checkLifeWinner(p){if(state.players[p].life<=0){const winner=p===1?2:1;state.gameOver={winner,reason:"life_zero"};log(state.players[p].name+"のライフが0以下になったため、"+state.players[winner].name+"の勝利です")}}
function toggleCardTap(p,z,c){if(z==="energy"){const x=state.players[p],value=cardCost(c);if(!c.tapped)x.energyPool=(x.energyPool||0)+value;else x.energyPool=Math.max(0,(x.energyPool||0)-value);if(p===1)broadcastEnergyPool()}c.tapped=!c.tapped}
function renderMulliganOverlay(){
 const overlay=document.querySelector("#mulliganOverlay");if(!overlay)return;const lobby=document.querySelector("#roomLobby");overlay.hidden=state.phase!=="mulligan"||!currentRoom||!!(lobby&&!lobby.hidden);
 const own=state.mulligan[1],other=state.mulligan[2],status=document.querySelector("#mulliganStatus");
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
function checkMonsterDestruction(p,triggerEffects=true){const x=state.players[p];for(const m of [...x.monsters]){const base=Number(m.power)||Number(cardDefinition(m)?.power)||0;if(base+(Number(m.modification)||0)-(Number(m.damage)||0)<=0){x.monsters=x.monsters.filter(v=>v.id!==m.id);moveToDiscard(p,m,"HPが0以下");if(triggerEffects)resolveCardTrigger(m,p,"destroy");log("「"+m.name+"」はHPが0以下になり破壊されました")}}}
function drawEffectCards(p,n){const x=state.players[p];for(let i=0;i<Math.max(0,Math.floor(n));i++){if(!x.deck.length){const winner=p===1?2:1;state.gameOver={winner,reason:"deck_empty"};log(x.name+"は山札が0枚の状態でドローしようとしたため、"+state.players[winner].name+"の勝利です");break}if(x.hand.length>=MAX.hand){log(x.name+"の手札上限のため、追加ドローを止めました");break}x.hand.push(x.deck.shift())}}
function resolveCardTrigger(card,p,trigger){
 const data=cardDefinition(card);if(!data||!data.effect_text)return;const text=String(data.effect_text);
 const triggers={enter:"場に出た時",start:"自分のターン開始時",end:"自分のターン終了時",opponentStart:"相手のターン開始時",opponentEnd:"相手のターン終了時",destroy:"破壊時",attack:"攻撃時"};
 if(trigger!=="spell"&&trigger!=="trap"&&!text.includes(triggers[trigger]||"__never__"))return;
 const parts=text.split("。");
 const segment=trigger==="spell"?parts.filter(part=>!/^\s*\(\d+\)/.test(part)).join("。"):trigger==="trap"?parts.filter(part=>part.includes(triggers[trigger]||"__never__")).join("。"):parts.filter(part=>part.includes(triggers[trigger]||"__never__")).join("。");
 if(trigger==="spell"&&parts.some(part=>/^\s*\(\d+\)/.test(part)))log("追加エネルギーコスト付きの能力は、能力ごとの使用操作を追加するまで自動処理しません");
 if(segment)resolveEffectText(segment,p,card);
}
function resolveEffectText(text,p,sourceCard){
 const own=state.players[p],opp=state.players[p===1?2:1],s=String(text||"");let handled=false;
 if(s.includes("なら")){
  let known=false,met=true;
  if(s.includes("自分のモンスターが1体場にいるなら")){known=true;met=met&&own.monsters.length>0}
  for(const m of s.matchAll(/自分の(\d+)コスト以上の\[([^\]]+)\]が場にいるなら/g)){known=true;met=met&&own.monsters.some(c=>cardCost(c)>=Number(m[1])&&String(cardDefinition(c)?.types||"").includes(m[2]))}
  for(const m of s.matchAll(/自分のエネルギーが(\d+)枚以上場にあるなら/g)){known=true;met=met&&own.energy.length>=Number(m[1])}
  for(const m of s.matchAll(/相手の捨て札が(\d+)枚以上あるなら/g)){known=true;met=met&&opp.discard.length>=Number(m[1])}
  if(!known){log("未対応の条件付き効果（手動で処理してください）: "+s.slice(0,90));return}
  if(!met){log("効果の条件を満たしていません");return}
 }
 for(const m of s.matchAll(/自分は\s*(\d+)枚引く/g)){drawEffectCards(p,Number(m[1]));handled=true}
 for(const m of s.matchAll(/相手に\s*(\d+)ダメージ/g)){opp.life-=Number(m[1]);broadcastEffectDelta({target:"opponentLife",delta:-Number(m[1])});checkLifeWinner(p===1?2:1);handled=true;log(opp.name+"に"+m[1]+"ダメージ")}
 for(const m of s.matchAll(/自分を\s*(\d+)回復/g)){own.life+=Number(m[1]);broadcastEffectDelta({target:"ownLife",delta:Number(m[1])});handled=true;log(own.name+"は"+m[1]+"回復")}
 for(const m of s.matchAll(/相手のモンスター全てに\s*(\d+)ダメージ/g)){opp.monsters.forEach(mon=>{mon.damage=(mon.damage||0)+Number(m[1]);broadcastEffectDelta({target:"opponentMonsterDamage",cardId:mon.id,delta:Number(m[1])})});checkMonsterDestruction(p===1?2:1,false);handled=true}
 for(const m of s.matchAll(/これを\s*\+(\d+)/g)){if(sourceCard)sourceCard.modification=(sourceCard.modification||0)+Number(m[1]);handled=true}
 const ownBuff=s.match(/自分のモンスター(?:1体|1体まで)を\s*\+(\d+)/);
 if(ownBuff&&own.monsters[0]){own.monsters[0].modification=(own.monsters[0].modification||0)+Number(ownBuff[1]);handled=true}
 const counterAdd=s.match(/これにカウンター(\d+)個を乗せる/);
 if(counterAdd&&sourceCard){sourceCard.counters=(sourceCard.counters||0)+Number(counterAdd[1]);handled=true}
 if(/これのカウンターを0個にする/.test(s)&&sourceCard){sourceCard.counters=0;handled=true}
 if(/\(これをタップ\)/.test(s)&&sourceCard){sourceCard.tapped=true;handled=true}
 if(/相手のモンスター全てをタップ/.test(s)){opp.monsters.forEach(mon=>{mon.tapped=true;broadcastEffectDelta({target:"opponentMonsterTap",cardId:mon.id})});handled=true}
 if(/相手のモンスター(?:1体|1体まで)をタップ/.test(s)){const target=opp.monsters.find(m=>!m.tapped);if(target){target.tapped=true;broadcastEffectDelta({target:"opponentMonsterTap",cardId:target.id});handled=true;log("「"+target.name+"」をタップしました")}}
 const singleDamage=s.match(/(相手のモンスター|自分のモンスター|モンスター)(?:1体|1体まで)に\s*(\d+)ダメージ/);
 if(singleDamage){const targetPlayer=singleDamage[1].startsWith("相手")?(p===1?2:1):singleDamage[1].startsWith("自分")?p:(opp.monsters.length?(p===1?2:1):p);const target=state.players[targetPlayer].monsters[0];if(target){target.damage=(target.damage||0)+Number(singleDamage[2]);if(targetPlayer!==p)broadcastEffectDelta({target:"opponentMonsterDamage",cardId:target.id,delta:Number(singleDamage[2])});checkMonsterDestruction(targetPlayer,targetPlayer===p);handled=true}}
 if(/相手のモンスター1体を破壊|相手のモンスター1体までを破壊/.test(s)){const target=opp.monsters[0];if(target){opp.monsters=opp.monsters.filter(m=>m.id!==target.id);moveToDiscard(p===1?2:1,target,"効果による破壊");broadcastEffectDelta({target:"opponentMonsterDestroy",cardId:target.id});handled=true}}
 const search=s.match(/自分のデッキから(?:(\d+)コスト以下の)?(?:\[([^\]]+)\]の)?(モンスター|魔法|罠|フィールド|エネルギー)?(\d+)枚までを手札に加える/);
 if(search){const max=Number(search[4]),costLimit=search[1]===undefined?Infinity:Number(search[1]),type=search[3],element=search[2];for(let i=0;i<max;i++){const idx=own.deck.findIndex(c=>{const d=cardDefinition(c);if(!d||cardCost(c)>costLimit)return false;if(type&&!String(d.tags||"").includes(({モンスター:"#モンスターカード",魔法:"#魔法カード",罠:"#罠カード",フィールド:"#フィールドカード",エネルギー:"#エネルギーカード"})[type]))return false;if(element&&!String(d.types||"").includes(element))return false;return true});if(idx<0||own.hand.length>=MAX.hand)break;own.hand.push(own.deck.splice(idx,1)[0]);handled=true}if(handled)log(own.name+"は効果で山札からカードを手札に加えました")}
 const namedSearch=s.match(/自分の(デッキ|捨て札)から「([^」]+)」(\d+)枚までを手札に加える/);
 if(namedSearch){const source=namedSearch[1]==="デッキ"?own.deck:own.discard;for(let i=0;i<Number(namedSearch[3]);i++){const idx=source.findIndex(c=>c.name===namedSearch[2]);if(idx<0||own.hand.length>=MAX.hand)break;own.hand.push(source.splice(idx,1)[0]);handled=true}}
 const opponentMill=s.match(/相手のデッキの上(\d+)枚を捨てる/);
 if(opponentMill){const count=Number(opponentMill[1]);for(let i=0;i<count&&opp.deck.length;i++){opp.discard.push(opp.deck.shift())}broadcastEffectDelta({target:"opponentMill",count});handled=true}
 const ownMill=s.match(/自分のデッキの上(\d+)枚を捨てる/);
 if(ownMill){for(let i=0;i<Number(ownMill[1])&&own.deck.length;i++)own.discard.push(own.deck.shift());handled=true}
 if(/自分のフィールドカードを破壊|自分のフィールドを破壊/.test(s)&&own.field.length){moveToDiscard(p,own.field.shift(),"効果");handled=true}
 if(!handled)log("未対応の効果（手動で処理してください）: "+s.slice(0,90));
}
function resolveTurnTriggers(p,when){
 const x=state.players[p],phrase=({start:"自分のターン開始時",end:"自分のターン終了時",opponentStart:"相手のターン開始時",opponentEnd:"相手のターン終了時"})[when];
 for(const m of [...x.monsters])resolveCardTrigger(m,p,when);
 for(const f of [...x.field])resolveCardTrigger(f,p,when);
 for(const trap of [...x.facedown]){const d=cardDefinition(trap);if(!d?.effect_text||!String(d.effect_text).includes(phrase))continue;trap.faceUp=true;x.facedown=x.facedown.filter(c=>c.id!==trap.id);moveToDiscard(p,trap,"罠の自動発動");resolveCardTrigger({...trap,faceUp:true},p,when);log("罠「"+trap.name+"」が自動発動しました")}
}
function playCardFromHand(cardId){
 if(state.phase!=="playing"||state.pendingDiscardPlayer!==null)return;const x=state.players[1],idx=x.hand.findIndex(c=>c.id===cardId);if(idx<0)return;
 const card=x.hand[idx],kind=cardKind(card),cost=cardCost(card),effect=String(cardDefinition(card)?.effect_text||"");
 const requiredElement=effect.match(/自分の\[([^\]]+)\]のエネルギーが場に無い時使用できず場に出せない/);
 if(requiredElement&&!x.energy.some(e=>String(cardDefinition(e)?.types||"").includes(requiredElement[1])))return log("条件を満たしていないため「"+card.name+"」は使用できません");
 if(kind==="unknown")return log("カード種別を判定できないため使用できません: "+card.name);
 if(kind==="monster"&&x.monsters.length>=MAX.monsters)return log("モンスターゾーンが満杯です");
 if(kind==="energy"&&x.energy.length>=MAX.energy)return log("エネルギーゾーンが満杯です");
 if(kind==="trap"&&x.facedown.length>=MAX.facedown)return log("罠ゾーンが満杯です");
 if(["monster","spell","field"].includes(kind)&&!useEnergyCost(1,cost))return;
 x.hand.splice(idx,1);card.faceUp=true;card.revealed=false;
 if(kind==="monster"){card.power=Number(cardDefinition(card)?.power)||card.power||0;card.damage=0;card.modification=0;card.tapped=false;x.monsters.push(card);log(x.name+"は「"+card.name+"」を使用しました（コスト"+cost+"）");resolveCardTrigger(card,1,"enter")}
 else if(kind==="energy"){card.tapped=String(cardDefinition(card)?.effect_text||"").includes("タップして場に出る");x.energy.push(card);log(x.name+"は「"+card.name+"」をエネルギーに置きました");resolveCardTrigger(card,1,"enter")}
 else if(kind==="spell"){moveToDiscard(1,card,"魔法を使用");log(x.name+"は魔法「"+card.name+"」を使用しました（コスト"+cost+"）");resolveCardTrigger(card,1,"spell")}
 else if(kind==="trap"){card.faceUp=false;card.tapped=false;x.facedown.push(card);log(x.name+"は罠「"+card.name+"」をセットしました")}
 else if(kind==="field"){if(x.field.length)moveToDiscard(1,x.field.shift(),"新しいフィールドカードに置換");card.faceUp=true;x.field.push(card);log(x.name+"はフィールド「"+card.name+"」を使用しました（コスト"+cost+"）");resolveCardTrigger(card,1,"enter")}
 state.selected=null;checkMonsterDestruction(1);render();
}

function deckEditorCard(name){const e=document.createElement("div");e.className="deck-card";const img=document.createElement("img");img.src=imageUrl(name);img.alt=name;img.loading="lazy";img.onerror=()=>{img.remove()};e.appendChild(img);const n=document.createElement("div");n.className="deck-card-name";n.textContent=name;e.appendChild(n);e.onclick=()=>{const deck=state.players[1].deckList||[];deck.push(name);deck.sort((a,b)=>cardNames.indexOf(a)-cardNames.indexOf(b));state.players[1].deckList=deck;showDeckEditorPreview(name);renderDeckEditor()};e.oncontextmenu=ev=>{ev.preventDefault();ev.stopPropagation();showDeckEditorPreview(name)};return e}
function showDeckEditorPreview(name){
  const preview=document.querySelector("#deckEditorPreview");if(!preview)return;preview.innerHTML="";const img=document.createElement("img");img.src=CARD_IMAGE_BASE+encodeURIComponent(name)+".png";img.alt=name;img.loading="lazy";img.onerror=()=>{img.replaceWith(document.createTextNode(name))};preview.appendChild(img);const label=document.createElement("div");label.textContent=name;preview.appendChild(label);const controls=document.createElement("div");controls.className="deck-preview-controls";const plus=document.createElement("button");plus.type="button";plus.textContent="+1枚";plus.onclick=()=>addDeckEditorCards(name,1);const minus=document.createElement("button");minus.type="button";minus.textContent="−1枚";minus.onclick=()=>addDeckEditorCards(name,-1);const custom=document.createElement("button");custom.type="button";custom.textContent="指定した枚数を追加";custom.onclick=()=>{const input=prompt("追加する枚数を入力してください","1");if(input===null)return;const n=Number(input.trim());if(!Number.isInteger(n)||n<=0){alert("1以上の整数を入力してください");return}addDeckEditorCards(name,n)};controls.append(plus,minus,custom);preview.appendChild(controls)
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
function setup(){
  document.querySelector("#deckViewerClose").onclick=closeDeckViewer;
  const mulliganButton=document.querySelector("#mulliganAgain");if(mulliganButton)mulliganButton.onclick=doMulligan;
  const mulliganKeep=document.querySelector("#mulliganKeep");if(mulliganKeep)mulliganKeep.onclick=finishMulligan;
  document.addEventListener("click",e=>{const v=document.querySelector("#discardViewer");if(v&&!v.hidden&&!e.target.closest("#discardViewer .discard-viewer-panel")&&!e.target.closest(".player .other .zone:nth-child(2)"))closeDiscardViewer()});
  document.querySelector("#discardViewer").onclick=e=>{if(e.target===document.querySelector("#discardViewer"))closeDiscardViewer()};
  document.querySelector("#deckEdit").onclick=()=>{state.players[1].deckList=state.savedDeck.slice();document.querySelector("#deckEditor").hidden=false;const search=document.querySelector("#deckCardSearch");if(search)search.value="";renderDeckEditor()};
  document.querySelector("#deckCardSearch").oninput=()=>renderDeckEditor();
  document.querySelector("#deckCodeCreate").onclick=()=>{const input=document.querySelector("#deckCodeInput");input.value=makeDeckCode(state.players[1].deckList||[]);input.focus();input.select();log("デッキコードを発行しました")};
  document.querySelector("#deckCodeLoad").onclick=()=>{try{const deck=readDeckCode(document.querySelector("#deckCodeInput").value);state.players[1].deckList=deck;state.players[1].deckList.sort((a,b)=>cardNames.indexOf(a)-cardNames.indexOf(b));renderDeckEditor();const b=document.querySelector("#deckCodeLoad");b.textContent="複製しました";b.classList.add("loaded");clearTimeout(state.deckLoadTimer);state.deckLoadTimer=setTimeout(()=>{b.textContent="コードから複製";b.classList.remove("loaded")},1200);log("デッキコードからデッキを複製しました")}catch(e){alert(e.message)}};
  document.querySelector("#deckClearAll").onclick=()=>{const deck=state.players[1].deckList||[];if(!deck.length)return;if(!confirm("現在のデッキのカードをすべて除きますか？"))return;state.players[1].deckList=[];renderDeckEditor();log("デッキのカードをすべて除きました")};
  document.querySelector("#deckSave").onclick=()=>{state.savedDeck=(state.players[1].deckList||[]).slice();const b=document.querySelector("#deckSave");b.textContent="保存しました";b.classList.add("saved");clearTimeout(state.deckSaveTimer);state.deckSaveTimer=setTimeout(()=>{b.textContent="デッキを保存";b.classList.remove("saved")},1200);log("デッキを保存しました")};
  document.querySelector("#deckEditBack").onclick=()=>{const current=state.players[1].deckList||[],saved=state.savedDeck||[],same=current.length===saved.length&&current.every((name,i)=>name===saved[i]);if(!same&&!confirm("デッキの内容が保存されていません。保存せずに対戦画面へ戻りますか？"))return;document.querySelector("#deckEditor").hidden=true};
  document.querySelectorAll("[data-end]").forEach(b=>b.onclick=endTurn);
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
  document.querySelector("#p1-life").parentElement.onclick=()=>{if(state.pendingDiscardPlayer!==null)return log("カードを捨てるまでライフを変更できません");const modal=document.querySelector("#lifeModal"),input=document.querySelector("#lifeInput");modal.hidden=false;input.value="";input.focus();const close=()=>{modal.hidden=true};const apply=(action)=>{const x=state.players[1],raw=input.value.trim();if(!raw){close();return}const n=Number(raw);if(!Number.isInteger(n)){log("ライフの変更をキャンセルしました");close();return}const amount=Math.abs(n);if(action==="cancel"){close();return}let next=x.life;if(action==="damage")next=x.life-amount;if(action==="heal")next=x.life+amount;if(action==="change")next=amount;x.life=next;render();log(action==="damage"?"自分のライフに "+amount+" ダメージを与えました":"自分のライフを "+(action==="heal"?amount+" 回復しました":amount+" に変更しました"));if(x.life<=0){state.gameOver={winner:2,reason:"life_zero"};log(x.name+"のライフが0以下になったため、"+state.players[2].name+"の勝利です");}close()};modal.querySelectorAll("[data-life-action]").forEach(b=>b.onclick=()=>apply(b.dataset.lifeAction));input.onkeydown=ev=>{if(ev.key!=="Enter")return;ev.preventDefault();const raw=input.value.trim();if(!raw)return;const n=Number(raw);if(!Number.isInteger(n)){log("ライフの変更をキャンセルしました");close();return}apply(n>0&&raw.startsWith("+")?"heal":"damage")}};
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
  document.querySelector("#reset").onclick=()=>{if(confirm("自分の盤面をリセットしますか？")){const n=state.players[1].name;const deckList=(state.savedDeck||[]).slice();const p=newPlayer(n,"p1");const pool=shuffle((deckList.length?deckList:p.deckList).slice());p.deckList=pool.slice();p.hand=pool.slice(0,7).map((name,i)=>newCard(name,"p1h"+i));p.deck=pool.slice(7).map((name,i)=>newCard(name,"p1d"+i));state.players[1]=p;state.selected=null;state.pendingDiscardPlayer=null;state.gameOver=null;state.phase="mulligan";state.mulligan={1:{count:0,done:false},2:{count:0,done:false}};lastPublicState=null;render();log("自分の盤面をリセットし、シャッフルしてマリガンを開始しました")}};
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
  loadLocalGameState();
  setup();render();log("カード画像を読み込みました（"+cardNames.length+"種類）");
  if(setupRoomLobby())connectGameServer();
}
start().catch(e=>{console.error(e);document.querySelector("#log").textContent="カード一覧の読み込みに失敗しました。";});
