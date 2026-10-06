'use strict';
window.EXPO_AUTH_CONFIG.participantsPage=true;
(()=>{
  const actionsHeader=document.createElement('th');actionsHeader.textContent='Actions';document.querySelector('thead tr').append(actionsHeader);
  const el=id=>document.getElementById(id);let page=0,total=0,search='',generation=0,busy=false;
  function controls(){el('previous').disabled=busy||page===0;el('next').disabled=busy||(page+1)*50>=total;el('refresh').disabled=busy;}
  const number=value=>value===null||value===undefined?'—':Number(value).toLocaleString(undefined,{maximumFractionDigits:2});
  async function remove(row,button){
    if(busy)return;
    if(!confirm(`Delete the server profile for ${row.username||row.user_id}?\n\nTheir phone keeps its progress and will recreate this profile on its next sync. Reward-redemption history and spending are retained. This is not a permanent data-erasure request.`))return;
    const version=++generation;busy=true;controls();button.disabled=true;
    el('progress-status').textContent='Deleting participant profile…';
    try{
      const result=await ExpoAuth.request({action:'delete-participant',user_id:row.user_id,confirm:true});
      if(version!==generation)return;
      if(result.ok!==true)throw Error('Deletion was not confirmed. Refresh before retrying.');
      if(page>0&&page*50>=total-1)page--;
      await load();
    }catch(error){if(version===generation)el('progress-status').textContent=error.message;}
    finally{if(version===generation){busy=false;button.disabled=false;controls();}}
  }
  async function load(initial){
    const version=++generation;busy=true;controls();el('participants-body').replaceChildren();el('page-label').textContent='';el('progress-status').textContent='Loading participants…';
    try{
      const data=initial||await ExpoAuth.request({action:'participants',search,page});if(version!==generation)return;
      total=data.total;
      for(const row of data.rows){const tr=document.createElement('tr');
        for(const value of [row.user_id,row.username||'—',row.email||'Not provided',row.notifications_allowed===true?'Allowed':row.notifications_allowed===false?'Not allowed':'Unknown',number(row.current_balance),number(row.daily_draw_seats)+(row.email?'':' · no email'),number(row.max_star_gaining_speed)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
        const actions=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Delete user';button.onclick=()=>remove(row,button);actions.append(button);tr.append(actions);el('participants-body').append(tr);}
      el('progress-status').textContent=`${total} matching participants · Expo ${data.expo} · Updated ${new Date().toLocaleTimeString()}`;
      el('page-label').textContent=total?`${page*50+1}–${Math.min((page+1)*50,total)} of ${total}`:'No participants found';
    }catch(error){if(version===generation){total=0;el('progress-status').textContent=error.message+' Use Refresh to retry.';}}
    finally{if(version===generation){busy=false;controls();}}
  }
  el('search-form').onsubmit=event=>{event.preventDefault();if(busy)return;search=el('search').value.trim();page=0;load();};
  el('refresh').onclick=()=>load();el('previous').onclick=()=>{page--;load();};el('next').onclick=()=>{page++;load();};
  window.addEventListener('expo-auth-locked',()=>{generation++;el('participants-body').replaceChildren();el('search').value='';el('progress-status').textContent='Sign in to view participants.';el('page-label').textContent='';page=0;total=0;search='';busy=false;controls();});
  ExpoAuth.init(load);
})();
