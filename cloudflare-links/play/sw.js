const CACHE='expoquest-web-shell-v2';
const shell=['./','index.html','style.css','mobile.css','app.mjs','core.mjs','storage.mjs','config.js','qr-vendor.js','manifest.webmanifest','visits.js','web-privacy.html','assets/logo.png','assets/scan.png','assets/explore.png','assets/redeem.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(shell))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
 // Never cache private API responses. Only our shell and immutable public assets.
 if(u.pathname.startsWith(new URL('./',self.location).pathname)&&shell.some(p=>new URL(p,self.location).pathname===u.pathname))e.respondWith(fetch(e.request,{signal:AbortSignal.timeout(4000)}).then(async r=>{if(!r.ok)throw Error('Offline');const c=await caches.open(CACHE);await c.put(e.request,r.clone());return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true})));
 else if(/^\/content\/(assets|catalogs)\//.test(u.pathname))e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r.ok)caches.open(CACHE+'-content').then(c=>c.put(e.request,r.clone()));return r;})));
});
