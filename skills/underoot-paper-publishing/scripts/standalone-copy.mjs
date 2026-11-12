/** Publication copy is independent of manuscript numbering. Source notes stay untouched. */
export const standaloneInstruction='Write for readers who have ONLY this poster/slides, not the paper. Explain the research directly. Never mention manuscript figure/table/equation/section numbers, labels (fig:..., sec:...), or paper navigation. Do not write Figure X summarizes/shows our method: state the method or supported finding itself. Figures are unnumbered and only selected visuals are shown; use descriptive captions and never refer to omitted visuals. Keep scientific values, units, conditions and attribution; do not invent details to replace a pointer.';
const identifier=String.raw`(?:\\(?:[cC]ref|[aA]utoref|[eE]qref|ref)\s*\{[^}]*\}|\[[A-Za-z][^\]\n]{0,160}\]|(?:[A-Z]?\d+[a-z]?(?:\.\d+)*(?:\s*\([a-z]\))?|[IVX]+)(?![\w%]))`;
const reference=String.raw`(?:(?:fig(?:ure)?s?|tables?|sections?|secs?|equations?|eqs?|appendi(?:x|ces))\.?\s*(?:\\?~|\s)*${identifier}|\\(?:[cC]ref|[aA]utoref|[eE]qref|ref)\s*\{[^}]*\}|\[(?:fig(?:ure)?|sec(?:tion)?|tab(?:le)?|eq(?:uation)?|app(?:endix)?):[^\]]+\])`;
const ref=new RegExp(reference,'i');
export function standaloneText(value){
 let source=String(value||'').replace(/\*\*/g,'').replace(/\\~/g,' ').replace(/\s+/g,' ').trim();
 const result=[];
 // Protect Fig./Eq./Sec. abbreviations from sentence splitting.
 source=source.replace(/\b(Figs?|Eqs?|Secs?)\./gi,'$1');
 for(let sentence of source.split(/(?<=[。！？!?])\s*|(?<=\.)\s+(?=[A-Z\u3400-\u9fff])/)){
  sentence=sentence.trim();if(!sentence)continue;
  sentence=sentence.replace(new RegExp(String.raw`\s*\((?:see\s+)?${reference}\)`, 'gi'),'');
  const intro=/^(?:as\s|see\s|refer\s)/i.test(sentence);sentence=sentence.replace(new RegExp(String.raw`(?:as\s+(?:shown|illustrated|reported|summarized)\s+in|as\s+seen\s+in|see|refer\s+to)\s+${reference}\s*[,;:]?\s*`,'gi'),'');
  const prefix=new RegExp(String.raw`^(?:the\s+)?${reference}\s+(?:shows?|demonstrates?|reveals?|indicates?|illustrates?)\s+(?:that\s+)?`,'i');
  const rewriteSubject=prefix.test(sentence);sentence=sentence.replace(prefix,'');
  // Unsupported navigation-only or unresolved references stay in source notes,
  // never become orphaned labels or guessed descriptions in public copy.
  if(ref.test(sentence)||/\[(?:fig|sec|tab|eq)[\w-]*:/i.test(sentence))continue;
  sentence=sentence.replace(/^[,;:]\s*/,'').trim();if(!/[\p{L}\p{N}]/u.test(sentence))continue;
  result.push(((rewriteSubject||intro)&&/^[a-z]{2,}\b(?!\s*[(=<>])/.test(sentence))?sentence[0].toLocaleUpperCase()+sentence.slice(1):sentence);
 }
 return result.join(' ');
}
export function standalonePage(page){
 const clean={...page,...(page.text!==undefined?{text:standaloneText(page.text)}:{}),title:standaloneText(page.title)||'Research evidence',takeaway:standaloneText(page.takeaway),bullets:(page.bullets||[]).map(standaloneText).filter(Boolean),figures:(page.figures||[]).map(v=>({...v,caption:standaloneText(v.caption)})),tables:(page.tables||[]).map(v=>({...v,caption:standaloneText(v.caption)}))};
 return clean;
}
export function standaloneEditorial(story){return{...story,pages:story.pages.map(standalonePage)};}
