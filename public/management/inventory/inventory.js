import { auth, functions, httpsCallable } from "/assets/js/firebase-init.js";
import { requireManagement, managementLoginUrl } from "/management/shared/guards/management-guard.js";
const $=id=>document.getElementById(id);
const call=httpsCallable(functions,"managementShirtInventory");
const COLORS=["gray","white","yellow","orange","green","blue","purple","brown","black"];
const SIZE={youth:["XS","S","M","L","XL"],adult:["XS","S","M","L","XL","2XL","3XL"]};
let locationId="santa-ynez-valley", allStock=[], allMovements=[], pending=false, openingImported=false;
const pretty=s=>s.charAt(0).toUpperCase()+s.slice(1);
function status(msg,error=false){$("inventoryStatus").textContent=msg;$("inventoryStatus").classList.toggle("error",error);}
function option(value,label){const el=document.createElement("option");el.value=value;el.textContent=label||value;return el;}
function setupOptions(){
  for (const c of COLORS){$("movementColor").append(option(c,pretty(c)));$("filterColor").append(option(c,pretty(c)));}
  updateSizes();
}
function updateSizes(){
  const group=$("movementGroup").value,select=$("movementSize"),before=select.value;
  select.replaceChildren(...SIZE[group].map(v=>option(v,v)));
  if (SIZE[group].includes(before)) select.value=before;
}
function tableMessage(tbody,text,colspan=5){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=colspan;td.textContent=text;tr.append(td);tbody.replaceChildren(tr);}
function cell(row,text,cls=""){const td=document.createElement("td");td.textContent=String(text);if(cls)td.className=cls;row.append(td);return td;}
function splitVariant(key){
 const pieces=String(key).split("-");return {group:pieces[0],color:pieces[1],size:(pieces[2]||"").toUpperCase()};
}
function render(){
  const youth=allStock.filter(s=>splitVariant(s.key).group==="youth").reduce((n,s)=>n+s.onHand,0);
  const adult=allStock.filter(s=>splitVariant(s.key).group==="adult").reduce((n,s)=>n+s.onHand,0);
  $("totalStock").textContent=youth+adult;$("youthStock").textContent=youth;$("adultStock").textContent=adult;
  $("lowStock").textContent=allStock.filter(s=>s.onHand<=2).length;
  const filterGroup=$("filterGroup").value,filterColor=$("filterColor").value;
  const rows=allStock.filter(s=>{const p=splitVariant(s.key);return (!filterGroup||p.group===filterGroup)&&(!filterColor||p.color===filterColor);})
    .sort((a,b)=>a.key.localeCompare(b.key));
  const tbody=$("stockRows");tbody.replaceChildren();
  if(!rows.length)tableMessage(tbody,openingImported?"No stock matches these filters.":"No stock imported yet.");
  for(const s of rows){
    const p=splitVariant(s.key),tr=document.createElement("tr");cell(tr,pretty(p.group));
    cell(tr,pretty(p.color)+(p.color==="gray"?" · Apprentice":""));cell(tr,p.size);
    cell(tr,s.onHand);cell(tr,s.onHand<=2?"Low stock":"In stock",s.onHand<=2?"inventory-low":"");
    tbody.append(tr);
  }
  const history=$("movementRows");history.replaceChildren();
  if(!allMovements.length)tableMessage(history,"No inventory movements recorded.");
  for(const m of allMovements){
    const tr=document.createElement("tr"),p=splitVariant(m.variant);
    cell(tr,m.createdAt?new Date(m.createdAt).toLocaleDateString():"Pending");
    cell(tr,pretty(m.operation));cell(tr,pretty(p.group)+" / "+pretty(p.color)+" / "+p.size);
    cell(tr,m.quantity);cell(tr,[m.athleteId?"Athlete: "+m.athleteId:"",m.note].filter(Boolean).join(" · "));
    history.append(tr);
  }
  $("openingState").textContent=openingImported?
    "Opening stock has already been imported at this location. Reimport is disabled.":
    "Uninitialized. Import only after confirming this location holds the owner-counted shirts.";
  $("importOpening").disabled=openingImported||pending;
}
async function refresh(){
  const result=(await call({action:"list",locationId})).data;
  if (!result?.ok) throw new Error("Inventory read was unsuccessful.");
  allStock=Array.isArray(result.stock)?result.stock:[];
  allMovements=Array.isArray(result.movements)?result.movements:[];
  openingImported=result.openingImported===true;
  render();
}
function updateGuidance(){
 const a=$("movementAction").value,q=$("movementQuantity");
 q.min=a==="correction"?"-500":"1";
 q.max="500";
 $("movementGuidance").textContent={
   received:"Adds purchased or received shirts to available stock.",
   issued:"Subtracts shirts. Supply an existing athlete ID, or explain the operational issue.",
   returned:"Adds returned shirts; optionally link to an existing athlete.",
   damaged:"Subtracts unusable shirts and requires a reason.",
   correction:"Adds or subtracts stock using a signed quantity; requires a reason.",
 }[a];
}
async function start(){
  const ctx=await requireManagement();
  const locations=ctx.scope?.locationIds||[];
  if(!ctx.isSystemAdmin&&!locations.length)throw new Error("No Management inventory location assigned.");
  locationId=ctx.isSystemAdmin?"santa-ynez-valley":locations.includes("santa-ynez-valley")?
     "santa-ynez-valley":locations[0];
  $("inventoryScope").textContent="Location: "+locationId;
  setupOptions();updateGuidance();
  $("movementGroup").addEventListener("change",updateSizes);
  $("movementAction").addEventListener("change",updateGuidance);
  $("filterGroup").addEventListener("change",render);
  $("filterColor").addEventListener("change",render);
  $("importOpening").addEventListener("click",async()=>{
    if(pending||openingImported)return;
    if(!window.confirm("Import the November 23 physical count (147 shirts) into "+locationId+"? This cannot be repeated or undone automatically."))return;
    pending=true;$("importOpening").disabled=true;status("Importing opening stock…");
    try{
      const r=(await call({action:"import-opening",locationId})).data;
      await refresh();status(r.alreadyApplied?"Opening stock was already imported.":"Opening inventory imported: 147 shirts.");
    }catch(e){status(e.message||"Import failed; no retry performed.",true);}
    finally{pending=false;render();}
  });
  $("movementForm").addEventListener("submit",async e=>{
    e.preventDefault();if(pending)return;
    const action=$("movementAction").value,group=$("movementGroup").value,
      color=$("movementColor").value,size=$("movementSize").value;
    if(!SIZE[group].includes(size)){status("Invalid size for "+group+".",true);return;}
    const quantity=Number($("movementQuantity").value);
    if(!Number.isSafeInteger(quantity)||quantity===0||Math.abs(quantity)>500){status("Invalid quantity.",true);return;}
    const athleteId=$("movementAthlete").value.trim(), note=$("movementNote").value.trim();
    if(!window.confirm("Record "+action+" "+quantity+" "+group+" "+color+" "+size+" shirt(s) at "+locationId+"?"))return;
    // Preserve this identifier on uncertain errors; never silently retry a stock mutation.
    const operationId=crypto.randomUUID();
    pending=true;$("movementSubmit").disabled=true;status("Recording movement…");
    try{
      const r=(await call({action,locationId,variant:[group,color,size.toLowerCase()].join("-"),
        quantity,athleteId,note,operationId})).data;
      await refresh();status(r.alreadyApplied?"Movement was already recorded.":"Movement recorded. Remaining: "+r.stockAfter);
      $("movementNote").value="";$("movementAthlete").value="";
    }catch(err){status((err.message||"Movement not confirmed.")+" Operation ID: "+operationId+"; verify audit before retry.",true);}
    finally{pending=false;$("movementSubmit").disabled=false;}
  });
  await refresh();status("Inventory loaded for "+locationId+".");
}
start().catch(error=>{
  status(error?.message||"Inventory unavailable.",true);
  if(!auth.currentUser||auth.currentUser.isAnonymous)window.location.replace(managementLoginUrl());
});
