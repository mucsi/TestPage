'use strict';
const $=id=>document.getElementById(id), C=ExpoCatalog, M=ExpoEditor;
const names={quests:'Quests',challenges:'Challenges',reward_levels:'Rewards',partners:'Promos',notifications:'Notifications'};
const singular={quests:'quest',challenges:'challenge',reward_levels:'reward',partners:'promo',notifications:'notification'};
let content=null,base=null,sha='',loaded=null,group='quests',selection=null,previewQuest=null,previewChallenge=null,previewReward=null,changed=false,busy=false,reviewed='';
const say=t=>$('status').textContent=t;
const guard=fn=>async(...args)=>{try{await fn(...args);}catch(e){say(e.message||'Something went wrong. Please try again.');}};
const title=r=>r.title||r.name||r.id;
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function button(text,fn,cls='secondary'){const b=el('button',cls,text);b.type='button';b.onclick=guard(fn);return b;}
function dirty(){changed=true;reviewed='';$('draft-state').textContent='Unsaved draft';}
function source(){const repo=$('repo').value.trim(),branch=$('branch').value.trim();if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||!branch)throw Error('Enter a valid repository and branch.');return {repo,branch};}
function assertShape(c){if(!c||C.groups.some(g=>!Array.isArray(c[g])||c[g].some(r=>!r||typeof r!=='object'||Array.isArray(r)))||!c.images||typeof c.images!=='object'||Array.isArray(c.images))throw Error('The catalog has invalid collections. The current draft was kept.');}
function install(c){c=C.migrate(c,base?.rewards||[]);assertShape(c);content=c;group='quests';selection=content.quests[0]?.id||null;previewQuest=selection;previewChallenge=content.challenges[0]?.id;previewReward=content.reward_levels[0]?.id;renderAll();}
function lock(value){busy=value;document.querySelector('main').inert=value;for(const id of ['review-button','confirm-publish','reload','import','repo','branch'])$(id).disabled=value;}
async function load(initial=false){
  if(busy)return;if(changed&&!confirm('Replace your unsaved draft with online content? Save a draft first if needed.'))return;
  const src=source();lock(true);say('Downloading the latest content from GitHub…');
  try{
    const snapshot=await ExpoAuth.request({action:'load'}),meta={sha:snapshot.sha},next=snapshot.feed;
    if(next.ExpoResetInProgress)throw Error('An expo reset is in progress. Try again when it finishes.');
    if(!Array.isArray(next.rewards)||!next.CurrentExpoID)throw Error('This is not a valid expo feed.');
    const draft=next.content?C.migrate(next.content,next.rewards):window.EXPO_MIGRATION_DRAFT?C.migrate(window.EXPO_MIGRATION_DRAFT,next.rewards):null;
    if(!draft)throw Error('The online catalog is not published yet and no migration draft is included.');
    assertShape(draft);install(draft);base=next;sha=meta.sha;loaded=src;changed=false;renderLiveNotifications();
    $('draft-state').textContent=next.content?'Online content loaded':'Migration draft';
    say(next.content?'Loaded automatically from GitHub. Edits stay in your draft until you publish.':'Online feed connected. The catalog has not been published yet: showing the included migration draft. Update the reset service before the first publication.');
    $('connection').close();
  }catch(e){
    if(initial&&!content&&window.EXPO_MIGRATION_DRAFT){install(C.normalize(window.EXPO_MIGRATION_DRAFT));$('draft-state').textContent='Offline migration draft';}
    say(`${e.message} ${content?'Your draft is available; publishing requires loading the current online feed.':''}`);
  }finally{lock(false);}
}
function imageSource(r){const value=content?.images?.[String(r.artwork||'').replace(/^asset:\/\//,'')];return typeof value==='string'&&/^data:image\/(png|jpeg);base64,/.test(value)?value:'';}
function picture(r,cls='thumb'){const src=imageSource(r);if(!src)return el('div',cls+' placeholder','◇');const img=el('img',cls);img.src=src;img.alt=title(r);return img;}
function stars(value){const n=el('span','star-line',String(value)+' '),img=el('img');img.src='preview-assets/star.svg';img.alt='stars';n.append(img);return n;}
function selected(){return content?.[group]?.find(r=>r.id===selection);}
function choose(g,id){group=g;selection=id;if(g==='quests')previewQuest=id;if(g==='challenges')previewChallenge=id;if(g==='reward_levels')previewReward=id;$('preview-screen').value=g==='quests'?'quest':g==='challenges'?'challenge':g==='reward_levels'?'reward':'home';renderAll();}
function draggable(node,id){
  node.draggable=false;node.style.touchAction='pan-y';node.ondragstart=e=>e.preventDefault();
  node.onpointerdown=e=>{
    if(busy||e.button!==0||e.target.closest('button,input,select'))return;
    const startX=e.clientX,startY=e.clientY;let ghost=null,target=null;node.setPointerCapture(e.pointerId);
    const clear=()=>{ghost?.remove();target?.classList.remove('drop-over');node.onpointermove=null;node.onpointerup=null;node.onpointercancel=null;};
    node.onpointermove=move=>{
      if(!ghost&&Math.hypot(move.clientX-startX,move.clientY-startY)<6)return;
      move.preventDefault();if(!ghost){ghost=el('div','drag-ghost',title(content.challenges.find(r=>r.id===id)));document.body.append(ghost);}
      ghost.style.left=move.clientX+12+'px';ghost.style.top=move.clientY+12+'px';target?.classList.remove('drop-over');target=document.elementFromPoint(move.clientX,move.clientY)?.closest('[data-quest-id]');target?.classList.add('drop-over');
    };
    node.onpointerup=up=>{const drop=document.elementFromPoint(up.clientX,up.clientY)?.closest('[data-quest-id]');const moved=!!ghost;clear();if(moved&&drop){try{M.assign(content,drop.dataset.questId,id,drop.dataset.beforeId||null);dirty();previewQuest=drop.dataset.questId;renderAll();say('Challenge added to this quest. Other quests keep their copy; completion is shared.');}catch(error){say(error.message);}}};
    node.onpointercancel=clear;
  };
}
function dropTarget(node,questId,before=null){node.dataset.questId=questId;if(before)node.dataset.beforeId=before;}
function renderLibrary(){
  const box=$('library');box.replaceChildren();const query=$('search').value.toLocaleLowerCase();
  for(const r of content.challenges.filter(r=>(title(r)+' '+r.id).toLocaleLowerCase().includes(query))){
    const card=el('div','library-card');card.setAttribute('aria-current',String(group==='challenges'&&r.id===selection));draggable(card,r.id);
    const copy=el('div','copy'),used=content.quests.filter(q=>q.challenge_ids.includes(r.id)).length;
    copy.append(el('strong','',title(r)),el('small','',`${r.stars} stars · ${used} quests${r.enabled===false?' · Hidden':''}`));
    card.append(el('span','handle','⠿'),picture(r),copy,button('Edit',()=>choose('challenges',r.id),'plain'));
    box.append(card);
  }
  if(!box.children.length)box.append(el('div','empty','No matching challenges.'));
}
function renderBoard(){
  const boardGroup=group==='challenges'?'quests':group;document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.group===boardGroup));
  $('collection-title').textContent=names[boardGroup];$('add-item').textContent='+ Add '+singular[boardGroup];
  const box=$('board');box.replaceChildren();
  for(const row of content[boardGroup]){
    const card=el('div','board-card'+(selection===row.id&&group===boardGroup?' selected':''));card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`Edit ${singular[boardGroup]} ${title(row)}`);card.onclick=()=>choose(boardGroup,row.id);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(boardGroup,row.id);}};
    card.append(picture(row),el('h3','',title(row)),el('small','',row.enabled===false||row.publication_status==='draft'?'Hidden / draft':boardGroup==='quests'?`${row.challenge_ids.length} challenges · drop here`:boardGroup==='reward_levels'?`${row.star_cost??row.stars_required} stars`:boardGroup==='notifications'?'Announcement':'Promo banner'));
    if(boardGroup==='quests')dropTarget(card,row.id);box.append(card);
  }
}
function field(parent,row,key,label,type='text',hint=''){
  const wrap=el('label','',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;
  if(type==='checkbox')input.checked=row[key]!==false;else input.value=row[key]??'';
  if(type==='number'){input.min='0';input.step='1';}
  input.oninput=()=>{row[key]=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;if(['short_description','detailed_description'].includes(key)&&!input.value.trim())delete row[key];dirty();renderBoard();renderPreview();if(group==='challenges')renderLibrary();};wrap.append(input);if(hint)wrap.append(el('small','muted',hint));parent.append(wrap);return input;
}
async function upload(file,row){
  const draft=content;
  const promo=content.partners.includes(row),ratio=promo?(row.banner_type==='full_image'?5/3:1):null;
  if(!file)return;if(!['image/png','image/jpeg'].includes(file.type)||file.size>12*1024*1024)throw Error('Choose a PNG or JPEG image up to 12 MB.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read image.'));reader.readAsDataURL(file);});
  const img=new Image();img.src=data;await img.decode();if(img.width*img.height>40000000)throw Error('Image is too large; resize it below 40 megapixels.');
  if(ratio&&Math.abs(img.width/img.height-ratio)>0.02)throw Error(`This promo needs a ${row.banner_type==='full_image'?'5:3 banner (for example 1000 × 600)':'1:1 square logo (for example 600 × 600)'}. Your image is ${img.width} × ${img.height}; resize or crop it before uploading.`);
  const canvas=document.createElement('canvas'),scale=Math.min(1,768/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  const optimized=canvas.toDataURL(file.type,file.type==='image/jpeg'?.88:undefined);if(optimized.length>3*1024*1024)throw Error('Image is still too large. Try a smaller JPEG.');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(optimized));const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(content!==draft)throw Error('The draft changed while reading the image. Upload it again.');
  content.images[key]=optimized;row.artwork='asset://'+key;dirty();renderAll();say('Image added to the draft and resized for mobile. It will upload when you publish.');
}
function renderEditor(){
  const box=$('editor');box.replaceChildren();const row=selected();if(!row){box.append(el('div','empty','Choose an item to edit, or add a new one.'));return;}
  const card=el('div','editor-card'),heading=el('div','section-title');heading.append(el('h2','',`Edit ${singular[group]}`));card.append(heading);
  field(card,row,['quests','partners'].includes(group)?'name':'title','Name');
  const enabled=field(card,row,'enabled',group==='notifications'?'Enable notification':'Visible in the app','checkbox');
  if(group==='notifications'){
    enabled.checked=row.enabled!==false&&row.publication_status!=='draft';
    enabled.oninput=()=>{row.enabled=enabled.checked;row.publication_status='live';dirty();renderBoard();renderPreview();};
    const label=el('label','','When to publish'),select=el('select');
    select.add(new Option('Publish now','now'));select.add(new Option('Publish later at a set time','later'));
    select.value=row.publish_mode||(row.start_at?'later':'now');
    const dateLabel=el('label','','Publish date and time (your local time)'),date=el('input');date.type='datetime-local';dateLabel.hidden=select.value!=='later';
    if(row.start_at){const d=new Date(row.start_at);if(Number.isFinite(d.getTime()))date.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
    select.onchange=()=>{row.publish_mode=select.value;dateLabel.hidden=select.value!=='later';if(select.value==='now'){delete row.start_at;date.value='';}dirty();renderBoard();renderPreview();};
    date.oninput=()=>{if(date.value)row.start_at=new Date(date.value).toISOString().replace('.000Z','Z');else delete row.start_at;row.publish_mode='later';dirty();renderPreview();};
    label.append(select);dateLabel.append(date);card.append(label,dateLabel,el('p','muted','Use Publish in the header to save this choice. Review lets you check it first without uploading. Publish now makes it available immediately; Publish later makes it available from your chosen time. Phones display it on their next refresh—not as closed-app push.'));
    if(row.end_at)card.append(el('p','muted','Existing expiry: '+new Date(row.end_at).toLocaleString()),button('Remove expiry',()=>{delete row.end_at;dirty();renderAll();}));
  }
  if(group==='partners'){
    const label=el('label','','Banner format'),select=el('select');select.add(new Option('Logo + text · square 1:1 logo','logo_text'));select.add(new Option('Full image · 5:3 banner','full_image'));select.value=row.banner_type||'logo_text';select.onchange=()=>{row.banner_type=select.value;row.artwork='';dirty();renderAll();say('Format changed. Upload an image in the new aspect ratio; existing text is kept for switching back.');};label.append(select);card.append(label,el('p','muted',row.banner_type==='full_image'?'Upload a complete 5:3 banner. No text is overlaid.':'Upload a square logo and add your headline and message.'));
  }
  if(['reward_levels','partners'].includes(group)){
    const label=el('label','','Publication'),select=el('select');select.add(new Option('Live when published','live'));select.add(new Option('Draft / hidden','draft'));select.value=row.publication_status||'live';select.onchange=()=>{row.publication_status=select.value;dirty();renderBoard();renderPreview();};label.append(select);card.append(label);
    for(const [key,name] of [['start_at','Starts'],['end_at','Ends']]){
      const wrap=el('label','',name+' (your local time)'),input=el('input');input.type='datetime-local';
      if(row[key]){const d=new Date(row[key]);if(Number.isFinite(d.getTime()))input.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
      input.oninput=()=>{if(input.value)row[key]=new Date(input.value).toISOString().replace('.000Z','Z');else delete row[key];dirty();renderPreview();};wrap.append(input);card.append(wrap);
    }
    card.append(el('small','muted','Leave dates empty for no time limit. Notifications are delivered after an app refresh, not while the app is closed.'));
    if(group!=='notifications'){
      field(card,row,'notify','Notify visitors when available','checkbox').checked=row.notify===true;
      field(card,row,'notification_title','Notification title (optional)');field(card,row,'notification_message','Notification message (optional)','textarea');
    }
  }
  if(group==='partners'){field(card,row,'banner_title','Banner headline');field(card,row,'banner_message','Banner text','textarea');field(card,row,'show_banner','Show in promo carousel','checkbox');field(card,row,'booth','Booth / location');field(card,row,'hint','Visitor hint','textarea');}
  else field(card,row,'description','Description','textarea');
  if(group==='challenges'){field(card,row,'short_description','Short card description','textarea',' Leave blank to use the description.');field(card,row,'detailed_description','Scanning instructions','textarea',' Leave blank to use the description.');}
  const values=el('div','fields-row');card.append(values);
  if(group==='quests'){field(values,row,'required_stars','Stars needed','number');field(values,row,'completion_bonus_stars','Completion bonus','number');field(values,row,'perfection_bonus_stars','All-challenges bonus','number');}
  if(group==='challenges'){const amount=field(values,row,'stars','Star reward','number');amount.min=1;amount.max=5;field(values,row,'value','QR code value');}
  if(group==='reward_levels'){field(card,row,'requires_stars','Require collected stars to unlock','checkbox');field(values,row,'stars_required','Unlock at stars','number');field(values,row,'star_cost','Redemption cost','number');field(card,row,'repeatable','Can be claimed repeatedly','checkbox').checked=!!row.repeatable;field(card,row,'category','Category');field(card,row,'claim_qr','Merchant approval QR (blank uses default)');}
  if(group==='quests'||group==='partners')field(card,row,'color','Accent colour','color');
  const artwork=el('div','image-editor'),uploadBox=el('div'),uploadLabel=el('label','', 'Upload image'),input=el('input');input.type='file';input.accept='image/png,image/jpeg';input.onchange=guard(()=>upload(input.files[0],row));uploadLabel.append(input);uploadBox.append(uploadLabel,el('small','muted','PNG or JPEG · automatically resized'),button('Remove image',()=>{row.artwork='';dirty();renderAll();}));artwork.append(picture(row),uploadBox);card.append(artwork);
  if(group==='quests')renderAssigned(card,row);
  if(group==='challenges'){
    card.append(el('h3','','Add to quests'),el('p','muted','The same challenge and QR code can appear in multiple quests. Changes apply everywhere.'));
    for(const q of content.quests){const label=el('label'),check=el('input');check.type='checkbox';check.checked=q.challenge_ids.includes(row.id);check.onchange=()=>{if(check.checked)M.assign(content,q.id,row.id);else M.unassign(content,q.id,row.id);dirty();renderBoard();renderLibrary();renderPreview();};label.append(check,document.createTextNode(' '+q.name));card.append(label);}
    card.append(button('Duplicate as a new challenge',()=>{const copy=M.create(content,'challenges',crypto.randomUUID(),row);dirty();choose('challenges',copy.id);say('Independent copy created with a new QR value. It does not share visitor progress.');}));
  }
  if(group!=='challenges'){
    const order=el('div','fields-row');for(const [caption,step] of [['Move earlier',-1],['Move later',1]])order.append(button(caption,()=>{const rows=content[group],i=rows.indexOf(row),j=i+step;if(j>=0&&j<rows.length){[rows[i],rows[j]]=[rows[j],rows[i]];dirty();renderAll();}}));card.append(order);
  }
  if(group==='notifications'){
    card.append(el('p','muted','Each announcement notifies a visitor once. Edit its message without sending again, or create a new announcement to notify again. Notifications are not part of the app home layout; published active messages are listed below the mobile preview.'));
    card.querySelector('.image-editor')?.remove();
  }
  const details=el('details'),summary=el('summary','','Technical identity (kept unchanged)');details.append(summary,el('p','muted',`ID: ${row.id}${row.analytics_key?' · Analytics: '+row.analytics_key:''}`));card.append(details);box.append(card);
}
function renderAssigned(card,q){
  card.append(el('h3','','Challenges in this quest'),el('p','muted','Drag from the library, or reorder these cards. Removing a card here keeps the challenge in other quests.'));
  const zone=el('div','drop-zone');zone.setAttribute('aria-label',`Challenges in ${q.name}`);dropTarget(zone,q.id);
  for(const id of q.challenge_ids){const r=content.challenges.find(r=>r.id===id);if(!r)continue;const item=el('div','assigned');draggable(item,id);dropTarget(item,q.id,id);item.append(el('span','handle','⠿'),el('span','name',title(r)),stars(r.stars),button('↑',()=>{const i=q.challenge_ids.indexOf(id);if(i>0){M.assign(content,q.id,id,q.challenge_ids[i-1]);dirty();renderAll();}}),button('Edit',()=>choose('challenges',id)),button('×',()=>{M.unassign(content,q.id,id);dirty();renderAll();}));item.lastChild.setAttribute('aria-label','Remove '+title(r)+' from quest');zone.append(item);}
  zone.append(el('p','muted tiny','+ Drop a challenge here'));card.append(zone);
  const pick=el('select');pick.setAttribute('aria-label','Add a challenge to this quest');pick.add(new Option('Choose a challenge to add…',''));for(const r of content.challenges.filter(r=>!q.challenge_ids.includes(r.id)))pick.add(new Option(title(r),r.id));pick.onchange=()=>{if(pick.value){M.assign(content,q.id,pick.value);dirty();renderAll();}};card.append(pick);
}
let previewFrame=null,previewTimer=null,previewReady=false;
function renderLiveNotifications(){
  const box=$('live-notifications');box.replaceChildren();
  if(!base?.content){box.append(el('p','muted','Load published content to see live notifications.'));return;}
  const notices=C.liveNotifications(base.content);
  if(!notices.length){box.append(el('p','muted','No notifications are live now.'));return;}
  for(const notice of notices){const card=el('article','notification-preview');card.append(el('strong','',notice.title),el('p','',notice.message));box.append(card);}
}
setInterval(renderLiveNotifications,30000);
function renderPreview(){
  if(!content)return;
  const width=Number($('preview-width').value);
  $('phone').style.width=(width+14)+'px';
  $('phone-content').style.height=Math.round(width*2196/1080)+'px';
  $('phone').querySelector('.phone-status').style.height=Math.round(width*152/1080)+'px';
  if(location.protocol==='file:'){$('phone-content').textContent='The real Godot preview needs HTTP hosting. Open the studio through its local server or hosted website, not by double-clicking this file.';return;}
  if(!previewFrame){
    previewFrame=document.createElement('iframe');previewFrame.title='Actual Expo Quest app preview';previewFrame.src='app-preview/index.html';
    $('phone-content').replaceChildren(previewFrame);
  }
  clearTimeout(previewTimer);
  previewTimer=setTimeout(()=>{
    if(!previewReady)return;
    previewFrame.contentWindow.postMessage({type:'expo-preview-update',payload:{content,screen:$('preview-screen').value,quest:previewQuest,challenge:previewChallenge,reward:previewReward,progress:$('preview-progress').value}},location.origin);
  },180);
}
window.addEventListener('message',event=>{
  if(event.source!==previewFrame?.contentWindow||event.origin!==location.origin)return;
  if(event.data?.type==='expo-preview-ready'){previewReady=true;renderPreview();}
  if(event.data?.type==='expo-preview-result')$('preview-status').textContent=event.data.error?'Last valid preview retained: '+event.data.error:'Rendered by the app itself. Camera and device status bars are simulated; progress is preview-only.';
});
function renderAll(){if(!content)return;renderLibrary();renderBoard();renderEditor();renderPreview();}
async function validate(){const errors=C.validate(content);if(errors.length)throw Error(errors.join('\n'));let pixels=0;for(const data of Object.values(content.images)){const img=new Image();img.src=data;await img.decode();if(!img.width||!img.height||img.width>2048||img.height>2048)throw Error('An image exceeds 2048 × 2048. Replace it with a new upload.');pixels+=img.width*img.height;if(pixels>16*1024*1024)throw Error('Artwork exceeds the offline memory budget. Use smaller images.');}}
function compactImages(){const used=new Set(C.groups.flatMap(g=>content[g].map(r=>String(r.artwork||'').replace(/^asset:\/\//,''))));for(const key of Object.keys(content.images))if(!used.has(key))delete content.images[key];}
$('settings').onclick=()=>$('connection').showModal();$('reload').onclick=guard(()=>load());$('search').oninput=renderLibrary;
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{group=b.dataset.group;selection=content?.[group]?.[0]?.id;renderAll();});
$('add-challenge').onclick=guard(()=>{if(!content)return;const row=M.create(content,'challenges',crypto.randomUUID());dirty();choose('challenges',row.id);});
$('add-item').onclick=guard(()=>{if(!content)return;const g=group==='challenges'?'quests':group;const row=M.create(content,g,crypto.randomUUID());dirty();choose(g,row.id);});
$('preview-screen').onchange=renderPreview;$('preview-width').onchange=renderPreview;
$('preview-progress').onchange=renderPreview;
$('export').onclick=guard(()=>{if(!content)throw Error('No draft to save yet.');const a=el('a'),url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));a.href=url;a.download='expo-catalog-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Draft backup downloaded. Online content has not changed.');});
$('import').onchange=guard(async()=>{const file=$('import').files[0];if(!file)return;if(file.size>8*1024*1024)throw Error('Draft exceeds 8 MB.');if(changed&&!confirm('Replace your unsaved draft with this backup?'))return;const next=C.normalize(JSON.parse(await file.text()));assertShape(next);install(next);dirty();$('connection').close();say('Backup restored to your draft. Review before publishing.');});
$('review-button').onclick=guard(async()=>{
  if(!content||busy)return;if(!base||!loaded)throw Error('Load the current online feed in GitHub settings before publishing.');
  if(source().repo!==loaded.repo||source().branch!==loaded.branch)throw Error('Repository changed. Save your draft, then reload the new repository.');
  lock(true);try{compactImages();await validate();const feed=C.merge(base,content);if(new TextEncoder().encode(JSON.stringify(feed)).length>8*1024*1024)throw Error('The complete feed exceeds 8 MB.');reviewed=JSON.stringify(content);$('review-summary').replaceChildren(...C.groups.map(g=>el('p','',`${names[g]}: ${content[g].length} (${content[g].filter(r=>r.enabled!==false).length} visible)`)));$('confirm-publish').disabled=false;$('review').showModal();}finally{lock(false);}
});
$('confirm-publish').onclick=guard(async()=>{
  if(busy||!content)return;
  if(ExpoAuth.local)throw Error('Local preview cannot publish. Sign out and use your organizer login.');
  if(!base||!loaded)throw Error('Load the current online feed before publishing.');
  const src=source();if(src.repo!==loaded.repo||src.branch!==loaded.branch)throw Error('Repository changed. Reload before publishing.');
  lock(true);$('confirm-publish').disabled=true;try{
    compactImages();await validate();
    const feed=C.merge(base,content);
    if(new TextEncoder().encode(JSON.stringify(feed)).length>8*1024*1024)throw Error('The complete feed exceeds 8 MB.');
    if(!confirm('Publish this draft to the live app? Your content will be public.'))return;
    say('Uploading content to GitHub…');
    const result=await ExpoAuth.request({action:'publish',sha,content});
    base=feed;sha=result.sha;changed=false;reviewed='';renderLiveNotifications();$('draft-state').textContent='Published';$('review').close();say('Published to GitHub. Phones receive the content after GitHub Pages updates and the app refreshes.');
  }catch(e){$('review').close();throw e;}finally{lock(false);}
});
window.addEventListener('beforeunload',e=>{if(changed){e.preventDefault();e.returnValue='';}});
ExpoAuth.init(guard(async()=>{if(content&&changed){say('Signed in. Your draft has been kept; publishing will check for online changes.');return;}await load(true);}));
