/** Navigation only: never use approximate matches to apply manuscript changes. */
export function suggestionRange(text,item){
 const quote=typeof item.before==='string'?item.before:'',at=Number.isInteger(item.from)?item.from:0;
 if(quote&&text.slice(at,at+quote.length)===quote)return{from:at,to:at+quote.length};
 const matches=[];if(quote)for(let pos=text.indexOf(quote);pos>=0&&matches.length<100;pos=text.indexOf(quote,pos+1))matches.push({from:pos,to:pos+quote.length});
 if(!matches.length){const image=/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/.exec(quote);if(image)for(const m of text.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g))if(m[1]===image[1])matches.push({from:m.index,to:m.index+m[0].length});}
 if(!matches.length)return null;const best=matches.sort((a,b)=>Math.abs(a.from-at)-Math.abs(b.from-at))[0];return{...best,approximate:matches.length>1||text.slice(best.from,best.to)!==quote};
}
