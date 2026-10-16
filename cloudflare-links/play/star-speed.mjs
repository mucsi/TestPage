// Same interval metric as the native app: earned stars per minute between
// upload attempts. Persist this beside the local queue, scoped to user + expo.
export function restoreSpeed(value, now=Date.now()) {
 const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 return {maximum:finite(value?.maximum)?value.maximum:0,
  pending:finite(value?.pending)?value.pending:0,
  started_at:finite(value?.started_at)?value.started_at:now};
}
export function recordSpeed(value, stars, now=Date.now()) {
 const s=restoreSpeed(value,now);
 s.pending+=Number.isFinite(stars)?Math.max(0,stars):0;
 return s;
}
export function sampleSpeed(value, now=Date.now()) {
 const s=restoreSpeed(value,now),elapsed=now-s.started_at;
 // A clock rollback must not lose pending earnings or invent a rate.
 if(elapsed<0){s.started_at=now;return s;}
 if(elapsed===0)return s;
 s.maximum=Math.max(s.maximum,s.pending*60000/elapsed);
 s.pending=0;s.started_at=now;
 return s;
}
