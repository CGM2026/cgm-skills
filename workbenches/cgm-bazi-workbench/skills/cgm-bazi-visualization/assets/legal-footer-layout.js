// The workbench can resize its left band independently of the root CSS values.
// Follow the actual right-hand text inset in every layout.
(()=>{
 const footer=document.getElementById('cgm-license-footer');
 const body=document.querySelector('.lower-main');
 const main=document.querySelector('main');
 if(!footer||!body||!main)return;
 const align=()=>{
  const left=body.getBoundingClientRect().left+parseFloat(getComputedStyle(body).paddingLeft)-footer.getBoundingClientRect().left;
  footer.style.setProperty('--cgm-license-left',left+'px');
 };
 align();
 const observer=new ResizeObserver(align);
 observer.observe(main);observer.observe(body);
 window.addEventListener('resize',align);
})();
