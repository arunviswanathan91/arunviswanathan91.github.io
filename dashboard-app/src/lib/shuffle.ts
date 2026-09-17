/** Fisher-Yates shuffle that also advances the visible card when possible. */
export function shuffleIds(ids:string[],random:()=>number=Math.random){
 const shuffled=[...ids];
 for(let index=shuffled.length-1;index>0;index--){
  const target=Math.floor(Math.max(0,Math.min(.999999,random()))*(index+1));
  [shuffled[index],shuffled[target]]=[shuffled[target],shuffled[index]];
 }
 if(shuffled.length>1&&shuffled[0]===ids[0]){
  [shuffled[0],shuffled[1]]=[shuffled[1],shuffled[0]];
 }
 return shuffled;
}
