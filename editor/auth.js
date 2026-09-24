'use strict';
window.ExpoAuth=(()=>{
  let session=null,local=false,onReady=null;
  const byId=id=>document.getElementById(id),config=window.EXPO_AUTH_CONFIG||{};
  const message=text=>byId('auth-status').textContent=text;
  function gate(){byId('auth-gate').hidden=false;document.querySelector('main').inert=true;document.querySelector('header').inert=true;}
  function unlock(){byId('auth-gate').hidden=true;document.querySelector('main').inert=false;document.querySelector('header').inert=false;}
  async function auth(path,body,token){
    const response=await fetch(config.url+'/auth/v1/'+path,{method:'POST',signal:AbortSignal.timeout(20000),headers:{apikey:config.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
    if(!response.ok)throw Error('Sign-in failed. Check your organizer email/password and connection.');
    return response.status===204?null:response.json();
  }
  async function request(body,service='admin-content'){
    if(!['admin-content','admin-accounts'].includes(service))throw Error('Unknown service');
    if(local){
      if(service!=='admin-content'||body.action!=='load')throw Error('Sign in with your organizer account to use this feature.');
      const response=await fetch('https://mucsi.github.io/TestPage/rewards.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('Could not load the public feed.');return {sha:'local-preview',feed:await response.json()};
    }
    if(!session){gate();throw Error('Organizer sign-in required.');}
    if(Date.now()>session.expires){
      try{const next=await auth('token?grant_type=refresh_token',{refresh_token:session.refresh});session={access:next.access_token,refresh:next.refresh_token,expires:Date.now()+(next.expires_in-60)*1000};}catch{session=null;gate();throw Error('Session expired. Sign in again; your draft is kept in this tab.');}
    }
    const response=await fetch(config.url+'/functions/v1/'+service,{method:'POST',signal:AbortSignal.timeout(40000),headers:{apikey:config.key,Authorization:'Bearer '+session.access,'Content-Type':'application/json'},body:JSON.stringify(body)});
    let data;try{data=await response.json();}catch{throw Error('Content service is not available. Verify its deployment.');}
    if(!response.ok){if(response.status===401||(response.status===403&&service==='admin-content')){session=null;gate();}throw Error(data.error||'Service is not available. Verify its deployment.');}
    return data;
  }
  function init(ready){
    onReady=ready;gate();
    byId('local-preview').hidden=!['localhost','127.0.0.1','[::1]'].includes(location.hostname);
    byId('signin').onsubmit=async event=>{
      event.preventDefault();const submit=byId('signin-button');submit.disabled=true;message('Signing in…');
      try{
        if(!config.url?.startsWith('https://')||!config.key)throw Error('Organizer authentication is not configured.');
        const data=await auth('token?grant_type=password',{email:byId('login-email').value.trim(),password:byId('login-password').value});
        byId('login-password').value='';session={access:data.access_token,refresh:data.refresh_token,expires:Date.now()+(data.expires_in-60)*1000};local=false;
        await request({action:'load'});unlock();message('');await onReady();
      }catch(e){session=null;message(e.message);}finally{byId('login-password').value='';submit.disabled=false;}
    };
    byId('local-preview').onclick=async()=>{local=true;session=null;unlock();await onReady();};
    byId('signout').onclick=async()=>{const access=session?.access;session=null;local=false;gate();message('Signed out. Your unpublished draft stays in this tab until you close it.');if(access)try{await auth('logout?scope=local',null,access);}catch{/* local state is already cleared */}};
  }
  return {init,request,get local(){return local;}};
})();
