const test=require("node:test"),assert=require("node:assert/strict");
const {variantInfo,changeQuantity,OPENING_STOCK,OPENING_TOTALS}=require("../lib/management/shirtInventoryPolicy.js");
test("opening stock matches verified counts",()=>{
 assert.deepEqual(OPENING_TOTALS,{youth:84,adult:63,total:147});
 assert.equal(OPENING_STOCK.find(x=>x.key==="adult-white-2xl").quantity,6);
 assert.equal(OPENING_STOCK.find(x=>x.key==="youth-gray-s").quantity,14);
});
test("youth max XL, adult 2XL allowed",()=>{
 assert.equal(variantInfo("youth-gray-xl").size,"XL");
 assert.equal(variantInfo("adult-white-2xl").size,"2XL");
 assert.throws(()=>variantInfo("youth-white-2xl"),/Youth sizing ends at XL/);
 assert.throws(()=>variantInfo("youth-gray-3xl"),/Youth sizing ends at XL/);
 assert.throws(()=>variantInfo("adult-gray-4xl"),/Invalid shirt/);
});
test("no negative quantities",()=>{
 assert.equal(changeQuantity(3,-2),1);
 assert.equal(changeQuantity(0,3),3);
 assert.throws(()=>changeQuantity(0,-1),/Insufficient/);
});
