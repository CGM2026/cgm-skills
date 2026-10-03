(() => {
 const form=document.getElementById('cycle-form');
 if(!form||!globalThis.ChartMethodState)return;
 const section=document.createElement('fieldset');section.className='personal-tradition method-defaults';
 section.innerHTML='<legend>新盘默认</legend><p>推荐：恒星黄道 · 法根—布拉德利 · 埃及界 · 整宫制。首次使用可接受推荐，也可自行选择。</p><p class="current-method-defaults"></p><button type="button" class="save-method-defaults">将当前口径设为新盘默认</button><p class="method-defaults-status" role="status"></p>';
 form.append(section);
 const button=section.querySelector('button'),status=section.querySelector('[role=status]'),summary=section.querySelector('.current-method-defaults');
 const live=!!globalThis.ChartLibrary&&!ChartLibrary.export;
 const describe=methods=>[(methods.zodiac==='sidereal'?'恒星黄道 · '+(methods.ayanamsa==='lahiri'?'拉希里':'法根—布拉德利'):'回归黄道'),methods.bound_system==='egyptian'?'埃及界':'托勒密界',JSON.parse(document.getElementById('chart-variants').textContent).house_options[methods.house_system]?.split('（')[0]||methods.house_system].join(' · ');
 if(live){fetch('/api/method-defaults').then(r=>{if(!r.ok)throw Error('读取失败');return r.json();}).then(data=>summary.textContent=data.settings?'个人默认：'+describe(data.settings):'尚未保存个人默认。先选择排盘口径，再点击下方按钮确认。').catch(()=>summary.textContent='个人默认暂时无法读取，请确认本机服务已启动。');}
 else{summary.textContent='此页是独立副本。可在当前页比较口径；保存新盘默认请返回本地案例库。';button.hidden=true;}
 const sync=()=>button.disabled=!!globalThis.ChartNoteLayers?.current();sync();document.addEventListener('chart-layer-change',sync);
 button.addEventListener('click',async()=>{
  const state=ChartMethodState.get(),methods={zodiac:state.current.zodiac,ayanamsa:state.current.zodiac==='sidereal'?state.ayanamsa:null,bound_system:state.current.bound,house_system:state.current.house};
  button.disabled=true;status.textContent='正在保存…';
  try{const reply=await fetch('/api/method-defaults',{method:'POST',headers:{'Content-Type':'application/json','X-Case-Token':ChartLibrary.token},body:JSON.stringify({methods})});const data=await reply.json();if(!reply.ok)throw Error(data.error||'保存失败');summary.textContent='个人默认：'+describe(data.settings);status.textContent='已设为以后新盘的默认口径。已有案例保留原计算事实。';}
  catch(error){status.textContent='未能保存：'+error.message;}finally{sync();}
 });
 const about=document.createElement('details');about.className='release-about';
 const heading=document.createElement('summary');heading.textContent='关于与来源';about.append(heading);
 const body=document.createElement('div');body.innerHTML='<p>长庚明希腊占星工作台 · AGPL-3.0-only。完整许可、第三方声明、源码入口与使用场景说明见页尾“关于与许可”。</p><p>HTML 与 JSON 包含完整出生资料和笔记；图片匿名选项只影响图片。导出公众号标识可按需保留或关闭，无须另补工具来源。工作页 SVG 为封装 PNG 的 SVG 文件。</p>';
 about.append(body);form.append(about);
 const style=document.createElement('style');style.textContent='.method-defaults button{font:inherit;color:var(--accent-strong,#805e42);background:transparent;border:1px solid var(--rule,#d8d1c5);padding:7px 12px;border-radius:4px;cursor:pointer}.method-defaults button:disabled{opacity:.5;cursor:default}.release-about{margin-top:18px;padding-top:12px;border-top:1px solid var(--rule,#d8d1c5);font-size:14px;line-height:1.8;color:var(--muted-soft,#827c72)}.release-about summary{cursor:pointer}.release-about a{color:inherit}';document.head.append(style);
})();
