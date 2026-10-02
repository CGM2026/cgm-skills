(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PointAspects=factory();})(globalThis,function(){
 const norm=x=>(x%360+360)%360,signed=x=>norm(x+180)-180;
 const relations={0:['相合',0],2:['六分',60],3:['四分',90],4:['三分',120],6:['对分',180]};
 const modern=[['合',0,8],['半六分',30,2],['半刑',45,2],['六合',60,4],['五分',72,2],['四分',90,8],['三合',120,8],['补八分',135,2],['倍五分',144,2],['梅花',150,2],['对分',180,8]];
 const orbs={sun:15,moon:12,mercury:7,venus:7,mars:7,jupiter:9,saturn:9};
 function measure(point,planet,pointSpeed,mode='whole',limits=null){
  const d=Math.abs(point.sign_index-planet.sign_index),signRelation=relations[Math.min(d,12-d)];
  const directed=norm(planet.longitude-point.longitude),separation=Math.min(directed,360-directed);
  let relation=signRelation;
  if(mode==='light'){relation=Object.values(relations).reduce((a,b)=>Math.abs(separation-a[1])<=Math.abs(separation-b[1])?a:b);const a=limits?.light?.[point.key]??orbs[point.key]??5,b=limits?.light?.[planet.key]??orbs[planet.key]??5;if(Math.abs(separation-relation[1])>(a+b)/2)return {planet:planet.key,name:'无相位',phase:'—',separation,orb:null};}
  if(mode==='modern'){relation=modern.filter(([name,angle,limit])=>Math.abs(separation-angle)<=(limits?.modern?.[name]??limit)+1e-10).sort((a,b)=>Math.abs(separation-a[1])-Math.abs(separation-b[1]))[0];if(!relation)return {planet:planet.key,name:'无相位',phase:'—',separation,orb:null};}
  if(!relation)return {planet:planet.key,name:'不合意',phase:'—',separation,orb:null};
  const [name,angle]=relation,targets=angle===0||angle===180?[angle]:[angle,360-angle];
  const errors=targets.map(t=>signed(directed-t)),error=errors.reduce((a,b)=>Math.abs(a)<=Math.abs(b)?a:b),orb=Math.abs(error);
  const relative=planet.speed_longitude_per_day-pointSpeed;
  const phase=orb<1e-7?'精准':!Number.isFinite(relative)||Math.abs(relative)<1e-12?'—':error*relative<0?'入':'出';
  return {planet:planet.key,name,phase,separation,orb};
 }
 function degrees(value){if(value===null)return '—';const minutes=Math.round(value*60);return Math.floor(minutes/60)+'°'+String(minutes%60).padStart(2,'0')+'′';}
 return {measure,degrees};
});

