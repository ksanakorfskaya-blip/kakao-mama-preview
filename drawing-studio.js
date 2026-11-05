/* Family Habits: child-friendly painting studio, stored by child and calendar day. */
(function(){
"use strict";
const PALETTE=["#362B31","#C5674E","#E7A94D","#F3CF69","#89A85F","#79B9AE","#78A9D9","#AA92D5","#D987B0","#EE917B","#A17B5C","#FFFFFF"];
const dbName="family-habits-art-v1";
const fallbackKey="family-habits-art-fallback-v1";
const drafts={};
let current=null, canvas=null,ctx=null,dragId=null,dirty=false,saving=false,viewer=null,displayUrls=[];
function idFor(k,d){return k+"|"+d;}
function notify(m){let n=document.getElementById("toast");if(!n)return;n.textContent=m;n.classList.add("show");clearTimeout(window.artToastTimer);window.artToastTimer=setTimeout(()=>n.classList.remove("show"),3000);}
function openDb(){return new Promise((resolve,reject)=>{
 if(!("indexedDB" in window))return reject(new Error("No IndexedDB"));
 let r;try{r=indexedDB.open(dbName,1);}catch(e){return reject(e);}
 r.onupgradeneeded=function(){const db=r.result;if(!db.objectStoreNames.contains("drawings")){const s=db.createObjectStore("drawings",{keyPath:"id"});s.createIndex("childDay","childDay",{unique:false});}};
 r.onerror=()=>reject(r.error||new Error("DB error"));r.onsuccess=()=>resolve(r.result);
});}
async function store(record){try{const db=await openDb();try{await new Promise((resolve,reject)=>{const t=db.transaction("drawings","readwrite");t.objectStore("drawings").put(record);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});return true;}finally{db.close();}}catch(e){
try{const data=JSON.parse(localStorage.getItem(fallbackKey)||"[]");data.push(record);localStorage.setItem(fallbackKey,JSON.stringify(data.slice(-30)));return true;}catch(er){return false;}
}}
async function list(childId,day){const key=idFor(childId,day);let rows=[];try{const db=await openDb();try{rows=await new Promise((resolve,reject)=>{const t=db.transaction("drawings","readonly");const req=t.objectStore("drawings").index("childDay").getAll(key);req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}finally{db.close();}}catch(e){}
try{const fallback=JSON.parse(localStorage.getItem(fallbackKey)||"[]").filter(r=>r.childDay===key);rows=rows.concat(fallback);}catch(e){}
return rows.sort((a,b)=>b.created.localeCompare(a.created));}
function escape(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function stateFor(k,d){const key=idFor(k,d);if(!drafts[key])drafts[key]={tool:"pencil",color:"#C5674E",size:9,strokes:[],undone:[],savedAtLength:0};return drafts[key];}
function view(child,day){const st=stateFor(child.id,day);
return '<section class="paint-intro"><div class="row between"><div><span class="eyebrow">Творческая мастерская</span><h1>Мой рисунок 🎨</h1><p class="medium">Нарисуй свою историю за '+day.split("-").reverse().slice(0,2).join(".")+'</p></div><span class="paint-sun">🌈</span></div></section>'
+'<div class="paint-tools"><div class="paint-toolset" role="group" aria-label="Чем рисовать">'
+[['pencil','✏️','Карандаш'],['brush','🖌️','Краски'],['pen','🖊️','Ручка'],['eraser','🧽','Ластик']].map(t=>'<button class="paint-tool '+(st.tool===t[0]?'active':'')+'" data-paint="tool" data-value="'+t[0]+'"><span>'+t[1]+'</span><small>'+t[2]+'</small></button>').join("")
+'</div><h3 class="paint-subheading">Выбери цвет</h3><div class="paint-swatches" role="group" aria-label="Цвета">'
+PALETTE.map(p=>'<button aria-label="Цвет '+p+'" class="paint-swatch '+(st.color.toLowerCase()===p.toLowerCase()?'active':'')+'" style="--swatch:'+p+'" data-paint="color" data-value="'+p+'">'+(st.color.toLowerCase()===p.toLowerCase()?'✓':'')+'</button>').join("")
+'<label class="paint-custom" title="Любой цвет"><span>＋</span><input id="paint-color-input" type="color" value="'+st.color+'" aria-label="Выбрать свой цвет"></label></div>'
+'<div class="paint-size-row"><span class="strong">Толщина кисти</span><input aria-label="Толщина кисти" id="paint-width" type="range" min="2" max="36" step="1" value="'+st.size+'"><span class="paint-size-num" id="paint-width-label">'+st.size+'</span></div></div>'
+'<div class="paint-canvas-shell"><div class="paint-canvas-head"><span>✦ Лист для творчества</span><span>♡</span></div><canvas id="kid-paint-canvas" width="720" height="720" data-child-id="'+escape(child.id)+'" data-day="'+day+'" aria-label="Поле для рисования пальцем или мышью">Здесь можно рисовать</canvas></div>'
+'<div class="paint-actions"><button class="btn secondary small-btn" data-paint="undo">↶ Отменить</button><button class="btn secondary small-btn" data-paint="redo">↷ Вернуть</button><button class="btn secondary small-btn" data-paint="clear">🗑 Очистить</button></div>'
+'<button class="btn full paint-save" data-paint="save">💗 Сохранить рисунок дня</button>'
+'<p class="notice center">Рисунок останется в дневнике этого ребёнка. После сохранения добавим ⭐ 2 звёздочки — только один раз за день.</p>'
+'<div class="paint-saved"><h2>🖼️ Мои рисунки за сегодня</h2><div class="drawing-gallery" data-child="'+escape(child.id)+'" data-day="'+day+'"><p class="medium">Загружаем рисунки…</p></div></div>';
}
function gallery(childId,day,title){return '<div class="card paint-memory"><div class="row between"><h3>🎨 '+(title||"Рисунки на память")+'</h3><span class="mini-chip">🖼️</span></div><div class="drawing-gallery" data-child="'+escape(childId)+'" data-day="'+day+'"><p class="medium">Загружаем рисунки…</p></div></div>';}
function drawSegment(stroke,p0,p1){const {tool,color,size}=stroke;ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=tool==="eraser"?"#ffffff":color;ctx.fillStyle=ctx.strokeStyle;
ctx.lineWidth=(tool==="brush"?size*1.65:tool==="pencil"?Math.max(1,size*.8):tool==="pen"?Math.max(1,size*.45):size*2.2);
ctx.globalAlpha=tool==="brush"?.55:tool==="pencil"?.8:1;
if(tool==="brush"){ctx.shadowColor=color;ctx.shadowBlur=size*.32;}
if(p0===p1){ctx.beginPath();ctx.arc(p0.x,p0.y,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
else{ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.stroke();}
ctx.restore();}
function redraw(){if(!canvas||!ctx)return;ctx.clearRect(0,0,720,720);ctx.fillStyle="#fff";ctx.fillRect(0,0,720,720);
for(const stroke of current.strokes){const ps=stroke.points;if(ps.length===1){drawSegment(stroke,ps[0],ps[0]);continue;}for(let i=1;i<ps.length;i++)drawSegment(stroke,ps[i-1],ps[i]);}}
function pointerCoord(e){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(720,((e.clientX-r.left)/r.width)*720)),y:Math.max(0,Math.min(720,((e.clientY-r.top)/r.height)*720))};}
function down(e){if(e.pointerType==="mouse"&&e.button!==0)return;e.preventDefault();dragId=e.pointerId;canvas.setPointerCapture?.(e.pointerId);const s={tool:current.tool,color:current.color,size:current.size,points:[pointerCoord(e)]};current.strokes.push(s);current.undone=[];drawSegment(s,s.points[0],s.points[0]);dirty=true;}
function move(e){if(dragId!==e.pointerId)return;e.preventDefault();const stroke=current.strokes[current.strokes.length-1];if(!stroke)return;const pt=pointerCoord(e),prev=stroke.points[stroke.points.length-1];if(Math.abs(prev.x-pt.x)+Math.abs(prev.y-pt.y)<.8)return;stroke.points.push(pt);drawSegment(stroke,prev,pt);}
function up(e){if(dragId!==e.pointerId)return;dragId=null;try{canvas.releasePointerCapture?.(e.pointerId);}catch(err){}}
function mount(params){canvas=null;ctx=null;current=null;dragId=null;if(!params)return;canvas=document.getElementById("kid-paint-canvas");if(!canvas)return;ctx=canvas.getContext("2d");if(!ctx){notify("Этот браузер не поддерживает рисование");return;}current=stateFor(params.childId,params.day);dirty=current.strokes.length!==current.savedAtLength;redraw();canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);canvas.addEventListener("lostpointercapture",()=>{dragId=null;});}
function refreshChoices(){if(!current)return;document.querySelectorAll(".paint-tool").forEach(x=>x.classList.toggle("active",x.dataset.value===current.tool));document.querySelectorAll(".paint-swatch").forEach(x=>x.classList.toggle("active",x.dataset.value.toLowerCase()===current.color.toLowerCase()));const el=document.getElementById("paint-width-label");if(el)el.textContent=current.size;}
async function saveArt(){if(!canvas||!current||saving){return;}if(!current.strokes.length){notify("Сначала нарисуй что-нибудь ✨");return;}if(!dirty){notify("Этот рисунок уже сохранён. Нарисуй что-то новое!");return;}
saving=true;const b=document.querySelector(".paint-save");if(b){b.disabled=true;b.textContent="Сохраняем рисунок…";}
try{
const data=canvas.toDataURL("image/webp",.83);if(!data.startsWith("data:image/"))throw new Error("canvas encoding");
const [childId,day]=[canvas.dataset.childId,canvas.dataset.day];
const key=idFor(childId,day),record={id:key+"|"+Date.now()+"|"+Math.random().toString(36).slice(2,6),childDay:key,childId:childId,day:day,created:new Date().toISOString(),image:data};
const success=await store(record);if(!success){notify("Недостаточно места в браузере. Попробуйте освободить память.");return;}
current.savedAtLength=current.strokes.length;dirty=false;notify("Рисунок сохранён в дневнике! ⭐");if(typeof window.onFamilyDrawingSaved==="function")window.onFamilyDrawingSaved(childId,day);
await fillGalleries();
}catch(e){notify("Не удалось сохранить рисунок");}finally{saving=false;if(b){b.disabled=false;b.textContent="💗 Сохранить рисунок дня";}}
}
async function fillGalleries(){const galleries=[...document.querySelectorAll(".drawing-gallery")];for(const g of galleries){const childId=g.dataset.child,day=g.dataset.day;const rows=await list(childId,day);if(!g.isConnected)continue;
if(!rows.length){g.innerHTML='<p class="medium">Пока нет рисунков за этот день. Каждый лист может стать воспоминанием! 🌷</p>';continue;}
g.innerHTML='<div class="paint-gallery-grid">'+rows.map((r,i)=>'<button class="paint-thumb" data-paint="view" data-child="'+escape(childId)+'" data-date="'+day+'" data-idx="'+i+'" aria-label="Открыть рисунок '+(i+1)+'"><img src="'+r.image+'" alt="Рисунок ребёнка от '+day+'" loading="lazy"><span>'+new Date(r.created).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})+'</span></button>').join("")+'</div>';}}
function openViewer(r){const old=document.getElementById("paint-viewer");if(old)old.remove();const overlay=document.createElement("div");overlay.id="paint-viewer";overlay.className="paint-viewer";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","Рисунок за "+r.day);overlay.innerHTML='<div class="paint-viewer-inner"><button class="paint-viewer-close" data-paint="closeview" aria-label="Закрыть">✕</button><h2>🌷 Рисунок на память</h2><p class="medium">'+r.day+'</p><img src="'+r.image+'" alt="Сохранённый рисунок"><a class="btn full" download="moi-risunok-'+r.day+'.webp" href="'+r.image+'">⬇ Сохранить на телефон</a></div>';document.body.appendChild(overlay);}
document.addEventListener("click",async e=>{const el=e.target.closest("[data-paint]");if(!el)return;e.preventDefault();const a=el.dataset.paint;
if(a==="closeview"){document.getElementById("paint-viewer")?.remove();return;}
if(a==="view"){const rows=await list(el.dataset.child,el.dataset.date);const selected=rows[Number(el.dataset.idx)];if(selected)openViewer(selected);return;}
if(!current||!canvas)return;
if(a==="tool"){current.tool=el.dataset.value;refreshChoices();}
if(a==="color"){current.color=el.dataset.value;current.tool=current.tool==="eraser"?"pencil":current.tool;refreshChoices();}
if(a==="undo"&&current.strokes.length){current.undone.push(current.strokes.pop());dirty=true;redraw();}
if(a==="redo"&&current.undone.length){current.strokes.push(current.undone.pop());dirty=true;redraw();}
if(a==="clear"&&current.strokes.length&&confirm("Очистить лист? Уже сохранённые рисунки останутся в дневнике.")){current.strokes=[];current.undone=[];dirty=true;redraw();}
if(a==="save")await saveArt();
});
document.addEventListener("input",e=>{if(!current)return;if(e.target.id==="paint-width"){current.size=Number(e.target.value);refreshChoices();}else if(e.target.id==="paint-color-input"){current.color=e.target.value;current.tool=current.tool==="eraser"?"pencil":current.tool;refreshChoices();}});
window.DrawingStudio={view,gallery,mount,fillGalleries,hasUnsaved:()=>!!(canvas&&dirty)};
})();
