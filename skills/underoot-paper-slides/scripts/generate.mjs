if(process.argv.includes('--kind'))throw Error('This skill already selects slides');
process.argv.push('--kind','slides');
await import('./build-publication.mjs');
