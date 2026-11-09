/* Cloud account bridge. Active only when the app is served by the new account backend. */
(function(){
"use strict";
let user=null,ongoing=Promise.resolve(),pending=null,working=false,failed=false,resetting=false;
const guestKey="family-habits-demo-2026";
function api(url,method,body){
  return fetch(url,{method:method||"GET",credentials:"same-origin",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined,cache:"no-store"})
    .then(async r=>{let payload=await r.json().catch(()=>({}));if(!r.ok)throw Error(payload.error||"Ошибка соединения");return payload;});
}
function alertStatus(message){
  let t=document.getElementById("toast");if(t){t.textContent=message;t.classList.add("show");}
}
function cachedKey(){return "family-habits-cloud-cache-"+user.id;}
async function boot(){
  const who=await api("/api/auth/me");
  if(!who.authenticated){user=null;return {authenticated:false};}
  user=who.user;
  const result=await api("/api/state");
  try{localStorage.setItem(cachedKey(),JSON.stringify(result.state));}catch(e){}
  return {authenticated:true,state:result.state,user};
}
function active(){return !!user;}
function account(){return user;}
async function flush(){
  if(working)return ongoing;
  working=true;
  ongoing=(async function(){
    while(pending!==null){
      const copy=pending;pending=null;
      try{await api("/api/state","PUT",{state:copy});failed=false;}
      catch(e){
        if(pending===null)pending=copy;failed=true;
        alertStatus("⚠️ Не удалось сохранить в облаке. Проверь интернет и повтори действие.");
        throw e;
      }
    }
  })().finally(()=>{working=false;});
  return ongoing;
}
function saveState(value){
  if(!user||resetting)return Promise.resolve();
  pending=JSON.parse(JSON.stringify(value));
  try{localStorage.setItem(cachedKey(),JSON.stringify(pending));}catch(e){}
  return flush().catch(()=>{});
}
async function waitForSave(){
  if(pending!==null && !working)await flush();
  else await ongoing;
  if(failed)throw Error("Не удалось сохранить семейный профиль");
}
async function addDrawing(record){
  if(!active())throw Error("Нет аккаунта");
  await waitForSave();
  return api("/api/drawings","POST",{id:record.id,childId:record.childId,day:record.day,image:record.image});
}
async function drawings(childId,day){return (await api("/api/drawings?childId="+encodeURIComponent(childId)+"&day="+encodeURIComponent(day))).drawings;}
async function deleteDrawingsPast(before){await api("/api/drawings/past","DELETE",{before});}
async function deleteDrawingsChild(childId){await api("/api/drawings/child","DELETE",{childId});}
// Wait for an already-sent save so it cannot restore data after server deletion.
async function resetFamily(){
  if(!active())throw Error("Нет аккаунта");
  resetting=true;
  try{
    pending=null;
    await ongoing.catch(()=>{});
    pending=null;
    await api("/api/family/reset","DELETE");
    failed=false;
    try{localStorage.removeItem(cachedKey());}catch(e){}
  }finally{resetting=false;}
}
function guestData(){try{let data=JSON.parse(localStorage.getItem(guestKey));return data?.children?.length?data:null;}catch(e){return null;}}
window.FamilyCloud={boot,active,account,saveState,waitForSave,addDrawing,drawings,deleteDrawingsPast,deleteDrawingsChild,resetFamily,guestData,api};
})();
