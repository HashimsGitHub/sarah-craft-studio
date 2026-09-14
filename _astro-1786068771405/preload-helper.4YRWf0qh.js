export const a = (fn) => typeof fn === 'function' ? fn() : Promise.resolve(fn);
export default a;
