import assert from 'node:assert/strict';
import {publicationIdentity} from '../skills/underoot-paper-publishing/scripts/publication-identity.mjs';
import {standaloneText,standalonePage} from '../skills/underoot-paper-publishing/scripts/standalone-copy.mjs';
import {editorialPlan} from '../skills/underoot-paper-publishing/scripts/editorial-plan.mjs';
import {renderPublication} from '../skills/underoot-paper-publishing/scripts/styles.mjs';
let count=0;const check=(label,value)=>{assert.ok(value,label);count++;console.log('✓',label);};
const acm=String.raw`% \author{Comment impostor}
\documentclass{acmart}\begin{document}\title{A study}
\author{Alice}\affiliation{\institution{Example University}\city{Tokyo}\country{Japan}}\email{alice@example.test}
\author{Bob}\affiliation{\institution{Example University}\city{Tokyo}\country{Japan}}
\author{Carol}\affiliation{\institution{Another Institute}\country{China}}
\begin{abstract}Independent study.\end{abstract}\maketitle
\section{Method}\author{Body impostor}`;
const id=publicationIdentity(acm);
check('ACM post-document title block collects every author',id.authors==='[1] Alice\n[1] Bob\n[2] Carol');
check('ACM short-author optional argument is not an institution index',publicationIdentity(String.raw`\author[A.]{Alice}\affiliation{\institution{Example University}}`).authors==='[1] Alice');
check('shared ACM institutions are deduplicated with correct indices',id.affiliations.split('\n').length===2&&id.affiliations.includes('[2] Another Institute'));
check('post-document contact is retained',id.contact==='alice@example.test');
check('comments and body author examples are excluded',!JSON.stringify(id).includes('impostor'));
const icml=publicationIdentity(String.raw`\begin{document}\begin{icmlauthorlist}\icmlauthor{Alice}{uni,equal}\icmlauthor{Bob}{lab}\end{icmlauthorlist}\icmlaffiliation{uni}{Example University}\icmlaffiliation{lab}{Example Lab}\icmlcorrespondingauthor{Alice}{alice@example.test}\begin{abstract}Body\end{abstract}`);
check('ICML two-argument authors retain affiliation keys',icml.authors==='[uni,equal] Alice\n[lab] Bob');
check('ICML two-argument affiliations retain names',icml.affiliations.includes('[uni] Example University')&&icml.affiliations.includes('[lab] Example Lab'));
const ieee=publicationIdentity(String.raw`\author{\IEEEauthorblockN{Alice and Bob}\IEEEauthorblockA{Example University\\City, Country}}\begin{document}\maketitle`);
check('IEEE names and affiliation blocks are separated',ieee.authors==='Alice and Bob'&&ieee.affiliations.includes('Example University'));
const neurips=publicationIdentity(String.raw`\author{Alice\\Example University\\alice@example.test\And Bob\\Example Lab\\bob@example.test}\begin{document}\maketitle`);
check('NeurIPS inline units are separated from author names',neurips.authors==='[1] Alice\n[2] Bob'&&neurips.affiliations.includes('Example Lab')&&!neurips.authors.includes('@'));
const macro=publicationIdentity(String.raw`\newcommand{\ourauthors}{Alice and Bob}\newcommand{\ourunit}{Example University}\author{\ourauthors}\affil{\ourunit}\begin{document}\maketitle`);
check('bounded zero-argument metadata macros expand without executing TeX',macro.authors==='Alice and Bob'&&macro.affiliations==='Example University');
check('author footnotes do not become names',publicationIdentity(String.raw`\author{Alice\thanks{Equal contribution}}\begin{document}\maketitle`).authors==='Alice');
check('body and verbatim declarations cannot impersonate title metadata',!publicationIdentity(String.raw`\begin{verbatim}\author{Fake}\end{verbatim}\author{Real}\begin{document}\maketitle\author{Fake}`).authors.includes('Fake'));
const cases=[
 [String.raw`**Figure\~[fig:framework] summarizes SCaDiff.**`, ''],
 [String.raw`Figure~\ref{fig:result} shows that accuracy improves by 6.9% on Tokyo only.`, 'Accuracy improves by 6.9% on Tokyo only.'],
 [String.raw`As shown in Fig.~[fig:result], accuracy is 87.1% versus 80.2% under the same budget.`, 'Accuracy is 87.1% versus 80.2% under the same budget.'],
 [String.raw`SCaDiff (Figure 3) uses event-conditioned diffusion.`, 'SCaDiff uses event-conditioned diffusion.'],
 [String.raw`See Section~[sec:method]. The method retains five seeds.`, 'The method retains five seeds.'],
 [String.raw`Table~\ref{tab:results} summarizes the comparison.`, ''],
 [String.raw`A 6.9% gain with a 95% interval; the scope is limited to Tokyo.`, 'A 6.9% gain with a 95% interval; the scope is limited to Tokyo.'],
 [String.raw`The method uses Figure~[fig:omitted] for its explanation.`, ''],
 [String.raw`Figure~[framework] illustrates that scope is limited to one city.`, 'Scope is limited to one city.'],
 [String.raw`p < 0.05; only five seeds.`, 'p < 0.05; only five seeds.'],
 [String.raw`Travel-time map and event effects. See Figure 7.`, 'Travel-time map and event effects.'],
];
for(const [input,expected]of cases)check('independent copy: '+input,standaloneText(input)===expected);
const chunks=[{id:'c0001',text:'Accuracy 87.1% versus 80.2% under the same budget.'}];
const plan={title:'Independent evidence',author:'Alice',chunks,visuals:[{path:'result.png',label:'fig:result',caption:'Accuracy under a fixed budget. See Figure 4.',sourceIds:['c0001']}]};
const original='Figure~[fig:framework] summarizes SCaDiff.';
const summary={aiNarrative:true,notes:[{id:'c0001',summary:original}],sections:[{title:'Method',takeaway:original,bullets:[original,'Accuracy 87.1% versus 80.2% under the same budget.'],sourceIds:['c0001']}]};
for(const kind of ['slides','poster']){
 const options={kind,count:6,columns:2,style:kind==='slides'?'minimal':'gallery',ratio:169,orientation:'portrait'};
 const story=editorialPlan(plan,summary,options),rendered=renderPublication({...plan,editorial:story},options);
 check(kind+' preview and captions have no paper references',!JSON.stringify(story.pages.map(p=>({title:p.title,takeaway:p.takeaway,bullets:p.bullets,captions:p.figures.map(f=>f.caption)}))).match(/fig:|Figure 4|summarizes SCaDiff/));
 check(kind+' rendered TeX has no orphan paper references',!rendered.includes('fig:')&&!rendered.includes('Figure 4')&&!rendered.includes('summarizes SCaDiff'));
 check(kind+' notes retain unmodified source provenance',story.notes[0].summary===original&&story.pages[0].sourceIds.includes('c0001'));
 check(kind+' source-grounded numeric evidence survives',rendered.includes('87.1')&&rendered.includes('80.2'));
 check(kind+' unsafe navigation removal is disclosed',story.warnings.some(w=>w.includes('交叉引用')));
}
check('selected-block edits receive the same copy normalization',standalonePage({title:'Results',bullets:[original,'Five seeds; only one city.'],figures:[]}).bullets.join()==='Five seeds; only one city.');
console.log(`Publication standalone: ${count}/${count} passed`);
