// Build an atomic Cloudflare Pages snapshot from the editor's existing public feed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// The application repo keeps the editor under tools; the publishing repo uses /editor.
const catalogPath=path.join(__dirname,'../content-admin/catalog.js');
const {compactImages,validateImage}=require(fs.existsSync(catalogPath)?catalogPath:path.join(__dirname,'../../editor/catalog.js'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function build(feed){
  if(!feed?.content?.images||!Array.isArray(feed.rewards)||typeof feed.CurrentExpoID!=='string')throw Error('Invalid source feed');
  feed={...feed,content:compactImages(feed.content)};
  const compact=structuredClone(feed),files=new Map();
  for(const [id,uri] of Object.entries(feed.content.images)){
    const error=validateImage(uri);if(error)throw Error('Invalid image '+id+': '+error);
    const match=typeof uri==='string'&&uri.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+=*)$/);
    if(!match)throw Error('Invalid image '+id);
    const bytes=Buffer.from(match[2],'base64'),sha256=hash(bytes);
    if(!bytes.length||bytes.length>3*1024*1024)throw Error('Invalid image size');
    const file=`content/assets/${sha256}.${match[1]==='png'?'png':'jpg'}`;
    files.set(file,bytes);
    compact.content.images[id]={path:'/'+file,sha256,bytes:bytes.length,mime:'image/'+match[1]};
  }
  const bytes=Buffer.from(JSON.stringify(compact)),version=hash(bytes),catalog=`content/catalogs/${version}.json`;
  if(bytes.length>8*1024*1024)throw Error('Catalog exceeds 8 MB');
  files.set(catalog,bytes);
  const manifest={delivery_schema:1,version,catalog:'/'+catalog,bytes:bytes.length,CurrentExpoID:feed.CurrentExpoID,ExpoResetInProgress:feed.ExpoResetInProgress===true};
  files.set('content/manifest.json',Buffer.from(JSON.stringify(manifest)));
  // Compatibility endpoint for existing clients/admin tools; new visitor builds use the manifest.
  files.set('rewards.json',Buffer.from(JSON.stringify(feed)));
  return {manifest,files};
}
function write(source,output,links){
  const feed=JSON.parse(fs.readFileSync(source,'utf8')),result=build(feed);
  fs.mkdirSync(output,{recursive:true});
  fs.cpSync(links,output,{recursive:true,filter:p=>!p.endsWith('.import')});
  for(const [file,bytes] of result.files){const target=path.join(output,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
  const headers=fs.readFileSync(path.join(links,'_headers'),'utf8')+`\n/content/manifest.json\n  Cache-Control: public, max-age=0, must-revalidate\n  Access-Control-Allow-Origin: *\n/content/catalogs/*\n  Cache-Control: public, max-age=31536000, immutable\n  Access-Control-Allow-Origin: *\n/content/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n  Access-Control-Allow-Origin: *\n/rewards.json\n  Cache-Control: public, max-age=0, must-revalidate\n  Access-Control-Allow-Origin: *\n`;
  fs.writeFileSync(path.join(output,'_headers'),headers);
  // Explicit 404 prevents a missing asset returning the landing page with HTTP 200.
  fs.writeFileSync(path.join(output,'404.html'),'<!doctype html><title>Not found</title><h1>Not found</h1>');
  console.log(JSON.stringify({version:result.manifest.version,manifestBytes:result.files.get('content/manifest.json').length,catalogBytes:result.manifest.bytes,imageCount:Object.keys(feed.content.images).length}));
}
module.exports={build,hash};
if(require.main===module)write(process.argv[2]||'rewards.json',process.argv[3]||'dist-public',process.argv[4]||'cloudflare-links');
