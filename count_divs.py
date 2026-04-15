import re

with open('app/admin/ventas/nueva/page.js','r',encoding='utf8') as f:
    c=0
    for i,l in enumerate(f,1):
        opens=len(re.findall(r'<div\b',l))
        closes=len(re.findall(r'</div>',l))
        c+=opens-closes
        if c<0:
            print('negative count at',i)
            break
    print('final count',c)
