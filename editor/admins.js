'use strict';
(() => {
  const byId=id=>document.getElementById(id);
  const launch=document.createElement('button');launch.type='button';launch.className='secondary';launch.textContent='Admins';
  document.querySelector('header .actions').prepend(launch);
  const dialog=document.createElement('dialog');dialog.id='admin-accounts';
  dialog.innerHTML=`<form method="dialog"><div class="section-title"><h2>Admin accounts</h2><button class="secondary">Close</button></div></form>
    <p>Only the master admin can manage access. New accounts are regular phone-app admins, not content editors. The existing master cannot be changed.</p>
    <p id="admins-status" role="status" aria-live="polite"></p>
    <button id="admins-refresh" class="secondary" type="button">Refresh list</button><div id="admins-list"></div>
    <form id="admins-form"><h3>Add a regular admin</h3>
    <label>Account type<select id="admins-mode"><option value="create">Create new account</option><option value="grant">Grant access to existing account</option></select></label>
    <label>Email<input id="admins-email" type="email" autocomplete="off" maxlength="254" required></label>
    <label id="admins-password-label">Initial password<input id="admins-password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>
    <p id="admins-password-help" class="muted">Use at least 12 characters and share it privately with the staff member. The account is confirmed by you; no email is sent. Passwords are not saved in the editor or published to GitHub.</p>
    <button id="admins-submit" type="submit">Create regular admin</button></form>
    <p class="muted">Access changes apply immediately—no content publication needed. Offline phones learn about revoked access when they reconnect.</p>`;
  document.body.append(dialog);
  let busy=false;
  const status=value=>byId('admins-status').textContent=value;
  function lock(value){busy=value;byId('admins-form').inert=value;byId('admins-refresh').disabled=value;byId('admins-list').inert=value;}
  const request=body=>ExpoAuth.request(body,'admin-accounts');
  async function refresh(){
    byId('admins-list').replaceChildren();
    const data=await request({action:'list'});
    for(const admin of data.admins){
      const row=document.createElement('div');row.className='section-title';
      const text=document.createElement('span');text.textContent=admin.email+' · '+(admin.role==='master'?'Master · protected':admin.active?'Admin · active':'Admin · revoked');row.append(text);
      if(admin.role!=='master'){
        const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=admin.active?'Revoke access':'Restore access';
        button.onclick=()=>run(async()=>{
          if(!confirm((admin.active?'Revoke':'Restore')+' admin access for '+admin.email+'?'))return;
          await request({action:admin.active?'revoke':'grant',email:admin.email});await refresh();status('Admin access updated.');
        });row.append(button);
      }
      byId('admins-list').append(row);
    }
    byId('admins-form').hidden=false;
  }
  async function run(fn){if(busy)return;lock(true);status('Connecting…');try{await fn();}catch(error){status(error.message||'Request failed. Refresh before retrying.');}finally{lock(false);}}
  launch.onclick=()=>{byId('admins-form').hidden=true;dialog.showModal();run(async()=>{await refresh();status('Admin list is up to date.');});};
  byId('admins-refresh').onclick=()=>run(async()=>{byId('admins-form').hidden=true;await refresh();status('Admin list is up to date.');});
  byId('admins-mode').onchange=()=>{
    const create=byId('admins-mode').value==='create';byId('admins-password-label').hidden=!create;byId('admins-password-help').hidden=!create;
    byId('admins-password').required=create;byId('admins-password').value='';byId('admins-submit').textContent=create?'Create regular admin':'Grant admin access';
  };
  byId('admins-form').onsubmit=event=>{
    event.preventDefault();run(async()=>{
      const action=byId('admins-mode').value,email=byId('admins-email').value.trim();
      if(!confirm((action==='create'?'Create a regular admin account':'Grant regular admin access')+' for '+email+'?'))return;
      const body={action,email};if(action==='create')body.password=byId('admins-password').value;
      byId('admins-password').value='';
      try{await request(body);}finally{delete body.password;}
      byId('admins-form').reset();byId('admins-mode').onchange();await refresh();status('Regular admin access is ready. They can sign in to Expo Quest Admin on their phone.');
    });
  };
  dialog.addEventListener('close',()=>{byId('admins-password').value='';byId('admins-email').value='';byId('admins-list').replaceChildren();});
})();
