import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { MANAGEMENT_STAFF_ROLES, requireActiveStaff, requireStaffLocation } from "../services/staffAuthorization";
import { OPENING_STOCK, OPENING_TOTALS, OPENING_DATE, variantInfo, changeQuantity } from "./shirtInventoryPolicy";
const clean = (x:unknown) => String(x??"").trim();
function checkedVariant(x:unknown) {
  try {return variantInfo(x);} catch(e) {throw new HttpsError("invalid-argument",e instanceof Error?e.message:"Invalid variant.");}
}
function timestamp(x:any) {return x && typeof x.toMillis==="function"?x.toMillis():null;}
function failQuantity(x:unknown, signed=false):number {
  if (!Number.isSafeInteger(x)|| (signed?x===0:(x as number)<=0)||Math.abs(x as number)>500)
    throw new HttpsError("invalid-argument","Quantity must be a nonzero whole number of at most 500.");
  return x as number;
}
// No client Firestore inventory writes are authorized; all operations pass through this callable.
export const managementShirtInventory = onCall({region:"us-central1",maxInstances:20},async(req)=>{
  if (!req.auth?.uid) throw new HttpsError("unauthenticated","Management authentication required.");
  const actor=await requireActiveStaff(req.auth.uid,MANAGEMENT_STAFF_ROLES,"Active Management access required.");
  const input:any=req.data||{}, action=clean(input.action).toLowerCase();
  const locationId=clean(input.locationId);
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(locationId))
    throw new HttpsError("invalid-argument","Invalid inventory location.");
  requireStaffLocation(actor,locationId);
  const db=getFirestore(), base=db.collection("management_inventory").doc(locationId);
  const stock=base.collection("stock"), movements=base.collection("movements");
  if (action==="list") {
    const [s,m,o]=await Promise.all([stock.get(),movements.orderBy("createdAt","desc").limit(50).get(),
      base.collection("opening").doc(OPENING_DATE).get()]);
    return {ok:true,locationId,openingImported:o.exists,openingTotals:OPENING_TOTALS,
      stock:s.docs.map(d=>({key:d.id,onHand:d.data().onHand,updatedAt:timestamp(d.data().updatedAt)})),
      movements:m.docs.map(d=>({id:d.id,operation:d.data().operation,variant:d.data().variant,
        quantity:d.data().quantity,stockAfter:d.data().stockAfter,
        athleteId:d.data().athleteId||"",note:d.data().note||"",createdAt:timestamp(d.data().createdAt)}))};
  }
  if (action==="import-opening") {
    const marker=base.collection("opening").doc(OPENING_DATE);
    const result=await db.runTransaction(async tx=>{
      if ((await tx.get(marker)).exists) return {alreadyApplied:true};
      const refs=OPENING_STOCK.map(x=>stock.doc(x.key));
      const previous=await tx.getAll(...refs);
      if (previous.some(x=>x.exists))
        throw new HttpsError("failed-precondition","Inventory already contains opening stock. Import stopped.");
      for (let i=0;i<OPENING_STOCK.length;i++) {
        const x=OPENING_STOCK[i], at=FieldValue.serverTimestamp();
        tx.create(refs[i],{...variantInfo(x.key),onHand:x.quantity,reorderAt:2,updatedAt:at,updatedBy:actor.uid});
        tx.create(movements.doc("opening-"+OPENING_DATE+"-"+x.key),
          {operation:"opening",variant:x.key,quantity:x.quantity,stockAfter:x.quantity,
            note:"Owner physical count on "+OPENING_DATE,actorUid:actor.uid,createdAt:at});
      }
      tx.create(marker,{importedBy:actor.uid,importedAt:FieldValue.serverTimestamp(),...OPENING_TOTALS});
      return {alreadyApplied:false};
    });
    return {ok:true,locationId,openingTotals:OPENING_TOTALS,...result};
  }
  if (!["received","issued","returned","damaged","correction"].includes(action))
    throw new HttpsError("invalid-argument","Invalid inventory action.");
  const variant=checkedVariant(input.variant);
  const operationId=clean(input.operationId);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,99}$/.test(operationId))
    throw new HttpsError("invalid-argument","Unique operation ID required.");
  const quantity=failQuantity(input.quantity,action==="correction");
  const delta=action==="issued"||action==="damaged"?-quantity:quantity;
  const athleteId=clean(input.athleteId),note=clean(input.note);
  if (note.length>240 || ((action==="damaged"||action==="correction"||action==="issued"&&!athleteId)&&note.length<3))
    throw new HttpsError("invalid-argument","Reason required for adjustments, damage, or unassigned issuance (max 240 characters).");
  if (athleteId && !/^[a-zA-Z0-9_-]{4,128}$/.test(athleteId))
    throw new HttpsError("invalid-argument","Invalid athlete ID.");
  const event=movements.doc(operationId),item=stock.doc(variant.key), athlete=athleteId?db.collection("athletes").doc(athleteId):null;
  const result=await db.runTransaction(async tx=>{
    const previous=await tx.get(event);
    if (previous.exists) {
      const p:any=previous.data()||{};
      if (p.operation!==action||p.variant!==variant.key||p.quantity!==quantity||
          (p.athleteId||"")!==athleteId||(p.note||"")!==note)
        throw new HttpsError("already-exists","Operation ID already belongs to a different movement.");
      return {alreadyApplied:true,stockAfter:p.stockAfter};
    }
    const current=await tx.get(item), verified=athlete?await tx.get(athlete):null;
    if (athlete) {
      if (!verified?.exists) throw new HttpsError("not-found","Athlete ID not found.");
      const a:any=verified.data()||{};
      if (clean(a.locationId||a.academyId)!==locationId)
        throw new HttpsError("permission-denied","Athlete is outside this location.");
    }
    let after:number;
    try { after=changeQuantity(current.exists?Number(current.data()?.onHand):0,delta); }
    catch(e) { throw new HttpsError("failed-precondition",e instanceof Error?e.message:"Invalid stock."); }
    const at=FieldValue.serverTimestamp();
    tx.set(item,{...variant,onHand:after,reorderAt:current.data()?.reorderAt??2,
      updatedAt:at,updatedBy:actor.uid},{merge:true});
    tx.create(event,{operation:action,variant:variant.key,quantity,stockAfter:after,
      athleteId,note,actorUid:actor.uid,createdAt:at});
    return {alreadyApplied:false,stockAfter:after};
  });
  return {ok:true,locationId,operationId,...result};
});
