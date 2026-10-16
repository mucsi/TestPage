export const emptyState = () => ({scans:{}, bonuses:{}});
export const enabled = x => x.enabled !== false;
export const rewardKey = r => r.claim_identity || 'points:' + r.id;
export const cost = r => Math.max(0, Number(r.star_cost ?? r.stars_required ?? 0));
export function totals(s, spent=0, draws=true) {
 const stars=Object.values(s.scans).reduce((n,x)=>n+x.stars,0)+Object.values(s.bonuses).reduce((n,x)=>n+x,0);
 return {stars,balance:stars-spent,entries:draws?stars+1:0};
}
export function questStatus(q,content,s) {
 const cs=content.challenges.filter(c=>enabled(c)&&q.challenge_ids.includes(c.id));
 const available=cs.reduce((n,c)=>n+Number(c.stars||0),0);
 const got=cs.filter(c=>s.scans[c.id]).reduce((n,c)=>n+Number(c.stars||0),0);
 return {got,available,complete:available>0&&got>=Number(q.required_stars||0),perfect:available>0&&cs.every(c=>!!s.scans[c.id])};
}
export function applyScan(state,content,value) {
 const s=structuredClone(state), c=content.challenges.find(c=>enabled(c)&&(c.value===value||(c.legacy_qr_values||[]).includes(value)));
 if(!c)throw Error('This is not an enabled challenge QR for this event.');
 if(s.scans[c.id])return {state:s,duplicate:true,awarded:0};
 const before=totals(s).stars;
 s.scans[c.id]={stars:Number(c.stars||0),key:c.analytics_key||'',title:c.title};
 for(const q of content.quests.filter(enabled)) {
  const p=questStatus(q,content,s);
  if(p.complete&&!Object.hasOwn(s.bonuses,q.id+':complete'))s.bonuses[q.id+':complete']=Number(q.completion_bonus_stars||0);
  if(p.perfect&&!Object.hasOwn(s.bonuses,q.id+':perfect'))s.bonuses[q.id+':perfect']=Number(q.perfection_bonus_stars||0);
 }
 return {state:s,duplicate:false,awarded:totals(s).stars-before};
}
export function applyOperations(state,content,ops) {
 let s=structuredClone(state);const results=[];
 for(const op of ops) {
  if(!op||typeof op.id!=='string'||!/^[a-f0-9]{32}$/.test(op.id)||typeof op.qr!=='string'||op.qr.length>600)throw Error('Invalid saved scan.');
  try {const result=applyScan(s,content,op.qr);s=result.state;results.push({id:op.id,ok:true,awarded:result.awarded});}
  catch {results.push({id:op.id,ok:false,error:'Challenge is no longer enabled or recognized.'});}
 }
 return {state:s,results};
}
export function projection(user,s,content) {
 const row={user_id:user.id,username:user.username,email:user.draws?user.email:'',notifications_allowed:false};
 row.max_star_gaining_speed=Number(s.max_star_gaining_speed)||0;
 for(const c of content.challenges)if(/^challenge_\d{3}$/.test(c.analytics_key||''))row[c.analytics_key]=!!s.scans[c.id];
 for(const q of content.quests)if(/^quest\d+$/.test(q.analytics_key||''))row[q.analytics_key]=questStatus(q,content,s).complete;
 return row;
}
export function approvalMatches(value,claim,userId=claim.user_id) {
 return value==='EQAPPROVE1:'+claim.id+':'+userId+':'+claim.cost;
}
export function mergeStarSpeed(state, maximum=0) {
 if(typeof maximum!=='number'||!Number.isFinite(maximum)||maximum<0)throw Error('Invalid maximum stars/minute.');
 return {...state,max_star_gaining_speed:Math.max(Number(state.max_star_gaining_speed)||0,maximum)};
}

