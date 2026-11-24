import json,re
L=json.load(open('en.json'))
D={}
for f in ['ms1.txt','ms2.txt','ms3.txt']:
    for line in open(f,encoding='utf8'):
        line=line.rstrip('\n')
        if line.strip(): i,t=line.split('\t',1); D[L[int(i)]]=t
for line in open('extra.txt',encoding='utf8'):
    line=line.rstrip('\n')
    if line: k,v=line.split('\t',1); D[k]=v
for k in ['{0} on {1}','{0} · {1} {2} from {3}','{0}{1} · {2} deliver{3}']: D.pop(k,None)
bad=[(k,v) for k,v in D.items() if set(re.findall(r'\{\d\}',v))-set(re.findall(r'\{\d\}',k))]
print(len(D),'entries; bad:',bad)
open('/home/claude/ladangkita/public/i18n-ms.js','w',encoding='utf8').write('// Bahasa Melayu text for LadangKita. Keys are the English text in app.js; numbered braces stand for the changing parts.\nwindow.LK_MS = '+json.dumps(D,ensure_ascii=False,indent=0)+';\n')
