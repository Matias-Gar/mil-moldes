import re
start=871
end=940
c=0
with open('app/admin/ventas/nueva/page.js','r',encoding='utf8') as f:
    for i,l in enumerate(f,1):
        if i<start: continue
        if i>end: break
        opens=l.count('{')
        closes=l.count('}')
        c+=opens-closes
        print(i, opens, closes, c, l.strip())
        if c<0:
            print('NEG at',i)
            break
print('final count',c)
