export type ShirtGroup = "youth" | "adult";
export const YOUTH_SIZES = ["XS","S","M","L","XL"] as const;
export const ADULT_SIZES = ["XS","S","M","L","XL","2XL","3XL"] as const;
export const OPENING_DATE = "2026-11-23";
export function variantInfo(input: unknown) {
  const key = String(input ?? "").trim().toLowerCase();
  const match = /^(youth|adult)-(gray|white|yellow|orange|green|blue|purple|brown|black)-(xs|s|m|l|xl|2xl|3xl)$/.exec(key);
  if (!match) throw new Error("Invalid shirt variant.");
  const group = match[1] as ShirtGroup, color = match[2], size = match[3].toUpperCase();
  if (group === "youth" && !YOUTH_SIZES.includes(size as any))
    throw new Error("Youth sizing ends at XL; Youth 2XL and 3XL are invalid.");
  return {key,group,color,size};
}
export function changeQuantity(before: number, change: number) {
  if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(change))
    throw new Error("Stock must be a whole number.");
  const after = before + change;
  if (!Number.isSafeInteger(after) || after < 0) throw new Error("Insufficient stock.");
  return after;
}
const ENTRIES: [string,number][] = [
 ["youth-gray-s",14],["youth-gray-m",10],["youth-gray-l",11],["youth-gray-xl",8],
 ["adult-gray-m",10],["adult-gray-l",9],["adult-gray-xl",8],["adult-gray-2xl",3],
 ["youth-white-s",13],["youth-white-m",12],["youth-white-l",12],["youth-white-xl",2],
 ["adult-white-xs",3],["adult-white-s",4],["adult-white-m",4],["adult-white-l",2],["adult-white-xl",1],["adult-white-2xl",6],
 ["youth-yellow-s",2],["adult-blue-s",3],["adult-blue-m",6],["adult-purple-xl",4]
];
export const OPENING_STOCK = Object.freeze(ENTRIES.map(([key,quantity]) => { variantInfo(key); return {key,quantity}; }));
export const OPENING_TOTALS = Object.freeze({
 youth: OPENING_STOCK.filter(x=>x.key.startsWith("youth-")).reduce((n,x)=>n+x.quantity,0),
 adult: OPENING_STOCK.filter(x=>x.key.startsWith("adult-")).reduce((n,x)=>n+x.quantity,0),
 total: OPENING_STOCK.reduce((n,x)=>n+x.quantity,0),
});
if (OPENING_TOTALS.total!==147 || OPENING_TOTALS.youth!==84 || OPENING_TOTALS.adult!==63) throw new Error("Opening count mismatch.");
