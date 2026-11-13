import fs from'node:fs';import path from'node:path';
const canonical='skills/underoot-paper-publishing/scripts';
for(const kind of['slides','poster']){const dir=`skills/underoot-paper-${kind}/scripts`;fs.mkdirSync(dir,{recursive:true});for(const name of fs.readdirSync(canonical))if(/\.(mjs|py)$/.test(name))fs.copyFileSync(path.join(canonical,name),path.join(dir,name));fs.writeFileSync(path.join(dir,'generate.mjs'),`if(process.argv.includes('--kind'))throw Error('This skill already selects ${kind}');\nprocess.argv.push('--kind','${kind}');\nawait import('./build-publication.mjs');\n`);}
console.log('Both independent publishing skill runtimes synchronized');
