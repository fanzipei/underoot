if(process.argv.includes('--kind'))throw Error('This skill already selects poster');
process.argv.push('--kind','poster');
await import('./build-publication.mjs');
