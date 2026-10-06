/* Pure validation shared by the browser editor and offline Node tests. */
(function(root) {
  const groups = ['quests','challenges','reward_levels','partners','notifications'];
  const clone = x => JSON.parse(JSON.stringify(x));
  // Portable structural checks (browser/Deno/Node). The editor also fully decodes images.
  function imageDimensions(uri) {
    if(typeof uri!=='string'||uri.length>3*1024*1024)throw Error('Invalid or oversized image');
    const match=uri.match(/^data:image\/(png|jpeg);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/);
    if(!match||!match[2])throw Error('Invalid image encoding');
    const raw=atob(match[2]),b=Uint8Array.from(raw,c=>c.charCodeAt(0)),view=new DataView(b.buffer);
    if(match[1]==='png'){
      if(b.length<45||[137,80,78,71,13,10,26,10].some((v,i)=>b[i]!==v)||view.getUint32(8)!==13||raw.slice(12,16)!=='IHDR')throw Error('Invalid PNG');
      let offset=8,sawData=false,sawEnd=false;
      while(offset+12<=b.length){const size=view.getUint32(offset),type=raw.slice(offset+4,offset+8);if(size>b.length-offset-12)throw Error('Truncated PNG');if(type==='IDAT')sawData=true;if(type==='IEND'){if(size!==0)throw Error('Invalid PNG end');sawEnd=true;break;}offset+=12+size;}
      if(!sawData||!sawEnd)throw Error('Incomplete PNG');
      return [view.getUint32(16),view.getUint32(20)];
    }
    if(b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)throw Error('Invalid JPEG');
    let offset=2;
    while(offset+4<=b.length){
      if(b[offset++]!==255)throw Error('Invalid JPEG marker');
      while(b[offset]===255)offset++;
      const marker=b[offset++];
      if(marker===218||marker===217)break;
      if(marker===1||(marker>=208&&marker<=215))continue;
      if(offset+2>b.length)break;
      const size=view.getUint16(offset);
      if(size<2||offset+size>b.length)throw Error('Truncated JPEG');
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
        if(size<8)throw Error('Invalid JPEG frame');
        return [view.getUint16(offset+5),view.getUint16(offset+3)];
      }
      offset+=size;
    }
    throw Error('Missing JPEG dimensions');
  }
  function validateImage(uri){try{const [w,h]=imageDimensions(uri);if(!w||!h||w>2048||h>2048)return 'Invalid image or dimensions over 2048 pixels';return '';}catch(e){return e.message;}}
  // Collect all references, including nested/future fields, without changing the draft.
  function compactImages(content) {
    const c=clone(content),used=new Set();
    if(!c||!c.images||typeof c.images!=='object'||Array.isArray(c.images))return c;
    function visit(v){if(typeof v==='string'&&v.startsWith('asset://'))used.add(v.slice(8));else if(v&&typeof v==='object')for(const child of Object.values(v))visit(child);}
    for(const [key,value] of Object.entries(c))if(key!=='images')visit(value);
    c.images=Object.fromEntries(Object.entries(c.images||{}).filter(([key])=>used.has(key)));
    return c;
  }
  function normalize(raw) {
    const c = clone(raw.content || raw);
    const p = c.challenge_pool;
    if (p?.enabled) {
      c.challenges = Array.from({length:p.count}, (_,i) => {
        const id = `${p.id_prefix || 'challenge'}-${String(i+1).padStart(3,'0')}`;
        return {id,analytics_key:`${p.analytics_prefix || 'challenge_'}${String(i+1).padStart(3,'0')}`,title:p.display_names[i],description:p.descriptions[i],value:p.qr_codes[i],stars:p.star_overrides?.[id] ?? p.stars ?? 1,enabled:true,legacy_keys:[]};
      });
      c.quests = p.quests || [];
      delete c.challenge_pool;
    }
    c.schema_version=1; c.images ||= {}; c.partners ||= []; c.notifications ||= [];
    return c;
  }
  function migrate(raw,legacy=[]) {
    const c=normalize(raw);
    if(c.unified_content===true)return c;
    for(const old of legacy){
      const existing=c.reward_levels.find(r=>r.id===old.id);
      if(existing){
        for(const key of ['star_cost','stars_required','start_at','end_at','repeatable','claim_qr'])if(key in old)existing[key]=old[key];
        if('active' in old)existing.enabled=old.active;
        continue;
      }
      const promo=['promotion','promo','banner'].includes(old.type);
      const target=promo?c.partners:c.reward_levels;
      if(target.some(r=>r.id===old.id))throw Error('Conflicting legacy ID: '+old.id);
      const row={...clone(old),enabled:old.active===true,publication_status:old.status==='live'?'live':'draft',notify:true,artwork:'',legacy_notification_id:old.id};
      if(promo)Object.assign(row,{name:old.title||old.id,banner_title:old.title||'',banner_message:old.description||'',banner_type:'logo_text',show_banner:true,color:old.background_color||'#ed1c24'});
      else Object.assign(row,{title:old.title||old.id,stars_required:old.stars_required??1,star_cost:old.star_cost??0,claim_identity:'online:'+old.id,requires_stars:old.stars_required!==undefined});
      if(!old.type&&!old.status)delete row.claim_identity;
      delete row.type;delete row.active;delete row.status;
      target.push(row);
    }
    c.unified_content=true;
    return c;
  }
  function validate(c) {
    const errors=[], ids={};
    const integer=(v,min,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
    if(c?.app_text!==undefined){
      const texts=c.app_text;
      if(!texts||typeof texts!=='object'||Array.isArray(texts)||Object.keys(texts).length>100)errors.push('Invalid app text settings');
      else for(const [key,value] of Object.entries(texts))if(key.length>80||typeof value!=='string'||value.length>6000)errors.push('App text must be plain text up to 6000 characters');
    }
    if (!c || c.schema_version!==1 || !c.images || typeof c.images!=='object' || Array.isArray(c.images)) return ['Invalid catalog version/images'];
    if(c.expo_name!==undefined&&(typeof c.expo_name!=='string'||!c.expo_name.trim()||c.expo_name.length>100))errors.push('Expo name must contain 1–100 characters');
    if(c.draw_event!==undefined){
      const e=c.draw_event;
      if(!e||typeof e!=='object'||Array.isArray(e))errors.push('Draw event must be an object');
      else{
        for(const key of ['name','venue','timezone'])if(typeof e[key]!=='string'||!e[key].trim()||e[key].length>300)errors.push(`Draw event ${key}: enter 1–300 characters`);
        for(const key of ['organizer_name','organizer_address','collection'])if(e[key]!==undefined&&(typeof e[key]!=='string'||e[key].length>2000))errors.push(`Draw event ${key}: at most 2000 characters`);
        if(e.contact_email!==undefined&&(typeof e.contact_email!=='string'||e.contact_email.length>254||!/^\S+@\S+\.\S+$/.test(e.contact_email)))errors.push('Draw event: enter a valid public contact email');
        try{new Intl.DateTimeFormat('en',{timeZone:e.timezone});}catch{errors.push('Draw event: use a valid time zone');}
        if(!Array.isArray(e.schedule)||e.schedule.length>100)errors.push('Draw schedule: at most 100 times');
        else{
          const seen=new Set();
          for(const item of e.schedule){
            const stamp=item?.date+'T'+item?.time;
            if(!item||typeof item!=='object'||typeof item.date!=='string'||typeof item.time!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)||!Number.isFinite(Date.parse(stamp+'Z'))||new Date(stamp+'Z').toISOString().slice(0,16)!==stamp)errors.push('Enter a valid draw date and 24-hour time');
            if(seen.has(stamp))errors.push('Duplicate draw time');seen.add(stamp);
          }
        }
      }
    }
    if(c.email_draw!==undefined){
      const d=c.email_draw;
      if(!d||typeof d!=='object'||Array.isArray(d))errors.push('Invalid email signup settings');
      else{
        if(typeof d.title!=='string'||!d.title.trim()||d.title.length>100)errors.push('Email prize popup needs a title up to 100 characters');
        if(d.description!==undefined&&(typeof d.description!=='string'||d.description.length>2000))errors.push('Email prize introduction is too long');
        if(!Array.isArray(d.draw_prizes)||d.draw_prizes.length>100||d.draw_prizes.some(p=>typeof p!=='string'||!p.trim()||p.length>500))errors.push('Email prizes: up to 100 lines, 500 characters each');
        if('artwork' in d&&(typeof d.artwork!=='string'||d.artwork&&(!d.artwork.startsWith('asset://')||!Object.hasOwn(c.images,d.artwork.slice(8)))))errors.push('Upload email signup artwork first');
      }
    }
    if(c.splash!==undefined){
      const s=c.splash;
      if(!s||typeof s!=='object'||Array.isArray(s))errors.push('Splash must be an object');
      else{
        if(s.text!==undefined&&(typeof s.text!=='string'||!s.text.trim()||s.text.length>80))errors.push('Splash text must contain 1–80 characters');
        for(const key of ['background_color','text_color'])if(s[key]!==undefined&&(typeof s[key]!=='string'||!/^#[0-9a-f]{6}$/i.test(s[key])))errors.push('Invalid splash color');
        if(s.artwork!==undefined&&(typeof s.artwork!=='string'||s.artwork&&(!s.artwork.startsWith('asset://')||!Object.hasOwn(c.images,s.artwork.slice(8)))))errors.push('Upload splash artwork first');
      }
    }
    for(const group of groups) {
      if(group==='notifications'&&c[group]===undefined)continue;
      if(!Array.isArray(c[group]) || c[group].length>200) {errors.push(`${group}: expected at most 200 entries`);continue;}
      ids[group]=new Map();
      for(const row of c[group]) {
        if(!row || typeof row!=='object' || Array.isArray(row)) {errors.push(`${group}: invalid entry`);continue;}
        if(typeof row.id!=='string'||!row.id.trim()||row.id!==row.id.trim()||(group!=='notifications'&&row.id.includes(':'))||ids[group].has(row.id)) errors.push(`${group}: missing or duplicate ID ${row.id}`);
        ids[group].set(row.id,row);
        const title = ['quests','partners'].includes(group)?row.name:row.title;
        if(typeof title!=='string'||!title.trim()) errors.push(`${row.id}: title/name required`);
        for(const flag of ['enabled','repeatable','show_banner','notify','requires_stars']) if(flag in row && typeof row[flag]!=='boolean') errors.push(`${row.id}: ${flag} must be Boolean`);
        if('publication_status' in row&&!['draft','live'].includes(row.publication_status))errors.push(`${row.id}: invalid publication status`);
        for(const key of ['start_at','end_at'])if(key in row&&(typeof row[key]!=='string'||row[key]!==''&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(row[key])||!Number.isFinite(Date.parse(row[key]))||new Date(row[key]).toISOString().replace('.000Z','Z')!==row[key])))errors.push(`${row.id}: ${key} must be a UTC date`);
        if(row.start_at&&row.end_at&&Date.parse(row.end_at)<=Date.parse(row.start_at))errors.push(`${row.id}: end must be after start`);
        if(group==='notifications'&&(typeof row.description!=='string'||!row.description.trim()))errors.push(`${row.id}: notification message required`);
        if(group==='notifications'&&row.publish_mode==='later'&&!row.start_at)errors.push(`${row.id}: choose a date and time for Publish later`);
        if(group==='notifications'&&row.publish_mode&&!['now','later'].includes(row.publish_mode))errors.push(`${row.id}: invalid publishing choice`);
        if(row.stock_revision!==undefined&&(!Number.isSafeInteger(row.stock_revision)||row.stock_revision<0))errors.push(`${row.id}: invalid stock revision`);
        if('claim_identity' in row&&row.claim_identity!=='online:'+row.id)errors.push(`${row.id}: invalid legacy claim identity`);
        if('artwork' in row && (typeof row.artwork!=='string'||row.artwork&&(!row.artwork.startsWith('asset://')||!Object.hasOwn(c.images,row.artwork.slice(8))))) errors.push(`${row.id}: upload its artwork first`);
        if(['quests','partners'].includes(group)&&'color' in row&&(typeof row.color!=='string'||!/^#?(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(row.color))) errors.push(`${row.id}: invalid colour`);
      }
    }
    if(errors.length) return errors;
    const codes=new Set(), analytics=new Set(), aliases=new Set();
    if(c.quests.length>20)errors.push('At most 20 quests may be configured');
    for(const p of c.partners) if(!['logo_text','full_image'].includes(p.banner_type===undefined?'logo_text':p.banner_type)) errors.push(`${p.id}: unknown promo format`);
    for(const row of c.challenges || []) {
      if(!row || typeof row!=='object') continue;
      if(row.booth_number!==undefined&&(typeof row.booth_number!=='string'||row.booth_number.length>24)) errors.push(`${row.id}: booth_number must be text up to 24 characters`);
      if(typeof row.value!=='string'||!row.value.trim()||row.value!==row.value.trim()||codes.has(row.value)) errors.push(`${row.id}: invalid/duplicate QR value`);
      codes.add(row.value);
      if(!integer(row.stars,1,10)) errors.push(`${row.id}: stars must be 1–10`);
      if(typeof row.analytics_key!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(row.analytics_key)||analytics.has(row.analytics_key)) errors.push(`${row.id}: use unique SQL-safe analytics keys`);
      analytics.add(row.analytics_key);
      if('legacy_keys' in row&&!Array.isArray(row.legacy_keys))errors.push(`${row.id}: legacy_keys must be an array`);
      else for(const alias of row.legacy_keys||[]){if(typeof alias!=='string'||!alias||aliases.has(alias))errors.push(`${row.id}: legacy_keys must be non-empty and globally unique`);aliases.add(alias);}
    }
    const questKeys=new Set();
    for(const q of c.quests || []) {
      if(!q || typeof q!=='object') continue;
      if(!Array.isArray(q.challenge_ids)||new Set(q.challenge_ids).size!==q.challenge_ids.length||q.challenge_ids.some(id=>!ids.challenges?.has(id))) {errors.push(`${q.id}: invalid challenge references`);continue;}
      if('analytics_key' in q&&(!/^quest([1-9]|1[0-9]|20)$/.test(q.analytics_key)||questKeys.has(q.analytics_key))) errors.push(`${q.id}: use unique quest1–quest20 analytics keys`);
      if('analytics_key' in q)questKeys.add(q.analytics_key);
      const available=q.challenge_ids.reduce((sum,id)=>sum+(ids.challenges.get(id).enabled===false?0:ids.challenges.get(id).stars),0);
      const required='required_stars' in q?q.required_stars:q.required_challenges;
      if(!integer(required,1)||q.enabled!==false&&required>available) errors.push(`Quest "${q.name||q.title||q.id}": target is ${required} stars, but enabled challenges currently award ${available}. Finish adding challenges or edit the target before publishing. Unfinished drafts can still be saved.`);
      for(const field of ['completion_bonus_stars','perfection_bonus_stars']) if(field in q&&!integer(q[field],0)) errors.push(`${q.id}: invalid ${field}`);
    }
    for(const r of c.reward_levels || []) {
      if(!r || typeof r!=='object') continue;
      if(!['claimable','daily_draw'].includes(r.reward_type===undefined?'claimable':r.reward_type))errors.push(`${r.id}: invalid reward type`);
      if(r.reward_type==='daily_draw'&&(!Array.isArray(r.draw_prizes)||r.draw_prizes.length>100||r.draw_prizes.some(p=>typeof p!=='string'||!p.trim()||p.length>500)))errors.push(`${r.id}: provide up to 100 prizes, each up to 500 characters`);
      if('quantity' in r&&!integer(r.quantity,0,1000000000)) errors.push(`${r.id}: quantity must be a non-negative whole number up to 1000000000`);
      if(!integer(r.stars_required,1)||('star_cost' in r&&!integer(r.star_cost,0))) errors.push(`${r.id}: invalid reward price`);
    }
    let pixels=0;
    for(const image of Object.values(c.images)){const error=validateImage(image);if(error)errors.push(error);else{const [w,h]=imageDimensions(image);pixels+=w*h;}}
    if(pixels>16*1024*1024)errors.push('Catalog images exceed the decoded memory budget');
    if(new TextEncoder().encode(JSON.stringify(c)).length>8*1024*1024) errors.push('Catalog exceeds 8 MB; resize/compress images');
    return errors;
  }
  function merge(base,content) {
    content=compactImages(content);
    const errors=validate(content);
    if(errors.length) throw new Error(errors.join('\n'));
    if(!base || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(base.CurrentExpoID)||!Array.isArray(base.rewards)) throw new Error('Load the existing expo feed first');
    if(base.ExpoResetInProgress) throw new Error('An expo reset is in progress. Publishing is blocked.');
    return {...clone(base),content:clone(content)};
  }
  function liveNotifications(c,now=Date.now()) {
    const result=[];
    for(const group of ['notifications','reward_levels','partners'])for(const item of c?.[group]||[]){
      if(item.enabled===false||(item.publication_status||'live')!=='live'||item.active===false)continue;
      if(group!=='notifications'&&item.notify!==true)continue;
      if(group==='partners'&&item.show_banner===false)continue;
      if(item.start_at&&(!Number.isFinite(Date.parse(item.start_at))||now<Date.parse(item.start_at)))continue;
      if(item.end_at&&(!Number.isFinite(Date.parse(item.end_at))||now>Date.parse(item.end_at)))continue;
      result.push({id:group+':'+item.id,title:item.notification_title||item.title||item.banner_title||item.name||'Expo Quest',message:item.notification_message||item.description||item.banner_message||'A new reward is available.'});
    }
    return result;
  }
  const api={groups,normalize,migrate,validate,merge,liveNotifications,compactImages,validateImage};
  if(typeof module!=='undefined') module.exports=api;
  root.ExpoCatalog=api;
})(globalThis);
