"""Audit a generated PDF's real pages and text bounds with Poppler; never edits it."""
import argparse,json,re,subprocess,xml.etree.ElementTree as ET
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--pdf',required=True)
parser.add_argument('--kind',choices=['slides','poster'],required=True)
parser.add_argument('--log')
parser.add_argument('--out',required=True)
parser.add_argument('--render-dir')
args=parser.parse_args()
xml=subprocess.check_output(['pdftotext','-bbox-layout',args.pdf,'-'],timeout=60)
root=ET.fromstring(xml);pages=[e for e in root.iter() if e.tag.rsplit('}',1)[-1]=='page']
issues=[];outside=[];body_heights=[]
for index,page in enumerate(pages,1):
 width,height=float(page.attrib['width']),float(page.attrib['height'])
 for word in (e for e in page.iter() if e.tag.rsplit('}',1)[-1]=='word'):
  box=[float(word.attrib[k]) for k in ['xMin','yMin','xMax','yMax']]
  if box[0]<-2 or box[1]<-2 or box[2]>width+2 or box[3]>height+2:outside.append({'page':index,'text':word.text,'box':box})
  if .12*height<box[1]<.88*height and len(word.text or '')>=3:body_heights.append(round(box[3]-box[1],1))
if args.kind=='poster' and len(pages)!=1:issues.append('Poster must occupy exactly one sheet')
if args.kind=='slides' and len(pages)<2:issues.append('Slides have no content frame after the title')
if outside:issues.append('Text extends beyond the PDF page bounds')
log=Path(args.log).read_text(encoding='utf-8',errors='replace') if args.log else ''
overflows=[{'axis':m[0],'points':float(m[1])} for m in re.findall(r'Overfull \\([hv])box \(([\d.]+)pt too (?:wide|high)\)',log)]
if any(item['points']>1 for item in overflows):issues.append('TeX reports a material overflow')
report={'status':'passed' if not issues else 'needs-review','kind':args.kind,'pages':len(pages),'outsideText':outside[:30],'overflowWarnings':overflows,'textHeightRange':{'min':min(body_heights) if body_heights else None,'max':max(body_heights) if body_heights else None},'issues':issues,'visualInspection':'not-run; inspect rendered pages separately'}
Path(args.out).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if args.render_dir:
 folder=Path(args.render_dir);folder.mkdir(parents=True,exist_ok=True)
 if len(pages)>100:raise ValueError('Rendering more than 100 pages requires a separate explicit review')
 subprocess.run(['pdftoppm','-scale-to','1200','-png',args.pdf,str(folder/args.kind)],check=True,timeout=180)
print(json.dumps(report,ensure_ascii=False))
raise SystemExit(0 if not issues else 2)
