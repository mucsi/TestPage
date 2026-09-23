(function(root){
  const clone=x=>JSON.parse(JSON.stringify(x));
  function assign(c,questId,challengeId,beforeId=null){
    const q=c.quests.find(q=>q.id===questId);
    if(!q||!c.challenges.some(r=>r.id===challengeId))throw Error('Unknown quest or challenge');
    if(beforeId===challengeId)return;
    q.challenge_ids=q.challenge_ids.filter(id=>id!==challengeId);
    const index=beforeId?q.challenge_ids.indexOf(beforeId):-1;
    q.challenge_ids.splice(index<0?q.challenge_ids.length:index,0,challengeId);
  }
  function unassign(c,questId,challengeId){const q=c.quests.find(q=>q.id===questId);if(q)q.challenge_ids=q.challenge_ids.filter(id=>id!==challengeId);}
  function freeKey(c,g){const keys=new Set(c[g].map(r=>r.analytics_key));const limit=g==='quests'?20:100;for(let i=1;i<=limit;i++){const key=g==='quests'?`quest${i}`:`challenge_${String(i).padStart(3,'0')}`;if(!keys.has(key))return key;}throw Error(`All ${limit} analytics slots are in use. You can reuse existing challenges across quests; creating more requires a backend expansion.`);}
  function create(c,g,id,source=null){
    if(c[g].some(r=>r.id===id))throw Error('ID already exists');
    const row=source?clone(source):{enabled:true,artwork:''};row.id=id;
    if(g==='challenges'){Object.assign(row,{analytics_key:freeKey(c,g),title:source?source.title+' (copy)':'New challenge',value:'QR-'+id,legacy_keys:[]});if(!source)Object.assign(row,{description:'',stars:1});}
    if(g==='quests'){Object.assign(row,{analytics_key:freeKey(c,g),name:source?source.name+' (copy)':'New quest'});if(!source)Object.assign(row,{description:'',challenge_ids:[],required_stars:1,completion_bonus_stars:0,perfection_bonus_stars:0});}
    if(g==='reward_levels'&&!source)Object.assign(row,{title:'New reward',description:'',stars_required:1,star_cost:1,repeatable:false});
    if(g==='partners'&&!source)Object.assign(row,{name:'New promotion',banner_title:'New promotion',banner_message:'',show_banner:true,color:'#ed1c24'});
    if(g==='notifications'&&!source)Object.assign(row,{title:'New announcement',description:'',publication_status:'live',publish_mode:'now'});
    c[g].push(row);return row;
  }
  const api={assign,unassign,create,freeKey};if(typeof module!=='undefined')module.exports=api;root.ExpoEditor=api;
})(globalThis);
