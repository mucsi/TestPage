/* Pure validation shared by the browser editor and offline Node tests. */
(function(root) {
  const groups = ['quests','challenges','reward_levels','partners','notifications'];
  const clone = x => JSON.parse(JSON.stringify(x));
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
    const integer=(v,min,max=1000000)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
    if (!c || c.schema_version!==1 || !c.images || typeof c.images!=='object' || Array.isArray(c.images)) return ['Invalid catalog version/images'];
    for(const group of groups) {
      if(group==='notifications'&&c[group]===undefined)continue;
      if(!Array.isArray(c[group]) || c[group].length>200) {errors.push(`${group}: expected at most 200 entries`);continue;}
      ids[group]=new Map();
      for(const row of c[group]) {
        if(!row || typeof row!=='object' || Array.isArray(row)) {errors.push(`${group}: invalid entry`);continue;}
        if(typeof row.id!=='string'||!row.id.trim()||row.id!==row.id.trim()||ids[group].has(row.id)) errors.push(`${group}: missing or duplicate ID ${row.id}`);
        ids[group].set(row.id,row);
        const title = ['quests','partners'].includes(group)?row.name:row.title;
        if(typeof title!=='string'||!title.trim()) errors.push(`${row.id}: title/name required`);
        for(const flag of ['enabled','repeatable','show_banner','notify','requires_stars']) if(flag in row && typeof row[flag]!=='boolean') errors.push(`${row.id}: ${flag} must be Boolean`);
        if(row.publication_status&&!['draft','live'].includes(row.publication_status))errors.push(`${row.id}: invalid publication status`);
        for(const key of ['start_at','end_at'])if(row[key]&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(row[key])||!Number.isFinite(Date.parse(row[key]))||new Date(row[key]).toISOString().replace('.000Z','Z')!==row[key]))errors.push(`${row.id}: ${key} must be a UTC date`);
        if(row.start_at&&row.end_at&&Date.parse(row.end_at)<=Date.parse(row.start_at))errors.push(`${row.id}: end must be after start`);
        if(group==='notifications'&&(typeof row.description!=='string'||!row.description.trim()))errors.push(`${row.id}: notification message required`);
        if(row.claim_identity&&row.claim_identity!=='online:'+row.id)errors.push(`${row.id}: invalid legacy claim identity`);
        if(row.artwork && (typeof row.artwork!=='string'||!row.artwork.startsWith('asset://')||!c.images[row.artwork.slice(8)])) errors.push(`${row.id}: upload its artwork first`);
        if(row.color && !/^#[0-9a-f]{6}$/i.test(row.color)) errors.push(`${row.id}: invalid colour`);
      }
    }
    if(errors.length) return errors;
    const codes=new Set(), analytics=new Set();
    for(const p of c.partners) if(!['logo_text','full_image'].includes(p.banner_type||'logo_text')) errors.push(`${p.id}: unknown promo format`);
    for(const row of c.challenges || []) {
      if(!row || typeof row!=='object') continue;
      if(typeof row.value!=='string'||!row.value.trim()||row.value!==row.value.trim()||codes.has(row.value)) errors.push(`${row.id}: invalid/duplicate QR value`);
      codes.add(row.value);
      if(!integer(row.stars,1,5)) errors.push(`${row.id}: stars must be 1–5`);
      if(!/^challenge_(00[1-9]|0[1-9][0-9]|100)$/.test(row.analytics_key)||analytics.has(row.analytics_key)) errors.push(`${row.id}: use unique challenge_001–challenge_100 analytics keys`);
      analytics.add(row.analytics_key);
    }
    const questKeys=new Set();
    for(const q of c.quests || []) {
      if(!q || typeof q!=='object') continue;
      if(!Array.isArray(q.challenge_ids)||new Set(q.challenge_ids).size!==q.challenge_ids.length||q.challenge_ids.some(id=>!ids.challenges?.has(id))) {errors.push(`${q.id}: invalid challenge references`);continue;}
      if(!/^quest([1-9]|1[0-9]|20)$/.test(q.analytics_key)||questKeys.has(q.analytics_key)) errors.push(`${q.id}: use unique quest1–quest20 analytics keys`);
      questKeys.add(q.analytics_key);
      const available=q.challenge_ids.reduce((sum,id)=>sum+(ids.challenges.get(id).enabled===false?0:ids.challenges.get(id).stars),0);
      if(!integer(q.required_stars,1)||q.enabled!==false&&q.required_stars>available) errors.push(`${q.id}: unreachable star target`);
      for(const field of ['completion_bonus_stars','perfection_bonus_stars']) if(field in q&&!integer(q[field],0)) errors.push(`${q.id}: invalid ${field}`);
    }
    for(const r of c.reward_levels || []) {
      if(!r || typeof r!=='object') continue;
      if(!integer(r.stars_required,1)||('star_cost' in r&&!integer(r.star_cost,0))) errors.push(`${r.id}: invalid reward price`);
    }
    for(const image of Object.values(c.images)) if(typeof image!=='string'||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(image)||image.length>3*1024*1024) errors.push('Invalid or oversized image');
    if(new TextEncoder().encode(JSON.stringify(c)).length>8*1024*1024) errors.push('Catalog exceeds 8 MB; resize/compress images');
    return errors;
  }
  function merge(base,content) {
    const errors=validate(content);
    if(errors.length) throw new Error(errors.join('\n'));
    if(!base || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(base.CurrentExpoID)||!Array.isArray(base.rewards)) throw new Error('Load the existing expo feed first');
    if(base.ExpoResetInProgress) throw new Error('An expo reset is in progress. Publishing is blocked.');
    return {...clone(base),content:clone(content)};
  }
  const api={groups,normalize,migrate,validate,merge};
  if(typeof module!=='undefined') module.exports=api;
  root.ExpoCatalog=api;
})(globalThis);
