// QR formatting only. No account, balance, inventory, or server validation.
export function approvalFor(raw){
 const text=String(raw||'').trim();
 if(!text.startsWith('EQCLAIM1:'))throw Error('Scan the claim QR shown after tapping Claim on a reward.');
 let claim;try{claim=JSON.parse(text.slice(9));}catch{throw Error('The claim QR could not be read. Try a fresh screenshot.');}
 if(!claim||typeof claim.id!=='string'||!claim.id||typeof claim.user_id!=='string'||!claim.user_id||!Number.isInteger(claim.cost)||claim.cost<0)throw Error('This image does not contain a complete reward claim QR.');
 return{approval:`EQAPPROVE1:${claim.id}:${claim.user_id}:${claim.cost}`,cost:claim.cost};
}
