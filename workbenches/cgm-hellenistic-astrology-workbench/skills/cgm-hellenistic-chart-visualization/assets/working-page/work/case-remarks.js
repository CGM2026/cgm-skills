/* Case background editor. Sharing is restricted to views of the same case. */
(() => {
 'use strict';
 globalThis.CGMCaseRemarks={create(config,initial){
  let base=initial||{text:'',version:0},text=base.text,dirty=false,busy=false,timer,root=null,conflict=null,message='';
  const portable=!!(config.portable||globalThis.CGMPortable),clientKey='cgm-remarks-client';
  let client=sessionStorage.getItem(clientKey);if(!client){client=crypto.randomUUID();sessionStorage.setItem(clientKey,client);}
  const draftKey='cgm-case-remarks:'+base.library+':'+base.caseId+':'+client;
  try{const draft=JSON.parse(localStorage.getItem(draftKey)||'null');if(!portable&&draft&&typeof draft.text==='string'&&typeof draft.version==='number'){text=draft.text;dirty=text!==base.text;if(dirty&&draft.version!==base.version)conflict=base;else if(dirty)base={...base,version:draft.version};}}catch{}
  const backup=()=>{try{if(!portable)localStorage.setItem(draftKey,JSON.stringify({text,version:base.version}));return true;}catch{message='浏览器草稿无法保存，请复制正文留存。';return false;}};
  const fit=()=>{const area=root?.querySelector('textarea');if(!area)return;area.style.height='auto';area.style.height=Math.max(220,area.scrollHeight+2)+'px';};
  function paint(){if(!root?.isConnected)return;const area=root.querySelector('textarea');if(area.value!==text)area.value=text;root.querySelector('[role="status"]').textContent=portable?'阅读副本：备注仅供查看。':conflict?'案例备注有另一份更新，请核对后选择。':message;root.querySelector('.case-remarks-conflict').hidden=!conflict;root.querySelector('.case-remarks-remote').textContent=conflict?.text||'（库中备注为空）';root.querySelector('[data-remarks="retry"]').hidden=!!conflict||!message.includes('未保存');requestAnimationFrame(fit);}
  async function request(body){const response=await fetch('/api/case-remarks'+(body?'':'?view='+encodeURIComponent(config.view)),body?{method:'POST',headers:{'Content-Type':'application/json',[config.header]:config.token},body:JSON.stringify({view:config.view,...body})}:undefined);const value=await response.json();if(!response.ok&&!value.conflict)throw Error(value.error||'无法连接案例库');return value;}
  async function save(){clearTimeout(timer);if(portable||busy||!dirty||conflict)return;busy=true;message='保存中';paint();const sent=text;
   try{const result=await request({text:sent,version:base.version});if(result.conflict){conflict=result.current;backup();}else{base=result;dirty=text!==sent;message='';if(!dirty)localStorage.removeItem(draftKey);else backup();}}
   catch(error){message='未保存，草稿已保留。'+error.message;backup();}
   finally{busy=false;paint();if(dirty&&!conflict&&!message)timer=setTimeout(save,500);}
  }
  async function refresh(){if(portable)return;try{const latest=await request();if(latest.version<base.version)return;if(!dirty){base=latest;text=latest.text;message='';}else if(latest.text===text){base=latest;dirty=false;conflict=null;localStorage.removeItem(draftKey);message='';}else if(latest.version!==base.version){conflict=latest;backup();}paint();if(dirty&&!conflict)timer=setTimeout(save,500);}catch(error){message='未保存，草稿已保留。'+error.message;paint();}}
  function mount(element){root=element;root.innerHTML='<p class="case-remarks-hint">记录案例来源、资料可靠性、人物或事件背景，以及需要保留的其他说明。</p><textarea aria-label="案例备注" placeholder="例如：案例来自哪里，出生时间是否准确，当时提出了什么问题……" '+(portable?'readonly':'')+'></textarea><p class="case-remarks-status" role="status"></p><button type="button" data-remarks="retry" hidden>重试保存</button><section class="case-remarks-conflict" hidden><p>库中最新备注</p><pre class="case-remarks-remote"></pre><button type="button" data-remarks="local">保留我的备注</button><button type="button" data-remarks="remote">采用库中备注</button></section>';
   root.querySelector('textarea').addEventListener('input',event=>{if(portable)return;text=event.target.value;dirty=text!==base.text;message=dirty?'保存中':'';if(dirty)backup();else localStorage.removeItem(draftKey);clearTimeout(timer);if(!conflict)timer=setTimeout(save,500);paint();});
   root.addEventListener('click',event=>{const action=event.target.closest('[data-remarks]')?.dataset.remarks;if(action==='retry'){message='';save();}if(action==='local'&&conflict){base=conflict;conflict=null;dirty=text!==base.text;backup();save();paint();}if(action==='remote'&&conflict){base=conflict;text=base.text;dirty=false;conflict=null;message='';localStorage.removeItem(draftKey);paint();}});paint();refresh();
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
  window.addEventListener('beforeunload',event=>{if(dirty&&!portable){backup();event.preventDefault();event.returnValue='';}});
  async function prepareBackup(){for(let i=0;i<25;i++){await save();if(!dirty&&!busy&&!conflict)return true;if(conflict||message.startsWith('未保存'))return false;await new Promise(resolve=>setTimeout(resolve,200));}return false;}
  return {mount,flush:save,prepareBackup};
 }};
})();
