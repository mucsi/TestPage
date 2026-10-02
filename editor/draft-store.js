'use strict';
// Drafts include artwork, so use IndexedDB rather than size-limited localStorage.
// Authentication tokens are never stored here.
window.ExpoDrafts=(()=>{
  let opening;
  function open(){
    if(!opening)opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open('expo-content-drafts',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>{opening=null;reject(request.error);};
    });
    return opening;
  }
  async function run(mode,operation){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('drafts',mode),request=operation(transaction.objectStore('drafts'));
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onerror=transaction.onabort=()=>reject(transaction.error||Error('Draft storage unavailable'));
    });
  }
  return {
    save:record=>run('readwrite',store=>store.put(record)),
    remove:id=>run('readwrite',store=>store.delete(id)),
    async removeIfUnchanged(id,updated){
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),request=store.get(id);
        request.onsuccess=()=>{if(request.result?.updated===updated)store.delete(id);};
        tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('Draft cleanup failed'));
      });
    },
    async list(owner,source){return (await run('readonly',store=>store.getAll())).filter(r=>r.owner===owner&&r.source.repo===source.repo&&r.source.branch===source.branch).sort((a,b)=>b.updated-a.updated);}
  };
})();
