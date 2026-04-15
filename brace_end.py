import re
c=0
with open('app/admin/ventas/nueva/page.js','r',encoding='utf8') as f:
    for i,l in enumerate(f,1):
        opens=l.count('{')
        closes=l.count('}')
        c+=opens-closes
        if i>1700:
            print(i, opens, closes, c, l.strip())
print('final',c)
