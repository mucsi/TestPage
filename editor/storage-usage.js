/* Read-only size analysis. Uses the same compacted image set as publication. */
(function(root){
 const LIMIT=8*1024*1024,PIXELS=16*1024*1024,encoder=new TextEncoder(),cache=new Map();
 const labels={partners:'Promo banners',challenges:'Challenges',quests:'Quests',reward_levels:'Rewards',notifications:'Notifications',splash:'Splash screen',email_draw:'Email / daily draws'};
 const bytes=v=>encoder.encode(JSON.stringify(v)).length;
 function imageInfo(uri){
  if(cache.has(uri))return cache.get(uri);
  const out={file:0,pixels:0,width:0,height:0,encoded:typeof uri==='string'?encoder.encode(uri).length:bytes(uri),serialized:bytes(uri),invalid:false};
  try{
   if(typeof uri!=='string'||!/^data:image\/(png|jpeg);base64,/.test(uri))throw Error();
   const data=uri.slice(uri.indexOf(',')+1);out.file=data.length*3/4-(data.endsWith('==')?2:data.endsWith('=')?1:0);
   const raw=atob(uri.startsWith('data:image/png')?data.slice(0,44):data),b=i=>raw.charCodeAt(i),u16=i=>b(i)*256+b(i+1);
   if(uri.startsWith('data:image/png')){out.width=b(16)*16777216+b(17)*65536+u16(18);out.height=b(20)*16777216+b(21)*65536+u16(22);}
   else{let i=2;while(i+4<raw.length){if(b(i++)!==255)throw Error();while(b(i)===255)i++;const marker=b(i++);if(marker===218||marker===217)break;if(marker===1||marker>=208&&marker<=215)continue;const n=u16(i);if(n<2)throw Error();if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){out.height=u16(i+3);out.width=u16(i+5);break;}i+=n;}}
   if(!out.width||!out.height||!Number.isFinite(out.width*out.height))throw Error();out.pixels=out.width*out.height;
  }catch{out.invalid=true;}
  cache.set(uri,out);return out;
 }
 function analyze(content,base=null){
  const refs=new Map(),images=content.images||{};
  function visit(value,owner){if(typeof value==='string'&&value.startsWith('asset://')){const key=value.slice(8);if(!refs.has(key))refs.set(key,new Map());refs.get(key).set(owner.group+':'+owner.id,owner);}else if(value&&typeof value==='object')Object.values(value).forEach(v=>visit(v,owner));}
  for(const [group,value] of Object.entries(content))if(group!=='images'){
   if(Array.isArray(value))value.forEach((row,i)=>visit(row,{group,id:row?.id||String(i),name:row?.title||row?.name||row?.banner_title||labels[group]||group}));
   else visit(value,{group,id:group,name:labels[group]||group});
  }
  const kept={},rows=[],unused=[];let imageBytes=0,fileBytes=0,pixels=0;
  for(const [key,uri] of Object.entries(images)){
   const info=imageInfo(uri),owners=[...(refs.get(key)?.values()||[])],groups=[...new Set(owners.map(x=>x.group))];
   const row={key,...info,owners,category:groups.length>1?'Shared images':labels[groups[0]]||'Other content'};
   if(!owners.length){unused.push(row);continue;}
   kept[key]=uri;rows.push(row);imageBytes+=info.encoded;fileBytes+=info.file;pixels+=info.pixels;
  }
  // Only serialize metadata during edits. Image sizes are cached until replaced.
  const metadata={...content,images:{}};
  const imageObjectSize=list=>list.reduce((n,r)=>n+bytes(r.key)+1+r.serialized,0)+Math.max(0,list.length-1);
  const imageStructure=imageObjectSize(rows),catalogBytes=bytes(metadata)+imageStructure,feedBytes=base?bytes({...base,content:metadata})+imageStructure:catalogBytes;
  const categories=new Map();for(const row of rows)categories.set(row.category,(categories.get(row.category)||0)+row.encoded);
  categories.set('Text, settings & JSON structure',catalogBytes-imageBytes);
  if(base)categories.set('Other feed data',feedBytes-catalogBytes);
  const current=new Set(Object.values(images));for(const key of cache.keys())if(!current.has(key))cache.delete(key);
  return {limit:LIMIT,pixelLimit:PIXELS,catalogBytes,feedBytes,draftBytes:bytes(metadata)+imageObjectSize([...rows,...unused]),imageBytes,fileBytes,pixels,rows,unused,missing:[...refs.keys()].filter(k=>!(k in images)),categories:[...categories].sort((a,b)=>b[1]-a[1])};
 }
 function size(n){return n>=1024*1024?(n/1024/1024).toFixed(2)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n+' B';}
 function mount(box,report){
  const element=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const open=box.querySelector('details')?.open||false,sort=box.querySelector('select')?.value||'encoded';
  box.replaceChildren();const details=element('details');details.open=open;
  const summary=element('summary',undefined,'storage-heading'),used=report.feedBytes,over=used>LIMIT;
  summary.append(element('strong','Catalog storage'),element('span',size(used)+' / 8 MB',over?'storage-over':''));
  const meter=element('progress');meter.max=LIMIT;meter.value=Math.min(used,LIMIT);meter.setAttribute('aria-label','Publishing size');
  summary.append(meter,element('span',over?size(used-LIMIT)+' over limit':size(LIMIT-used)+' remaining'),element('span','View breakdown ▾','storage-hint'));details.append(summary);
  details.append(element('p','Current draft after unused images are excluded. Includes disabled items. The 8 MB check measures JSON with base64-encoded images, not the original uploads or total device RAM. 1 MB = 1,048,576 bytes.','storage-note'));
  const metrics=element('div',undefined,'storage-metrics');
  metrics.append(element('p','Image files: '+size(report.fileBytes)),element('p','Images in publication: '+size(report.imageBytes)),element('p','Decoded artwork estimate: '+size(report.pixels*4)+' / 64 MB'+(report.pixels>PIXELS?' — over limit':''),report.pixels>PIXELS?'storage-over':''));
  details.append(metrics,element('p','Decoded estimate = width × height × 4 bytes. This reflects the separate 16,777,216-pixel artwork budget, not measured app memory. Reducing dimensions helps this budget; JPEG compression alone does not.','storage-note'));
  const bars=element('div',undefined,'storage-categories');
  for(const [name,n] of report.categories){const row=element('div',undefined,'storage-category'),bar=element('progress');bar.max=Math.max(used,1);bar.value=n;bar.setAttribute('aria-label',name);row.append(element('span',name),bar,element('strong',size(n)+' · '+(100*n/Math.max(used,1)).toFixed(1)+'%'));bars.append(row);}
  details.append(bars);
  if(report.unused.length)details.append(element('p',report.unused.length+' unused images ('+size(report.unused.reduce((n,r)=>n+r.encoded,0))+') remain in the local draft but are automatically excluded from publishing.','storage-note'));
  if(report.missing.length||report.rows.some(r=>r.invalid))details.append(element('p','Some images are missing or invalid. The memory estimate may be incomplete; replace the affected artwork before publishing.','storage-over'));
  const heading=element('div',undefined,'storage-list-heading'),select=element('select');select.setAttribute('aria-label','Sort image usage');
  for(const [v,t] of [['encoded','Largest publishing size'],['pixels','Largest decoded memory']]){const o=element('option',t);o.value=v;select.append(o);}select.value=sort;
  heading.append(element('h3','Images ('+report.rows.length+' unique)'),select);details.append(heading);
  const wrap=element('div',undefined,'storage-table-wrap'),table=element('table'),head=element('thead'),tr=element('tr');
  for(const t of ['Used by','Image file','In publication','Dimensions','Decoded estimate'])tr.append(element('th',t));head.append(tr);table.append(head);
  const body=element('tbody');table.append(body);wrap.append(table);details.append(wrap);
  function renderRows(){body.replaceChildren();for(const row of [...report.rows].sort((a,b)=>b[select.value]-a[select.value])){const tr=element('tr'),name=element('td');name.append(element('strong',row.owners.map(o=>o.name).join(' · ')),element('small',row.category+(row.owners.length>1?' · shared; counted once':'')));tr.append(name,element('td',size(row.file)),element('td',size(row.encoded)),element('td',row.invalid?'Invalid':row.width+' × '+row.height),element('td',row.invalid?'Unknown':size(row.pixels*4)));body.append(tr);}}
  select.onchange=renderRows;renderRows();box.append(details);
 }
 let timer;function schedule(box,get){clearTimeout(timer);timer=setTimeout(()=>{const {content,base}=get();if(content)mount(box,analyze(content,base));},650);}
 const api={analyze,size,mount,schedule};if(typeof module!=='undefined')module.exports=api;root.ExpoStorageUsage=api;
})(globalThis);
