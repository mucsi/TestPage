const opening=new Promise((resolve,reject)=>{
 const r=indexedDB.open('expoquest-web-v1',1);
 r.onupgradeneeded=()=>r.result.createObjectStore('records');
 r.onsuccess=()=>resolve(r.result);
 r.onerror=()=>reject(Error('Local saving is unavailable. Do not continue in private browsing.'));
});
export async function read(key){const db=await opening;return new Promise((resolve,reject)=>{const t=db.transaction('records');const r=t.objectStore('records').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function change(key,fn){const db=await opening;return new Promise((resolve,reject)=>{
 const t=db.transaction('records','readwrite'),store=t.objectStore('records'),r=store.get(key);let result;
 r.onsuccess=()=>{try{result=fn(r.result);store.put(result,key);}catch(e){t.abort();reject(e);}};
 t.oncomplete=()=>resolve(result);t.onabort=()=>reject(Error('Could not save on this device. Nothing was submitted.'));t.onerror=()=>reject(t.error);
});}
export const write=(key,value)=>change(key,()=>value);
export async function remove(key){const db=await opening;return new Promise((resolve,reject)=>{const t=db.transaction('records','readwrite');t.objectStore('records').delete(key);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}

