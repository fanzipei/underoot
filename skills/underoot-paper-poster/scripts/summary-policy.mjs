export const SUMMARY_TARGET_CHARS=1800;
export const SUMMARY_MAX_CHARS=5000;
export const REPAIR_INPUT_CHARS=32000;

export function compressionPlan(actualChars,attempt){
 const targetChars=attempt===1?1600:1200;
 return{actualChars,targetChars,maxAcceptedChars:SUMMARY_MAX_CHARS,reduceByAtLeastPercent:Math.max(0,Math.ceil((1-targetChars/actualChars)*100)),
  keep:['question or gap','mechanism and innovation','key results with exact numbers, units, baselines and conditions','limitations and uncertainty'],
  remove:['repeated background and setup','duplicate claims and repeated values','paper title and author restatements','figure-by-figure narration','generic praise and concluding filler']};
}
