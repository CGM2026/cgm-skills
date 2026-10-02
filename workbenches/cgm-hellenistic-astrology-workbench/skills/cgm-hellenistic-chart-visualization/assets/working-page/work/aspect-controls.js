document.addEventListener('toggle',event=>{const el=event.target;if(el.matches?.('details[data-aspect-key]'))ChartView.setAspectExpanded(el.dataset.aspectKey,el.open);},true);
document.addEventListener('click',event=>{
 const button=event.target.closest?.('button.aspect-mode');if(!button)return;
 event.preventDefault();event.stopPropagation();
 const modes=['whole','light','modern'],key=button.dataset.modeKey;
 ChartView.setAspectExpanded(key,button.closest('details').open);
 const next=modes[(modes.indexOf(button.dataset.mode)+1)%modes.length];
 ChartView.setAspectMode(key,next);
 globalThis.ChartAspectState?.setMode(next);
 if(selected!==null)selectPoint(selected);else globalThis.refreshDockedCards?.();
});
