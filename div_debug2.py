import re
c=0
with open('app/admin/ventas/nueva/page.js','r',encoding='utf8') as f:
    for i,l in enumerate(f,1):
        opens=len(re.findall(r'<div\b',l))
        closes=len(re.findall(r'</div>',l))
        c+=opens-closes
        if i>=960:
            print(i, 'open',opens,'close',closes,'count',c, repr(l))
        if c<0:
            print('NEG',i)
            break
print('final',c)
