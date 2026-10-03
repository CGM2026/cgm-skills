'use strict';
// Keep original glyph IDs and metrics; remove unused outlines, preserving composite dependencies.
// No external font conversion dependency. Original font names/copyright tables remain intact.
function subsetTTF(input,text){
 const tables=new Map();for(let i=0;i<input.readUInt16BE(4);i++){const p=12+i*16,t=input.toString('ascii',p,p+4),o=input.readUInt32BE(p+8),n=input.readUInt32BE(p+12);tables.set(t,Buffer.from(input.subarray(o,o+n)));}
 for(const t of ['head','maxp','loca','glyf','cmap'])if(!tables.has(t))throw Error('Export needs TrueType outlines: '+t);
 const count=tables.get('maxp').readUInt16BE(4),long=tables.get('head').readInt16BE(50)===1,loca=tables.get('loca'),glyf=tables.get('glyf'),cmap=tables.get('cmap');
 const offsets=Array.from({length:count+1},(_,i)=>long?loca.readUInt32BE(i*4):loca.readUInt16BE(i*2)*2);
 const maps=[];for(let i=0;i<cmap.readUInt16BE(2);i++){const o=cmap.readUInt32BE(4+i*8+4),f=cmap.readUInt16BE(o);if(f===4||f===12)maps.push({o,f});}maps.sort((a,b)=>b.f-a.f);
 function glyph(cp){for(const {o,f} of maps){if(f===12){const n=cmap.readUInt32BE(o+12);for(let i=0;i<n;i++){const p=o+16+i*12,a=cmap.readUInt32BE(p),b=cmap.readUInt32BE(p+4);if(cp>=a&&cp<=b)return cmap.readUInt32BE(p+8)+cp-a;}}else if(cp<=65535){const n=cmap.readUInt16BE(o+6)/2;for(let i=0;i<n;i++){const end=cmap.readUInt16BE(o+14+i*2),start=cmap.readUInt16BE(o+16+n*2+i*2);if(cp<start||cp>end)continue;const delta=cmap.readInt16BE(o+16+n*4+i*2),rp=o+16+n*6+i*2,r=cmap.readUInt16BE(rp);let g=r?cmap.readUInt16BE(rp+r+2*(cp-start)):cp;return g?(g+delta)&65535:0;}}}return 0;}
 const characters=new Set(Array.from(text,c=>c.codePointAt(0)));
 const used=new Set([0,...Array.from(characters,glyph)]);
 for(const g of used){if(g>=count)throw Error('Invalid font glyph');const a=offsets[g],b=offsets[g+1];if(b<=a||glyf.readInt16BE(a)>=0)continue;let p=a+10,flags;do{flags=glyf.readUInt16BE(p);used.add(glyf.readUInt16BE(p+2));p+=4+(flags&1?4:2)+(flags&8?2:flags&64?4:flags&128?8:0);}while(flags&32);}
 const newLoca=Buffer.alloc((count+1)*4),chunks=[];let cursor=0;for(let g=0;g<count;g++){newLoca.writeUInt32BE(cursor,g*4);if(used.has(g)){const b=glyf.subarray(offsets[g],offsets[g+1]),pad=Buffer.alloc((4-b.length%4)%4);chunks.push(b,pad);cursor+=b.length+pad.length;}}newLoca.writeUInt32BE(cursor,count*4);
 tables.set('glyf',Buffer.concat(chunks));tables.set('loca',newLoca);tables.get('head').writeInt16BE(1,50);tables.get('head').writeUInt32BE(0,8);tables.delete('DSIG');
 const tags=[...tables.keys()].sort(),n=tags.length,header=Buffer.alloc(12+n*16);input.copy(header,0,0,4);header.writeUInt16BE(n,4);const power=2**Math.floor(Math.log2(n));header.writeUInt16BE(power*16,6);header.writeUInt16BE(Math.log2(power),8);header.writeUInt16BE(n*16-power*16,10);
 const sum=b=>{let s=0;for(let i=0;i<b.length;i+=4)s=(s+b.readUInt32BE(i))>>>0;return s;};const blocks=[header];let position=header.length,headOffset;
 tags.forEach((tag,i)=>{const b=tables.get(tag),padded=Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]),p=12+i*16;header.write(tag,p,4,'ascii');header.writeUInt32BE(sum(padded),p+4);header.writeUInt32BE(position,p+8);header.writeUInt32BE(b.length,p+12);if(tag==='head')headOffset=position;blocks.push(padded);position+=padded.length;});
 const output=Buffer.concat(blocks);output.writeUInt32BE((0xB1B0AFBA-sum(output))>>>0,headOffset+8);return output;
}
module.exports={subsetTTF};
