import re
c=0
with open('app/admin/ventas/nueva/page.js','r',encoding='utf8') as f:
    for i,l in enumerate(f,1):
        opens=l.count('{')
        closes=l.count('}')
        c+=opens-closes
        if c==1 and opens>0:
            print('count1 at',i,l.strip())
        if c==0 and closes>0:
            print('back to0 at',i,l.strip())
print('final',c)
