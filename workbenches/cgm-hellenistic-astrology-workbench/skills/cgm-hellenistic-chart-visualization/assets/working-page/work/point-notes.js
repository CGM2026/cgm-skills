(() => {
  const storageKey='chart-point-notes:'+location.pathname;
  let notes={};
  try{notes=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
  const limit=value=>Array.from(value).slice(0,100).join('');
  const original=selectPoint;
  selectPoint=function(key){
    original(key);
    const label=document.querySelector('#detail .note-text');
    if(label)label.textContent=limit(String(globalThis.ChartLotNotes?.get(key)??notes[key]??''))||'无备注';
  };
  document.addEventListener('click',event=>{
    const button=event.target.closest('.edit-note');if(!button)return;
    const host=button.parentElement,label=host.querySelector('.note-text');
    if(host.querySelector('input'))return;
    const key=button.closest('[data-card-key]')?.dataset.cardKey||selected,input=document.createElement('input');
    input.className='note-input';input.setAttribute('aria-label','备注，最多100个字');
    input.value=limit(String(globalThis.ChartLotNotes?.get(key)??notes[key]??''));input.placeholder='无备注';
    label.hidden=true;button.hidden=true;host.append(input);
    let done=false;
    function finish(save){
      if(done)return;done=true;
      if(save){notes[key]=limit(input.value.trim());document.dispatchEvent(new CustomEvent('point-note-change',{detail:{key,note:notes[key]}}));try{localStorage.setItem(storageKey,JSON.stringify(notes));}catch{}}
      label.textContent=(globalThis.ChartLotNotes?.get(key)??notes[key])||'无备注';input.remove();label.hidden=false;button.hidden=false;
    }
    input.addEventListener('input',event=>{if(!event.isComposing)input.value=limit(input.value);});
    input.addEventListener('compositionend',()=>{input.value=limit(input.value);});
    input.addEventListener('keydown',event=>{
      if(event.isComposing)return;
      if(event.key==='Enter'||event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(event.key==='Enter');}
    });
    if(globalThis.ChartLibrary)input.addEventListener('input',()=>{notes[key]=limit(input.value);localStorage.setItem(storageKey,JSON.stringify(notes));});
    input.addEventListener('blur',()=>finish(true));input.focus();
  });
})();
