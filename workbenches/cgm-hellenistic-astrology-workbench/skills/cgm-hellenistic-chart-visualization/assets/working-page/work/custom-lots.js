(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CustomLots=factory();})(globalThis,function(){
 const signs='aries taurus gemini cancer leo virgo libra scorpio sagittarius capricorn aquarius pisces'.split(' ');
 const names={sun:'太阳',moon:'月亮',mercury:'水星',venus:'金星',mars:'火星',jupiter:'木星',saturn:'土星',asc:'上升',dsc:'下降',mc:'中天',ic:'天底'};
 const signNames='白羊 金牛 双子 巨蟹 狮子 处女 天秤 天蝎 射手 摩羯 水瓶 双鱼'.split(' ');
 const rulers='mars venus mercury moon sun mercury venus mars jupiter saturn saturn jupiter'.split(' ');
 const norm=n=>((n%360)+360)%360;
 const point=key=>({type:'point',value:key});
 const lot=(key,name,note,start,add,subtract,reverse=true)=>({key,name,note,visible:false,reverse,start:point(start),add:point(add),subtract:point(subtract)});
 const palette=[{name:'朱红',color:'#a64625'},{name:'浓金赭',color:'#956200'},{name:'松绿',color:'#2d7046'},{name:'青碧',color:'#007f89'},{name:'靛蓝',color:'#2b56b4'},{name:'赭橙',color:'#ca6c22'},{name:'藏青',color:'#23465b'},{name:'墨色',color:'#39352e'}];
 const categoryColor=(key,color)=>palette.some(p=>p.color===color)?color:({common:palette[0].color,relationships:palette[2].color,career:palette[1].color,risks:palette[4].color,variants:palette[3].color}[key]||palette[0].color);
 const categories=()=>[
  {key:'common',name:'常用'},
  {key:'relationships',name:'亲缘与婚姻'},
  {key:'career',name:'事业与财物'},
  {key:'risks',name:'风险与纷争'},
  {key:'variants',name:'差异版本'}
 ];
 const categoryFor=key=>{
  if(key.startsWith('reference_relationship_'))return 'relationships';
  if(key.startsWith('reference_career_'))return 'career';
  if(key.startsWith('reference_risk_'))return 'risks';
  if(key.startsWith('reference_variant_'))return 'variants';
  if(['fortune','spirit'].includes(key)||key.startsWith('hermes_'))return 'common';
  if(key==='valens_marriage'||key.startsWith('dorotheus_'))return 'relationships';
  if(['firmicus_military','firmicus_travel','firmicus_fame','firmicus_possessions'].includes(key))return 'career';
  if(['valens_theft','valens_deceit','firmicus_accusation'].includes(key))return 'risks';
  if(['firmicus_eros','firmicus_necessity'].includes(key))return 'variants';
  return 'common';
 };
 // Transcribed from the numbered tables in the user-provided On Lots (2/2) image.
 // The article does not identify a book/chapter for each row; preserve row numbers in the source reference.
 const referenceLots=[
  // The appendix says to reverse day formulas at night unless a row says otherwise.
  ['relationship_marriage_man','男婚姻点',15,'asc','venus','saturn'],
  ['relationship_marriage_woman','女婚姻点',16,'asc','saturn','venus'],
  ['relationship_sons','儿子点',24,'asc','jupiter','moon'],
  ['relationship_daughters','女儿点',25,'asc','venus','moon'],
  ['relationship_friends','朋友点',26,'asc','mercury','moon'],
  ['relationship_female_lover','女恋人点',60,'asc','jupiter','venus'],
  ['relationship_homeland','故乡点',38,'asc','mars','sun'],
  ['career_activity','活动点',9,'asc','mars','mercury'],
  ['career_expedition','军远征点',12,'asc','moon','saturn'],
  ['career_reward','回报点',19,'asc','jupiter','saturn'],
  ['career_inheritance','继承点',21,'asc','mercury','jupiter'],
  ['career_craft','手艺点',22,'asc','moon','mercury'],
  ['career_wealth','财富点',32,'asc','sun','saturn'],
  ['career_master','主人点',52,'asc','sun','venus',false],
  ['career_freedom','自由点',58,'asc','sun','mercury'],
  ['risk_death','死亡点',28,'asc','moon','saturn',false],
  ['risk_injury','伤痛点',31,'mercury','saturn','mars'],
  ['risk_dreams','梦境点',34,'asc','mercury','saturn'],
  ['risk_punishment','处罚点',35,'asc','saturn','mercury'],
  ['risk_illness','疾病点',53,'asc','mercury','saturn'],
  ['risk_fugitive','逃亡点',54,'asc','mars','mercury'],
  ['variant_military','兵役点V1',55,'asc','mars','mercury']
 ].map(([key,name,row,start,add,subtract,reverse=true])=>lot('reference_'+key,name,'待查验',start,add,subtract,reverse));
 const mainReferenceLots=[
  // The main table explicitly introduces these as day formulas reversed at night.
  ['relationship_association','团契点',142,'asc','venus','jupiter'],
  ['career_contract','契约点',138,'asc','jupiter','mercury'],
  ['career_strength','力量点',151,'asc','mc','sun'],
  ['career_farming','农耕点',137,'asc','venus','saturn'],
  ['risk_grief','悲伤点',132,'asc','mars','saturn'],
  ['variant_love','爱欲点V1',129,'asc','mars','saturn']
 ].map(([key,name,row,start,add,subtract])=>lot('reference_'+key,name,'待查验',start,add,subtract));
 const defaults=()=>[
  {...lot('fortune','福点','保罗《占星入门介绍》第23章','asc','moon','sun'),visible:true},
  {...lot('spirit','精神点','保罗《占星入门介绍》第23章','asc','sun','moon'),visible:true},
  lot('hermes_eros','爱欲点','保罗《占星入门介绍》第23章','asc','venus','spirit'),
  lot('hermes_necessity','必然点','保罗《占星入门介绍》第23章','asc','fortune','mercury'),
  lot('hermes_courage','勇气点','保罗《占星入门介绍》第23章','asc','fortune','mars'),
  lot('hermes_victory','胜利点','保罗《占星入门介绍》第23章','asc','jupiter','spirit'),
  lot('hermes_nemesis','报应点','保罗《占星入门介绍》第23章','asc','fortune','saturn'),
  lot('valens_marriage','婚姻点·瓦','瓦伦斯《选集》卷二第37章','asc','venus','jupiter'),
  lot('valens_theft','盗窃点','瓦伦斯《选集》卷二第24章','saturn','mars','mercury'),
  lot('valens_deceit','欺诈点','瓦伦斯《选集》卷二第25章','asc','mars','sun'),
  lot('firmicus_eros','爱欲点·菲','菲米克斯《数学八卷》卷六第32章','asc','fortune','spirit'),
  lot('firmicus_necessity','必然点·菲','菲米克斯《数学八卷》卷六第32章','asc','spirit','fortune'),
  lot('firmicus_military','军旅点','菲米克斯《数学八卷》卷六第32章','asc','sun','mars',false),
  lot('firmicus_travel','旅途点','菲米克斯《数学八卷》卷六第32章','asc','mars','sun',false),
  lot('firmicus_fame','声望点','菲米克斯《数学八卷》卷六第32章','asc','mc','sun',false),
  lot('firmicus_possessions','财产点','菲米克斯《数学八卷》卷六第32章','asc','jupiter','mercury',false),
  lot('firmicus_accusation','控诉点','菲米克斯《数学八卷》卷六第32章','asc','saturn','mars',false),
  lot('dorotheus_father','父亲点','多罗修斯《占星诗集》卷一第13章','asc','saturn','sun'),
  lot('dorotheus_mother','母亲点','多罗修斯《占星诗集》卷一第14章','asc','moon','venus'),
  lot('dorotheus_siblings','手足点','多罗修斯《占星诗集》卷一第19章','asc','jupiter','saturn'),
  lot('dorotheus_sibling_count','手足数点','多罗修斯《占星诗集》卷一第21章','asc','jupiter','mercury'),
  ...referenceLots,
  ...mainReferenceLots
 ].map(d=>({...d,category:categoryFor(d.key)}));
 function houseAt(n,houses){const h=houses.find((h,i)=>norm(n-h.cusp_longitude)<norm(houses[(i+1)%12].cusp_longitude-h.cusp_longitude));if(!h)throw Error('无法确定签点宫位');return h.number;}
 function calculate(definitions,payload){
  const f=payload.facts,houses=f.houses,base=[...f.planets,...f.angles,...(payload.outer_planets||[])],cache=new Map(),visiting=new Set();
  const lookup=key=>base.find(p=>p.key===key)||resolve(key);
  const houseRuler=n=>{const h=houses.find(h=>h.number===Number(n));if(!h)throw Error('请选择有效宫位');return base.find(p=>p.key===rulers[Math.floor(norm(h.cusp_longitude)/30)]);};
  function operand(o){
   if(!o)throw Error('请填写完整公式');
   if(o.type==='point')return lookup(o.value).longitude;
   if(o.type==='cusp'){const h=houses.find(h=>h.number===Number(o.value));if(!h)throw Error('请选择有效宫位');return h.cusp_longitude;}
   if(o.type==='house_ruler')return houseRuler(o.value).longitude;
   if(o.type==='point_house_ruler')return houseRuler(houseAt(lookup(o.value).longitude,houses)).longitude;
   if(o.type==='degree'){const sign=Number(o.sign),degree=Number(o.degree);if(!Number.isInteger(sign)||sign<0||sign>11||!Number.isFinite(degree)||degree<0||degree>=30||o.degree==='')throw Error('星座度数须在 0 至 30 度之间（不含30）');return sign*30+degree;}
   throw Error('请选择公式类型');
  }
  function describe(o){if(o.type==='point')return o.value.toUpperCase();if(o.type==='cusp')return 'CUSP '+o.value;if(o.type==='house_ruler')return 'RULER(H'+o.value+')';if(o.type==='point_house_ruler')return 'HOUSE RULER('+o.value.toUpperCase()+')';return signNames[o.sign]+' '+o.degree+'°';}
  function resolve(key){
   if(cache.has(key))return cache.get(key);
   if(visiting.has(key))throw Error('签点公式存在循环引用');
   const d=definitions.find(d=>d.key===key);if(!d)throw Error('公式引用的点位不存在');
   if(!d.name.trim())throw Error('请填写签点名称');
   visiting.add(key);
   const swapped=d.reverse&&f.solar_condition.sect==='night',add=swapped?d.subtract:d.add,sub=swapped?d.add:d.subtract;
   const longitude=norm(operand(d.start)+operand(add)-operand(sub)),sign_index=Math.floor(longitude/30),degree_in_sign=longitude%30;
   const bound=payload.bound_table[signs[sign_index]].find(([,a,b])=>degree_in_sign>=a&&degree_in_sign<b);
   const p={customLot:true,reverse:!!d.reverse,sect_used:f.solar_condition.sect,key:d.key,label:d.name,note:d.note,longitude,sign_index,sign:signs[sign_index],degree_in_sign,primary_house:houseAt(longitude,houses),domicile_ruler:rulers[sign_index],bound_ruler:bound[0],formula:describe(d.start)+' + '+describe(add)+' - '+describe(sub)};
   visiting.delete(key);cache.set(key,p);return p;
  }
  return definitions.map(d=>resolve(d.key));
 }
 return {defaults,categories,categoryFor,calculate,houseAt,names,signNames,palette,categoryColor};
});
