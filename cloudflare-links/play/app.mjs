import {read,write,change,remove} from './storage.mjs';
import './visits.js';
import {emptyState,applyOperations,totals,questStatus,enabled,cost,approvalMatches} from './core.mjs';
const $=s=>document.querySelector(s),cfg=window.WEB_CONFIG;
const privacyLink=document.createElement('a');privacyLink.href='web-privacy.html';privacyLink.textContent='Web account information';document.querySelector('footer').append(' · ',privacyLink);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=()=>crypto.randomUUID().replaceAll('-','');
let session,feed,record,busy=false,scanControls,lastSync=0;
const initial=()=>({confirmed:emptyState(),queue:[],redemptions:[],claim:null,preference:null});
const stateKey=()=>`progress:${session.user.id}:${feed.CurrentExpoID}`;
const message=t=>{$('#status').textContent=t;};
function show(html){$('#detail').innerHTML=html;if(!$('#popup').open)$('#popup').showModal();$('#popup').scrollTop=0;}
function close(){scanControls?.stop();scanControls=null;$('#popup').close();}
$('#close').onclick=close;$('#popup').addEventListener('close',()=>{scanControls?.stop();scanControls=null;});
async function call(action,data={},auth=true){
 if(auth&&session.expires<Date.now())await refresh();
 const r=await fetch(cfg.endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.key,...(auth?{Authorization:'Bearer '+session.access}:{})},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(18000)});
 const b=await r.json();if(!r.ok)throw Error(b.error||'Connection unavailable.');return b;
}
async function refresh(){
 const run=async()=>{session=await read('session');if(!session)throw Error('Please sign in.');if(session.expires>Date.now())return;const b=await call('refresh',{refresh:session.refresh},false);session=b.session;await write('session',session);};
 if(navigator.locks)await navigator.locks.request('expoquest-session',run);else await run();
}
function image(key){const a=feed.content.images?.[String(key||'').replace(/^asset:\/\//,'')];return a?.path?cfg.contentOrigin+a.path:'';}
function picture(key){const src=image(key);return src?`<img loading="lazy" src="${esc(src)}" alt="">`:'';}
function viewState(){return applyOperations(record.confirmed,feed.content,record.queue).state;}
function stats(){return totals(viewState(),record.redemptions.reduce((n,t)=>n+t.cost,0),record.preference??session.user.draws);}
async function content(){
 feed=await read('catalog');
 try{const r=await fetch(cfg.contentOrigin+'/content/manifest.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const m=await r.json();if(m.ExpoResetInProgress)throw Error();if(feed?._version!==m.version){if(!/^\/content\/catalogs\/[a-f0-9]{64}\.json$/.test(m.catalog))throw Error();const cr=await fetch(cfg.contentOrigin+m.catalog,{signal:AbortSignal.timeout(12000)});if(!cr.ok)throw Error();const f=await cr.json();if(f.ExpoResetInProgress||f.CurrentExpoID!==m.CurrentExpoID)throw Error();feed={...f,_version:m.version};await write('catalog',feed);}}catch{if(!feed)throw Error('Connect to the internet to download the event for the first time.');message('Using saved event content. New content will load when connected.');}
}
function auth(mode='login'){
 $('#balance').textContent='';$('#main').innerHTML=`<form id="auth"><h2>${mode==='register'?'Start your adventure':mode==='recover'?'Recover your account':'Welcome back'}</h2><p>You need to be at the expo to complete challenges and collect prizes. This web account is separate from the mobile app.</p>${mode==='register'?'<label>Name<input name="username" required minlength="2" maxlength="32" autocomplete="nickname"></label>':''}<label>Email<input name="email" type="email" required autocomplete="email"></label>${mode==='recover'?'<label>Recovery code<input name="recovery" required autocomplete="off"></label>':''}<label>${mode==='recover'?'New password':'Password'}<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="${mode==='login'?'current-password':'new-password'}"></label>${mode==='register'?'<label><input name="draws" type="checkbox"> Use my email for daily draws and prize contact. For children, a parent or guardian provides their own email.</label><p class="muted">We do not send verification emails. Check your address carefully. Save the recovery code shown after registration.</p>':''}<button class="primary">${mode==='register'?'Create account':mode==='recover'?'Reset password':'Sign in'}</button><div class="actions"><button type="button" data-auth="${mode==='login'?'register':'login'}">${mode==='login'?'Create account':'Sign in'}</button><button type="button" data-auth="recover">Forgot password</button></div><p><a href="/privacy" target="_blank" rel="noopener">Privacy policy</a></p></form>`;
 document.querySelectorAll('[data-auth]').forEach(b=>b.onclick=()=>auth(b.dataset.auth));
 $('#auth').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('.primary');button.disabled=true;try{const d=Object.fromEntries(new FormData(form));d.draws=d.draws==='on';const b=await call(mode,d,false);if(b.session){session=b.session;await write('session',session);await start();}if(b.recovery)show(`<h2>Save your recovery code</h2><p>Keep this somewhere private, outside this browser. Without your password or this code, you may lose access. No recovery emails are sent.</p><p class="notice">${esc(b.recovery)}</p>`);if(mode==='recover'){auth('login');message('Password changed. Save the new recovery code and sign in.');}}catch(e){message(e.message);}finally{button.disabled=false;}};
}
function render(){
 if(!session||!feed||!record)return;const s=stats(),state=viewState(),c=feed.content;
 $('#balance').innerHTML=`${s.balance} ⭐${session.user.draws?`<br><small>${s.entries} entries in daily draws</small>`:''}`;
 const rewards=(c.reward_levels||[]).filter(enabled);
 const quests=(c.quests||[]).filter(enabled).map((q,i)=>({q,i,status:questStatus(q,c,state)})).sort((a,b)=>(a.status.perfect?2:a.status.complete?1:0)-(b.status.perfect?2:b.status.complete?1:0)||a.i-b.i);
 $('#main').innerHTML=`<div class="actions"><button class="primary" id="scan">Scan challenge</button><button id="sync">Sync now</button><button id="account">Account</button>${record.claim?'<button id="pending">Pending reward</button>':''}</div><h2>✨ Rewards</h2><div class="rewards">${rewards.map(r=>`<button class="card" data-reward="${esc(r.id)}">${picture(r.artwork)}<strong>${esc(r.title)}</strong><small>${r.reward_type==='daily_draw'?'View prizes':`${cost(r)} ⭐ · ${Number(r.quantity)>50?'Plenty':esc(r.quantity??'')+' left'}`}</small></button>`).join('')}</div><h2>✨ Quests</h2>${quests.map(({q,status})=>`<section class="quest"><details><summary>${esc(q.name)} ${status.perfect?'✓ Perfected':status.complete?'✓ Completed':''}</summary><p>${esc(q.description)}</p>${(c.challenges||[]).filter(ch=>enabled(ch)&&(q.challenge_ids||[]).includes(ch.id)).map(ch=>`<div class="challenge">${picture(ch.artwork)}<div class="copy"><strong>${esc(ch.title)} ${state.scans[ch.id]?'✓':''}</strong><p>${esc(ch.description)}</p><span>${ch.stars} ⭐</span><div class="booth">${esc(ch.booth_number)}</div></div></div>`).join('')}</details></section>`).join('')}`;
 $('#scan').onclick=()=>scanner(acceptScan);$('#sync').onclick=()=>sync();$('#account').onclick=account;if($('#pending'))$('#pending').onclick=claimDialog;
 document.querySelectorAll('[data-reward]').forEach(b=>b.onclick=()=>reward(rewards.find(r=>r.id===b.dataset.reward)));
 document.querySelectorAll('details').forEach(d=>d.ontoggle=()=>{if(d.open)d.scrollIntoView({block:'start',behavior:'smooth'});});
}
async function acceptScan(qr){
 const op={id:id(),qr};let awarded=0;
 record=await change(stateKey(),old=>{old||=initial();const before=applyOperations(old.confirmed,feed.content,old.queue).state;const result=applyOperations(before,feed.content,[op]);if(!result.results[0].ok)throw Error(result.results[0].error);awarded=totals(result.state).stars-totals(before).stars;old.queue.push(op);return old;});
 close();render();show(`<h2>${awarded?'Challenge completed!':'Already collected'}</h2><p>+${awarded} stars${session.user.draws?` · +${awarded} daily draw entries`:''}</p><p>Saved on this device. Awards remain pending until synchronized.</p>`);message('Progress saved locally.');setTimeout(()=>sync(),1500);
}
async function scanner(receive){
 show('<h2>Scan QR code</h2><video id="camera" muted playsinline></video><p>Allow camera access, then point at the QR code.</p><details><summary>Paste a QR link instead</summary><input id="qrtext" aria-label="QR content"><button id="useqr">Use code</button></details>');
 let handled=false;const accept=async text=>{if(handled)return;handled=true;scanControls?.stop();try{await receive(text);}catch(e){handled=false;message(e.message);}};
 $('#useqr').onclick=()=>accept($('#qrtext').value.trim());
 try{const reader=new QRTools.BrowserQRCodeReader();const controls=await reader.decodeFromConstraints({video:{facingMode:'environment'},audio:false},$('#camera'),result=>{if(result)accept(result.getText());});if(!$('#popup').open||handled)controls.stop();else scanControls=controls;}catch{message('Camera unavailable. You can paste the QR link instead.');}
}
async function sync(action='sync',extra={}){
 if(busy||!session||!feed)return;busy=true;
 const owner=session.user.id,key=stateKey();
 try{record=await read(key)||initial();const sent=record.queue.slice(0,100);const pref=record.preference;if(pref!==null&&pref!==undefined){if(action!=='sync'&&action!=='preferences')throw Error('Synchronize your saved draw preference first.');action='preferences';extra={...extra,draws:pref};}const result=await call(action,{expo:feed.CurrentExpoID,operations:sent,...extra});
 if(session?.user.id!==owner||stateKey()!==key)return;
 record=await change(key,old=>{old||=initial();if(result.revision>=(old.revision||0)){old.confirmed=result.state;old.revision=result.revision;}old.redemptions=[...new Map([...old.redemptions,...result.redemptions].map(t=>[t.id,t])).values()];const ack=new Set(result.results.map(r=>r.id));old.queue=old.queue.filter(x=>!ack.has(x.id));if(result.claim)old.claim=result.claim;if(old.claim&&old.redemptions.some(t=>t.id===old.claim.id))old.claim=null;return old;});
 if(action==='preferences')record=await change(key,old=>{if(old.preference===pref)old.preference=null;return old;});session.user=result.user;await write('session',session);lastSync=Date.now();render();const rejected=result.results.filter(x=>!x.ok);message(rejected.length?'Some scans were rejected: '+rejected.map(x=>x.error).join('; '):record.queue.length?'Saved. More scans are waiting to upload.':'Progress synchronized.');return result;
 }catch(e){message(e.message+' Local progress remains saved.');}finally{busy=false;}
}
function reward(r){
 if(r.reward_type==='daily_draw'){show('<h2>Choose your rewards</h2><div class="actions"><button id="daily" class="primary">Daily giveaway prizes</button><button id="market">Star reward market</button></div>');$('#daily').onclick=()=>dailyPrizes(r);$('#market').onclick=market;return;}
 show(`<h2>${esc(r.title)}</h2>${picture(r.artwork)}<p>${esc(r.description)}</p><p>${cost(r)} stars</p><button id="claim" class="primary">Start claim</button><p>Staff approval is required. Connect to the internet to create a claim.</p>`);
 $('#claim').onclick=async()=>{if(record.claim){claimDialog();return;}let draft=await read('claim-draft:'+stateKey());if(!draft||draft.reward!==r.id)draft={id:id(),reward:r.id};await write('claim-draft:'+stateKey(),draft);const b=await sync('claim',draft);if(b?.claim){await remove('claim-draft:'+stateKey());claimDialog();}};
}
function dailyPrizes(r){show(`<h2>Daily prizes</h2>${session.user.draws?`<p>You have ${stats().entries} entries in the daily draws.</p>`:'<p>Add your email to daily draws in Account to participate.</p>'}<ul class="prizes">${(r.draw_prizes||feed.content.email_draw?.draw_prizes||[]).map(p=>`<li>${esc(p)}</li>`).join('')}</ul><p><strong>Daily draws will happen at the LASEROX booth 3B215.</strong></p><p>${esc(r.description)}</p><h3>How entries work</h3><p>Providing your email gives one entry. Every earned star adds one entry, including quest bonuses. Spending stars does not reduce entries. Entries accumulate throughout the event. Each entry is included in the draw pool; a winner is removed for the rest of that day and included again the following day.</p><p class="rules">${esc(feed.content.app_text?.draw_eligibility||'Ask LASEROX staff about the current event schedule and eligibility.')}</p><p>Organized by Laserox Design Kft. Apple and Google are not involved in these draws.</p><a href="/support" target="_blank" rel="noopener">Contact and event support</a>`);}
function market(){const list=feed.content.reward_levels.filter(r=>enabled(r)&&r.reward_type!=='daily_draw');show(`<h2>Reward market</h2><p>${stats().balance} stars available</p><div class="market">${list.map(r=>`<button class="card" data-market="${esc(r.id)}">${picture(r.artwork)}<strong>${esc(r.title)}</strong><small>${cost(r)} ⭐</small></button>`).join('')}</div>`);document.querySelectorAll('[data-market]').forEach(b=>b.onclick=()=>reward(list.find(r=>r.id===b.dataset.market)));}
function claimDialog(){
 if(!record.claim){show('<h2>Reward collected</h2><p>Your staff-approved claim is synchronized.</p>');return;}
 show('<h2>Show this QR to staff</h2><canvas id="claimqr"></canvas><p>After approval, scan the code on the staff phone. Offline approvals remain pending until staff reconnect.</p><button id="approval" class="primary">Scan staff approval</button><button id="check">Check approval</button>');
 QRTools.toCanvas($('#claimqr'),'EQCLAIM1:'+JSON.stringify(record.claim),{width:380,margin:4,errorCorrectionLevel:'M'}).catch(e=>message(e.message));
 $('#check').onclick=async()=>{await sync('claim-status');claimDialog();};
 $('#approval').onclick=()=>scanner(async value=>{if(!approvalMatches(value,record.claim))throw Error('This approval belongs to a different claim.');await write('approval:'+stateKey(),value);close();await sync('claim-status');claimDialog();});
}
function account(){
 show(`<h2>${esc(session.user.username)}</h2><p>${esc(session.user.email)}</p><p>Email is not verified. No verification or password-reset emails are sent.</p><button id="draws">${session.user.draws?'Leave':'Join'} daily draws</button><p>Daily draws require an email for winner contact. Earned entries are retained if you leave; the email bonus is restored when you rejoin.</p><button id="logout">Sign out</button><p>Saved progress stays in this browser, separated by account. Browser storage can be cleared by your device; synchronize regularly.</p><a href="/delete-data" target="_blank" rel="noopener">Request deletion of your account and data</a>`);
 $('#draws').onclick=async()=>{record=await change(stateKey(),old=>{old||=initial();old.preference=!(old.preference??session.user.draws);return old;});message('Draw preference saved locally; it takes effect online after synchronization.');await sync();account();};
 $('#logout').onclick=async()=>{try{await call('logout');}catch{}await remove('session');session=null;close();auth();message('Signed out on this browser.');};
}
async function start(){feed=await read('catalog');if(feed){record=await read(stateKey())||initial();render();message('Saved adventure ready. Checking for event updates…');}await content();record=await read(stateKey())||initial();render();message(record.queue.length?'Saved progress has pending uploads.':'Saved adventure ready.');sync();const params=new URLSearchParams(location.search),challenge=params.get('challenge');if(challenge){const value=challenge.startsWith('https://')?challenge:cfg.contentOrigin+'/c/'+challenge;await acceptScan(value);history.replaceState({},'',location.pathname);}}
try{session=await read('session');if(session)await start();else{auth();message('Sign in or create an account while connected.');}}catch(e){message(e.message);$('#main').innerHTML='<button id="retry">Try again</button>';$('#retry').onclick=()=>location.reload();}
window.addEventListener('online',()=>{if(session)sync();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastSync>300000)sync();});
setInterval(()=>{if(!document.hidden&&navigator.onLine&&Date.now()-lastSync>300000)sync();},300000+Math.random()*30000);
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>message('Offline app caching is unavailable in this browser.'));
