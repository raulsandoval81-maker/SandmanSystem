export function bindOnce(el, type, handler, key){
  const k = `__bound_${type}_${key}`;
  if (el[k]) return;
  el.addEventListener(type, handler);
  el[k] = true;
}
// dom.util.js
export function mountList(target, rows){
  target.replaceChildren(...rows); // wipes old, mounts new
}
