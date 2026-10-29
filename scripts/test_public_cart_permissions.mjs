// Run the real public-cart handlers in isolation. No network or production writes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.createSourceFile('page.js', readFileSync(new URL('../app/productos/page.js', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const component = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'CatalogoPage');
const selectedNames = ['toBaseQuantity','fromBaseQuantity','getCartKey','getVariantes','getStockDisponibleProducto','getStockDisponibleItem','getItemBaseQuantity','getItemDisplayQuantity','updateCartQty','removeFromCart','confirmAndSendWhatsapp','getAvailableUnits','normalizeUnitName','isDiscreteUnit','normalizeQuantityForUnit','confirmAddToCart'];
const declarations = [];
for (const name of selectedNames) {
  let found;
  for (const statement of component.body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    found = statement.declarationList.declarations.find(d => d.name.getText(source) === name);
    if (found) break;
  }
  assert.ok(found, `Missing real cart handler ${name}`);
  declarations.push(`const ${name} = ${found.initializer.getText(source)};`);
}
const moduleFunctions = source.statements.filter(n => ts.isFunctionDeclaration(n) && ['getEffectiveVariantStock','isDefaultUniqueVariant'].includes(n.name?.text));

function harness(initial, user = null, failure = false, addModal = null) {
  let cart = structuredClone(initial);
  const writes = [], opened = [], alerts = [], reads = [], warnings = [];
  const storage = new Map([['carrito_token','test-cart-owner-token']]);
  const deps = {
    cart, usuario:user, productos:structuredClone(initial),
    addToCartModal:addModal,setAddToCartModal:()=>{},setModalWarning:message=>warnings.push(message),
    setCart:next=>{cart = typeof next === 'function' ? next(cart) : next;},
    alert:message=>alerts.push(message),
    localStorage:{getItem:key=>storage.get(key)||null,removeItem:key=>storage.delete(key)},
    window:{open:url=>opened.push(url)},
    customerData:{nombre:'Cliente de prueba',nit_ci:'TEST'},
    activeSucursalId:'branch-test',activeSucursal:{},storeSettings:{},
    setShowConfirmOrder:()=>{},setCustomerData:()=>{},cartStorageKey:'test-cart',
    getItemPricing:p=>({precioFinal:p.precio,precioOriginal:p.precio,descuento:0,promocion:null}),
    getItemDiscountTotal:()=>0,getCartDiscountTotal:()=>0,
    getItemSubtotal:p=>p.precio*(p.cantidad_base??p.cantidad),
    getCartSubtotalOriginal:()=>0,getCartTotal:()=>0,getItemQuantityText:p=>String(p.cantidad),
    resolveBranchWhatsapp:()=> '000000000',CONFIG:{WHATSAPP_BUSINESS:'000000000'},
    supabase:{from:table=>{
      if (['productos','producto_variantes'].includes(table)) {
        const filters = {};
        const query = {
          select(){reads.push(table);return query;},
          eq(column,value){filters[column]=value;return query;},
          async maybeSingle(){
            const rows = table === 'productos' ? [addModal?.producto].filter(Boolean) : (addModal?.variantes || []).map(v=>({...v,id:v.variante_id??v.id}));
            return {data:rows.find(row=>Object.entries(filters).filter(([key])=>key!=='sucursal_id').every(([key,value])=>String(row[key])===String(value)))||null,error:null};
          }
        };
        return query;
      }
      assert.equal(table,'carritos_pendientes' ,'The public cart must not write products, packs, sales or stock');
      return {
        insert(payload) {
          writes.push({table,payload});
          return {
            select(columns) {
              assert.equal(columns,'id');
              return {single:async()=> failure ? {data:null,error:{message:'test denied'}} : {data:{id:42},error:null}};
            }
          };
        }
      };
    }},
  };
  const factory = new Function(...Object.keys(deps), `${moduleFunctions.map(n=>n.getText(source)).join('\n')}\n${declarations.join('\n')}\nreturn {updateCartQty,removeFromCart,confirmAndSendWhatsapp,confirmAddToCart};`);
  return {...factory(...Object.values(deps)),getCart:()=>cart,writes,opened,alerts,reads,warnings};
}
const product = {user_id:10,nombre:'Producto de prueba',cantidad:2,cantidad_base:2,cantidad_display:2,unidad:'unidad',unidad_base:'unidad',stock:8,precio:5};

test('public +/- and remove change only the local basket, not PostgreSQL or stock',()=>{
  const h=harness([product]);
  h.updateCartQty('prod:10:default',3);assert.equal(h.getCart()[0].cantidad,3);
  h.updateCartQty('prod:10:default',1);assert.equal(h.getCart()[0].cantidad,1);
  assert.equal(h.getCart()[0].stock,8);
  h.removeFromCart('prod:10:default');assert.deepEqual(h.getCart(),[]);
  assert.equal(h.writes.length,0);
});
test('quantity changes respect available stock and keep other basket items',()=>{
  const other={...product,user_id:11};const h=harness([product,other]);
  h.updateCartQty('prod:10:default',99);
  assert.equal(h.getCart()[0].cantidad_base,8);assert.equal(h.getCart()[1].cantidad,2);
  assert.equal(h.alerts.length,1);assert.equal(h.writes.length,0);
});
test('changing a converted quantity preserves base and display units locally',()=>{
  const h=harness([{...product,unidad:'pieza',unidad_base:'caja',factor_conversion:10,cantidad:20,cantidad_display:20,cantidad_base:2}]);
  h.updateCartQty('prod:10:default',30);
  assert.equal(h.getCart()[0].cantidad_display,30);assert.equal(h.getCart()[0].cantidad_base,3);
  assert.equal(h.writes.length,0);
});
test('guest submits a pending order with owner token and reads its new number before WhatsApp',async()=>{
  const h=harness([product]);await h.confirmAndSendWhatsapp();
  assert.equal(h.writes.length,1);const row=h.writes[0].payload[0];
  assert.equal(row.usuario_id,null);assert.equal(row.carrito_token,'test-cart-owner-token');
  assert.equal(row.sucursal_id,'branch-test');assert.equal(row.productos[0].cantidad_base,2);
  assert.equal(h.opened.length,1);assert.ok(decodeURIComponent(h.opened[0]).includes('42'));
  assert.deepEqual(h.getCart(),[]);
});
test('authenticated customer submits own user ID with the same pending-order flow',async()=>{
  const h=harness([product],{id:'test-user',email:'test@example.test',nombre:'Prueba'});
  await h.confirmAndSendWhatsapp();assert.equal(h.writes[0].payload[0].usuario_id,'test-user');
  assert.equal(h.writes[0].payload[0].carrito_token,'test-cart-owner-token');
});
test('a denied insert/returning preserves the basket and never opens WhatsApp',async()=>{
  const h=harness([product],null,true);await h.confirmAndSendWhatsapp();
  assert.equal(h.getCart().length,1);assert.equal(h.opened.length,0);assert.equal(h.alerts.length,1);
});
test('empty basket cannot create a pending order',async()=>{
  const h=harness([]);await h.confirmAndSendWhatsapp();assert.equal(h.writes.length,0);assert.equal(h.opened.length,0);
});
test('a pack order is saved as pending JSON without updating the packs catalog',async()=>{
  const pack={...product,user_id:'pack-5',tipo:'pack',pack_id:5,pack_data:{pack_productos:[{cantidad:1,productos:{user_id:10,nombre:'Prueba'}}]}};
  const h=harness([pack]);await h.confirmAndSendWhatsapp();
  assert.equal(h.writes[0].payload[0].productos[0].pack_id,5);assert.equal(h.writes[0].table,'carritos_pendientes');
});

test('adding a guest product reads current stock and adds locally without writing inventory',async()=>{
  const h=harness([],null,false,{producto:product,variantes:[],cantidad:2,unidad:'unidad'});
  await h.confirmAddToCart();
  assert.equal(h.getCart().length,1);assert.equal(h.getCart()[0].cantidad_base,2);
  assert.deepEqual(h.reads,['productos']);assert.equal(h.writes.length,0);
});
test('adding a selected variant requires its public SELECT but no database UPDATE',async()=>{
  const variant={id:101,variante_id:101,color:'Azul',stock:3,stock_decimal:3,precio:5};
  const h=harness([],null,false,{producto:{...product,variantes:[variant]},variantes:[variant],selectedVarianteId:101,cantidad:1,unidad:'unidad'});
  await h.confirmAddToCart();
  assert.equal(h.getCart().length,1);assert.equal(h.getCart()[0].variante_id,101);
  assert.deepEqual(h.reads,['productos','producto_variantes']);assert.equal(h.writes.length,0);
});
