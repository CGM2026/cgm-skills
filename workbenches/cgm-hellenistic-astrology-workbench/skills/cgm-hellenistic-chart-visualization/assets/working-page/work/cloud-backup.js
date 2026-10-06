/* Optional private backup UI. Existing theme and fonts remain authoritative. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=value=>value?new Date(value*1000).toLocaleString('zh-CN',{hour12:false}):'尚无记录';
 const size=value=>value>=1048576?(value/1048576).toFixed(1)+' MB':Math.round((value||0)/1024)+' KB';
 const styles=`
 .cgm-backup{--cb-line:var(--line,var(--rule,#d8cbb9));--cb-muted:var(--muted,var(--text-secondary,#928879));--cb-ink:var(--ink,var(--text-main,#484135));font:inherit;color:var(--cb-ink);min-width:0}
 .cgm-backup[hidden],.cgm-backup [hidden]{display:none!important}
 .cgm-backup p{margin:10px 0;line-height:1.8}.cgm-backup .cb-muted{color:var(--cb-muted);font-size:12px}
 .cgm-backup h3{font:inherit;font-size:17px;margin:20px 0 10px}.cgm-backup h4{font:inherit;font-size:14px;margin:15px 0 8px}
 .cgm-backup label{display:block;margin:12px 0}.cgm-backup input:not([type=checkbox]):not([type=radio]),.cgm-backup select,.cgm-backup textarea{box-sizing:border-box;width:100%;font:inherit;color:inherit;background:transparent;border:0;border-bottom:1px solid var(--cb-line);border-radius:0;padding:7px 0;min-width:0}
 .cgm-backup input[type=checkbox],.cgm-backup input[type=radio]{accent-color:var(--cb-muted);margin:0 7px 0 0}.cgm-backup .cb-check{display:flex;gap:2px;align-items:center}
 .cgm-backup .cb-options{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}.cgm-backup .cb-stats{border-top:1px solid var(--cb-line);border-bottom:1px solid var(--cb-line);padding:12px 0;display:grid;grid-template-columns:auto 1fr;gap:7px 20px;margin:15px 0}.cgm-backup .cb-stats dt{color:var(--cb-muted)}.cgm-backup .cb-stats dd{margin:0}
 .cgm-backup .cb-actions{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;margin:16px 0}.cgm-backup button{font:inherit;color:inherit;border:0;background:transparent;padding:5px 0;border-bottom:1px solid var(--cb-line);cursor:pointer}.cgm-backup button:disabled{opacity:.4;cursor:default}.cgm-backup a{color:inherit;text-underline-offset:3px}
 .cgm-backup .cb-message{min-height:1.8em;color:var(--cb-muted);overflow-wrap:anywhere}.cgm-backup .cb-error{color:var(--fire,#a87465)}.cgm-backup details{border-top:1px solid var(--cb-line);padding-top:12px;margin-top:12px}.cgm-backup summary{color:var(--cb-muted);cursor:pointer}
 .cgm-backup .cb-fold>summary{display:flex;align-items:baseline;justify-content:space-between;gap:18px;list-style:none;color:var(--cb-ink);font-size:14px}.cgm-backup .cb-fold>summary::-webkit-details-marker{display:none}.cgm-backup .cb-fold-control{display:inline-grid;grid-template-columns:2em 1em;gap:8px;flex:none;font-size:12px;color:var(--cb-muted);text-align:left}.cgm-backup .cb-fold-sign{text-align:center}.cgm-backup .cb-guide-copy{margin:2px 0}.cgm-backup .cb-guide-text{min-height:180px;resize:vertical;line-height:1.7}.cgm-backup .cb-guide-status{display:block;margin-top:6px;color:var(--cb-muted);font-size:12px}
 .cgm-backup .cb-recovery{font:12px/1.7 ui-monospace,Consolas,monospace;min-height:70px;resize:none;overflow-wrap:anywhere}.cgm-backup .cb-snapshots{max-height:230px;overflow:auto;border-top:1px solid var(--cb-line);border-bottom:1px solid var(--cb-line);scrollbar-width:thin;scrollbar-color:var(--cb-line) transparent}.cgm-backup .cb-snapshot{display:flex;gap:8px;margin:0;padding:12px 0;border-bottom:1px solid var(--cb-line)}.cgm-backup .cb-snapshot:last-child{border:0}.cgm-backup .cb-snapshot input{margin-top:6px}.cgm-backup .cb-snapshot small{display:block;color:var(--cb-muted);font:inherit;font-size:11px;overflow-wrap:anywhere}
 .cgm-backup .cb-path{font-size:12px;overflow-wrap:anywhere}.cgm-backup :focus-visible{outline:1px solid var(--cb-muted);outline-offset:3px}.cgm-backup .cb-danger{color:var(--fire,#a87465)}
 .settings-tabs{flex-wrap:wrap;gap:12px 20px}.research-dialog [role=tabpanel][hidden]{display:none!important}.cgm-settings-tabs{display:flex;gap:24px;border-bottom:1px solid var(--line);margin-bottom:18px;padding-bottom:8px;font:12px/1.5 var(--sans,inherit);color:var(--muted)}.cgm-settings-tabs button[aria-selected=true]{color:var(--ink)}
 @media(max-width:430px){.cgm-backup .cb-options{grid-template-columns:1fr}.cgm-backup .cb-stats{gap:7px 12px}}
 `;
 function mount(host,{token='',header='X-Bazi-Token',portable=false,beforeBackup=null}={}){
  host.classList.add('cgm-backup');
  if(!document.getElementById('cgm-cloud-styles')){const style=document.createElement('style');style.id='cgm-cloud-styles';style.textContent=styles;document.head.append(style);}
  const title=header==='X-Case-Token'?'长庚明希腊占星工作台':'长庚明八字工作台';
  const guidePrompt=`请手把手指导我为「${title}」设置 GitHub 私有云端备份。先读取已安装 Skill 中的 references/cloud-backup.md，并核对当前是否为电脑端完整工作页、是否已有备份连接。每次只讲当前一步，使用页面上的中文名称，等我完成后再继续。依次指导：创建 Private 仓库并添加 README；创建仅授权此仓库、Contents 为 Read and write 的 fine-grained 授权码；在“云端备份”展开“连接私有仓库”并填写；展开“设置备份密码”和“选择备份频率”；连接后单独保存并确认恢复密钥；立即备份并检查成功状态。授权码、密码和恢复密钥由我在工作页或 GitHub 页面自行输入，不要让我发到聊天中。说明电脑开机登录后才能自动备份，以及忘记密码、换电脑时如何恢复。若我使用的是手机阅读副本，请指导我转到电脑端完整工作台；如果已有连接，优先指导检查和立即备份，不重复初始化。未经我选择，不更换案例库或执行恢复接入。`;
  const intro=()=>'<p>将案例资料加密后备份到自己的 GitHub 私有仓库。八字与占星分别保存。</p><button type="button" class="cb-guide-copy" data-action="copy-guide">复制指导提示词</button><span class="cb-guide-status" role="status">复制后发给 AI，它会按步骤指导你完成设置。</span><textarea class="cb-guide-text" readonly hidden aria-label="云端备份指导提示词"></textarea>';
  host.addEventListener('click',async event=>{
   if(event.target.closest('[data-action]')?.dataset.action!=='copy-guide')return;
   const hint=host.querySelector('.cb-guide-status');
   try{await navigator.clipboard.writeText(guidePrompt);if(hint?.isConnected)hint.textContent='已复制。请粘贴给 AI，按它的指导逐步设置。';}
   catch{const field=host.querySelector('.cb-guide-text');if(field){field.value=guidePrompt;field.hidden=false;field.focus();field.select();}if(hint?.isConnected)hint.textContent='请复制下方已选中的提示词，再发给 AI。';}
  });
  if(portable){host.innerHTML=intro()+'<p class="cb-muted">请在电脑端完整工作台中连接私有仓库。阅读副本保留当前案例的展示内容。</p>';return;}
  let current={},view='home',busy=false,polling=false,recovery=null,rotation=false,snapshots=[],restoreResult=null;
  const api=async body=>{const reply=await fetch('/api/cloud-backup',{method:body?'POST':'GET',headers:{'Content-Type':'application/json',[header]:token},...(body?{body:JSON.stringify(body)}:{})});const data=await reply.json();if(!reply.ok)throw Error(data.error||'备份操作未完成');return data;};
  const message=(text,error=false)=>{const p=host.querySelector('.cb-message');if(p){p.textContent=text||'';p.classList.toggle('cb-error',error);}};
  const buttonsBusy=active=>host.querySelectorAll('button').forEach(button=>{if(active){button.dataset.cbOriginalDisabled=String(button.disabled);button.disabled=true;}else if(button.dataset.cbOriginalDisabled!==undefined){button.disabled=button.dataset.cbOriginalDisabled==='true';delete button.dataset.cbOriginalDisabled;}});
  const options=()=>`<div class="cb-options"><label>每隔几天备份<input name="intervalDays" type="number" min="1" max="365" value="${current.intervalDays||3}" required></label><label>备份时间<input name="time" type="time" value="${current.time||'09:00'}" required></label><label>保留最近几份<input name="keep" type="number" min="2" max="60" value="${current.keep||12}" required></label></div><label class="cb-check"><input type="checkbox" name="automatic" ${current.automatic!==false?'checked':''}>开启自动备份</label>`;
  const optionData=form=>({intervalDays:Number(form.elements.intervalDays.value),keep:Number(form.elements.keep.value),time:form.elements.time.value,automatic:form.elements.automatic.checked});
  const repositoryFields=(required=false)=>`<label>私有仓库<input name="repository" value="${esc(current.repository||'')}" placeholder="GitHub账号/仓库名称" required autocomplete="off" spellcheck="false"></label><label>GitHub授权码<input name="token" type="password" ${required?'required':''} placeholder="${required?'只授权这个备份仓库':'已连接时可留空'}" autocomplete="off"></label><p class="cb-muted"><a href="https://github.com/new" target="_blank" rel="noopener noreferrer">创建仓库</a>时选择 Private 并添加 README；<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">创建授权码</a>时只选择这个仓库，Contents 设为 Read and write。</p>`;
  const passwords=()=>'<label>备份密码<input name="password" type="password" minlength="10" maxlength="1024" required autocomplete="new-password" placeholder="至少10个字符"></label><label>再输入一次<input name="passwordConfirm" type="password" minlength="10" maxlength="1024" required autocomplete="new-password"></label>';
  const fold=(key,title,content)=>'<details class="cb-fold" data-fold="'+key+'"><summary><span>'+title+'</span><span class="cb-fold-control"><span data-fold-label>展开</span><span class="cb-fold-sign" data-fold-sign>＋</span></span></summary>'+content+'</details>';
  function render(){
   const top=intro();
   if(view==='recovery'){
    host.innerHTML=top+'<h3>保存恢复密钥</h3><p class="cb-muted">忘记密码或换电脑时，可以用它找回备份。请另存到密码管理器或纸上。密码、恢复密钥和本机密钥都遗失时，旧备份无法解锁。</p><textarea class="cb-recovery" readonly aria-label="恢复密钥">'+esc(recovery)+'</textarea><div class="cb-actions"><button type="button" data-action="download-key">下载恢复密钥</button><button type="button" data-action="copy-key">复制密钥</button></div><form data-form="confirm"><label>粘贴已保存的恢复密钥<input name="recoveryCode" required autocomplete="off" spellcheck="false"></label><div class="cb-actions"><button type="submit">'+(rotation?'确认新恢复密钥':'完成启用')+'</button></div></form><p class="cb-message" role="status"></p>';return;
   }
   if(view==='restore'){
    host.innerHTML=top+'<div class="cb-actions"><button type="button" data-action="home">返回备份</button></div><form data-form="list">'+repositoryFields(!current.configured)+'<button type="submit">读取云端备份</button></form>'+(snapshots.length?'<form data-form="restore"><h3>选择一份备份</h3><div class="cb-snapshots">'+snapshots.map((item,i)=>'<label class="cb-snapshot"><input type="radio" name="snapshotId" value="'+item.id+'" '+(!i?'checked':'')+'><span>'+esc(item.created?new Date(item.created).toLocaleString('zh-CN',{hour12:false}):item.name.match(/\d{8}T\d{6}Z/)[0])+' · '+size(item.bytes)+'<small>'+esc(item.name)+'</small></span></label>').join('')+'</div><label>解锁方式<select name="unlockMethod"><option value="password">备份密码</option><option value="recovery">恢复密钥</option>'+(current.configured?'<option value="thisComputer">此电脑保存的密钥</option>':'')+'</select></label><label data-unlock="password">备份密码<input name="password" type="password" autocomplete="off"></label><label data-unlock="recovery" hidden>恢复密钥<input name="recoveryCode" autocomplete="off" spellcheck="false"></label><p class="cb-muted">先恢复到独立目录，校验通过后再选择是否接入。</p><button type="submit">恢复并校验</button></form>':'<p class="cb-muted">读取后会列出此工作台的备份。可以在新电脑上使用密码或恢复密钥打开。</p>')+'<p class="cb-message" role="status"></p>';
    if(restoreResult){host.insertAdjacentHTML('beforeend','<h3>恢复已完成</h3><p>共 '+restoreResult.counts.cases+' 个案例、'+restoreResult.counts.views+' 个工作页。</p><p class="cb-path">'+esc(restoreResult.directory)+'</p><label class="cb-check"><input type="checkbox" data-restore-settings checked>同时采用备份中的默认设置</label><button type="button" data-action="adopt">接入这份恢复库</button>');}
    return;
   }
   if(!current.configured){
    host.innerHTML=top+(current.cryptoReady?'':'<p class="cb-muted">首次启用需要安装可选的加密组件。</p><button type="button" data-action="install-dependencies">安装备份组件</button>')+(current.setupPending?'<p class="cb-muted">有一项设置等待确认恢复密钥。</p><button type="button" data-action="resume-setup">继续完成启用</button>':'')+'<form data-form="prepare">'+fold('connection','1 · 连接私有仓库',repositoryFields(true))+fold('password','2 · 设置备份密码',passwords())+fold('frequency','3 · 选择备份频率',options())+fold('contents','备份包含哪些内容','<p class="cb-muted">备份包含当前套件的案例、备注、图层、分析、反馈和默认设置。共用字体单独保存一次；程序和临时 HTML 使用安装包中的版本。</p>')+'<button type="submit" '+(!current.cryptoReady?'disabled':'')+'>连接并生成恢复密钥</button></form><div class="cb-actions"><button type="button" data-action="restore-view">恢复已有云端备份</button></div><p class="cb-message" role="status"></p>';return;
   }
   const state=current.paused?'已暂停':current.automatic?'自动备份已开启':'手动备份';
   host.innerHTML=top+'<dl class="cb-stats"><dt>状态</dt><dd>'+state+'</dd><dt>私有仓库</dt><dd>'+esc(current.repository)+'</dd><dt>最近成功</dt><dd>'+date(current.lastSuccess)+'</dd><dt>下一次</dt><dd>'+(current.automatic&&!current.paused?date(Math.max(current.nextDue||0,current.nextRetry||0)):'手动点击立即备份')+'</dd></dl><div class="cb-actions"><button type="button" data-action="backup">立即备份</button><button type="button" data-action="restore-view">恢复备份</button>'+(current.automatic?'<button type="button" data-action="pause">'+(current.paused?'继续自动备份':'暂停自动备份')+'</button>':'')+'</div>'+(current.pendingUpload?'<p class="cb-muted">有一份加密备份待上传；联网后会接着完成。</p>':'')+(current.lastOutcome==='unchanged'?'<p class="cb-muted">最近检查：数据没有变化，沿用上一次备份。</p>':'')+(current.lastError?'<p class="cb-error">'+esc(current.lastError)+'</p>':'')+(current.scheduleError?'<p class="cb-error">'+esc(current.scheduleError)+'</p>':'')+fold('frequency','备份频率与保留数量','<form data-form="update">'+options()+'<button type="submit">保存频率与保留数量</button></form>')+fold('connection','重新连接或更换仓库','<form data-form="reconnect">'+repositoryFields()+'<button type="submit">更新连接</button></form>')+fold('password','重设备份密码','<form data-form="change-password">'+passwords()+'<p class="cb-muted">此电脑可以用已保存的密钥重设密码。新密码用于之后的备份；旧备份仍可用原密码、恢复密钥或本机密钥打开。</p><button type="submit">保存新密码</button></form>')+fold('recovery','恢复密钥','<p class="cb-muted">当前密钥校验码：'+esc(current.recoveryFingerprint||'')+'。重新生成的密钥用于之后的备份。</p><button type="button" data-action="rotate-recovery">生成新恢复密钥</button>')+fold('reset','重新设置备份','<p class="cb-muted">用于本机凭据已丢失、需要从头连接的情况。云端备份和本地案例保留；原密码或恢复密钥仍是找回旧备份的依据。</p><button type="button" class="cb-danger" data-action="reset">清除连接设置，重新启用</button>')+'<p class="cb-message" role="status"></p>';
   if(current.job?.status==='running')message('正在'+({backup:'加密备份并上传',restore:'下载、恢复与校验',snapshots:'读取云端备份','install-dependencies':'安装备份组件'}[current.job.action]||'处理')+'…');
  }
  const expanded=new Map();
  function syncFold(details){details.querySelector('[data-fold-label]').textContent=details.open?'折叠':'展开';details.querySelector('[data-fold-sign]').textContent=details.open?'−':'＋';}
  function draw(){render();host.querySelectorAll('[data-fold]').forEach(details=>{details.open=expanded.get(view+':'+details.dataset.fold)||false;syncFold(details);});}
  host.addEventListener('toggle',event=>{const details=event.target;if(!details.matches?.('[data-fold]')||!host.contains(details))return;expanded.set(view+':'+details.dataset.fold,details.open);syncFold(details);},true);
  host.addEventListener('invalid',event=>{let parent=event.target.parentElement;while(parent&&parent!==host){if(parent.matches('details')){parent.open=true;if(parent.matches('[data-fold]'))syncFold(parent);}parent=parent.parentElement;}},true);
  let remoteCredentials={};
  async function refresh(){current=await api();draw();if(current.job?.status==='running'&&!polling)poll(current.job.id);}
  async function poll(id){
   polling=true;
   try{for(let i=0;i<1800;i++){
    if(!host.isConnected)return;
    const state=await api();current=state;const job=state.job;
    if(job?.id===id&&job.status!=='running'){
     if(job.status==='error'){draw();message(job.error,true);return;}
     const result=job.result;
     if(job.action==='snapshots'){snapshots=result.snapshots;view='restore';draw();message(snapshots.length?'请选择需要恢复的版本。':'此仓库尚无这个工作台的备份。');return;}
     if(job.action==='restore'){restoreResult=result;view='restore';draw();message(result.warning||result.message);return;}
     draw();message(result.warning||result.message||'操作完成。');return;
    }
    await new Promise(resolve=>setTimeout(resolve,1200));
   }message('操作仍在后台进行，稍后重新打开此页查看结果。');
   }catch(error){message(error.message,true);}finally{polling=false;busy=false;buttonsBusy(false);}
  }
  async function perform(body){
   if(busy)return;busy=true;buttonsBusy(true);message('正在处理…');
   try{
    if(body.action==='backup'&&beforeBackup)await beforeBackup();
    const result=await api(body);
    if(result.jobId){message('正在'+({backup:'备份并上传',restore:'恢复与校验',snapshots:'读取备份','install-dependencies':'安装组件'}[body.action]||'处理')+'…');poll(result.jobId);return;}
    if(result.recoveryCode){recovery=result.recoveryCode;rotation=body.action==='rotate-recovery';view='recovery';draw();return;}
    if(body.action==='confirm'||body.action==='confirm-recovery'){recovery=null;view='home';}
    if(body.action==='adopt'){message(result.message);return;}
    await refresh();message(result.message||'已保存。');
   }catch(error){message(error.message,true);}finally{if(!polling){busy=false;buttonsBusy(false);}}
  }
  host.addEventListener('click',event=>{
   const action=event.target.closest('[data-action]')?.dataset.action;if(!action||action==='copy-guide')return;
   if(action==='home'){view='home';draw();return;}
   if(action==='restore-view'){view='restore';snapshots=[];restoreResult=null;draw();return;}
   if(action==='download-key'){const title=current.kind==='astrology'?'长庚明希腊占星工作台':'长庚明八字工作台';const blob=new Blob([title+' · 云端备份恢复密钥\n\n'+recovery+'\n\n请单独保存。它可以解锁对应的云端备份。\n'],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=title+'-备份恢复密钥.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
   if(action==='copy-key'){navigator.clipboard.writeText(recovery).then(()=>message('已复制，请保存到其他位置。')).catch(()=>message('请直接选中上方密钥复制。'));return;}
   if(action==='pause'){perform({action,paused:!current.paused});return;}
   if(action==='adopt'){perform({action,restoreId:restoreResult.restoreId,restoreSettings:host.querySelector('[data-restore-settings]').checked});return;}
   if(action==='reset'){perform({action,confirmation:'重新设置备份'});return;}
   perform({action});
  });
  host.addEventListener('change',event=>{if(event.target.name==='unlockMethod')host.querySelectorAll('[data-unlock]').forEach(label=>label.hidden=label.dataset.unlock!==event.target.value);});
  host.addEventListener('submit',event=>{
   const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();if(busy)return;
   const action=form.dataset.form,data=Object.fromEntries(new FormData(form));
   if(action==='prepare'||action==='update')Object.assign(data,optionData(form));
   if(action==='confirm'){perform({action:rotation?'confirm-recovery':'confirm',...data});return;}
   if(action==='list'){remoteCredentials=data;perform({action:'snapshots',...data});return;}
   if(action==='restore'){perform({action,...remoteCredentials,...data,snapshotId:Number(data.snapshotId)});return;}
   perform({action,...data});
  });
  host.innerHTML='<p class="cb-muted">正在读取备份设置…</p><p class="cb-message" role="status"></p>';
  refresh().catch(error=>message(error.message,true));
  return {refresh};
 }
 function baziTab(dialog,config){
  const nav=dialog.querySelector('.algorithm-tabs'),backup=document.createElement('section');
  const algorithmPages=[...dialog.querySelectorAll('[data-algorithm-page]')];
  const shared=[...dialog.children].filter(child=>child.tagName!=='HEADER'&&child!==nav&&!algorithmPages.includes(child));
  const initialHidden=shared.map(child=>child.hidden);
  const id=algorithmPages[0].id+'-backup',tab=document.createElement('button');
  nav.setAttribute('aria-label','设置分类');
  tab.type='button';tab.textContent='云端备份';tab.id=id+'-tab';tab.setAttribute('role','tab');tab.setAttribute('aria-controls',id);
  backup.id=id;backup.setAttribute('role','tabpanel');backup.setAttribute('aria-labelledby',tab.id);
  nav.append(tab);dialog.append(backup);
  const tabs=[...nav.children],panels=[...algorithmPages,backup];
  function show(index){panels.forEach((p,i)=>p.hidden=i!==index);tabs.forEach((t,i)=>{t.setAttribute('aria-selected',String(i===index));t.tabIndex=i===index?0:-1;});shared.forEach((child,i)=>child.hidden=index===2||initialHidden[i]);}
  tabs.forEach((tab,i)=>{tab.onclick=()=>show(i);tab.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;show(next);tabs[next].focus();}};});
  show(0);mount(backup,config);
 }
 globalThis.CGMCloudBackup={mount,baziTab};
})();
