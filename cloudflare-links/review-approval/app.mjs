import {approvalFor} from './claim.mjs';
const $=s=>document.querySelector(s);
let controls=null,generation=0,busy=false;
const status=(text,error=false)=>{$('#status').textContent=text;$('#status').classList.toggle('error',error);};
function stopCamera(){generation++;controls?.stop();controls=null;const video=$('#camera');video.srcObject?.getTracks().forEach(t=>t.stop());video.srcObject=null;$('#camera-panel').hidden=true;}
async function showApproval(raw){
 const result=approvalFor(raw);stopCamera();
 await QRTools.toCanvas($('#approval-qr'),result.approval,{width:480,margin:4,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}});
 $('#download').href=$('#approval-qr').toDataURL('image/png');$('#cost').textContent=`Claim cost: ${result.cost} stars`;
 $('#input-panel').hidden=true;$('#result').hidden=false;status('Approval QR ready. Scan it with the app while the same claim is open.');$('#result').scrollIntoView({behavior:'smooth',block:'start'});
}
$('#scan').onclick=async()=>{
 if(busy)return;stopCamera();const current=generation;let handled=false;
 $('#camera-panel').hidden=false;status('Allow camera access, then point at the claim QR.');
 try{
  const active=await new QRTools.BrowserQRCodeReader().decodeFromConstraints({video:{facingMode:'environment'},audio:false},$('#camera'),async result=>{
   if(!result||handled||current!==generation)return;handled=true;
   try{await showApproval(result.getText());}catch(e){handled=false;status(e.message,true);}
  });
  if(current!==generation||handled)active.stop();else controls=active;
 }catch{if(current===generation){stopCamera();status('Camera unavailable. Allow camera access, or upload a screenshot instead.',true);}}
};
$('#cancel').onclick=()=>{stopCamera();status('Choose a claim screenshot, or start the camera again.');};
$('#claim-file').onchange=async()=>{
 const file=$('#claim-file').files[0];if(!file||busy)return;busy=true;stopCamera();$('#scan').disabled=true;status('Reading claim screenshot…');
 let url;
 try{
  if(file.size>16*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPG or WebP screenshot under 16 MB.');
  url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();
  const decoded=await new QRTools.BrowserQRCodeReader().decodeFromImageElement(image);await showApproval(decoded.getText());
 }catch(e){status(e.message?.includes('claim')||e.message?.includes('screenshot')?e.message:'No readable QR found. Upload a sharp screenshot showing the whole claim QR.',true);}
 finally{if(url)URL.revokeObjectURL(url);busy=false;$('#scan').disabled=false;$('#claim-file').value='';}
};
$('#next').onclick=()=>{stopCamera();$('#result').hidden=true;$('#input-panel').hidden=false;$('#claim-file').value='';const c=$('#approval-qr');c.getContext('2d').clearRect(0,0,c.width,c.height);$('#download').removeAttribute('href');status('Ready for another claim.');};
window.addEventListener('pagehide',stopCamera);
if(window.REVIEW_APPROVAL_ENABLED!==true){$('#input-panel').hidden=true;status('Review approvals are currently closed.');}
