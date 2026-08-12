-- Ejecutar en una base aislada después de inventory_integrity_v2.sql.
-- Este archivo no crea ventas ni modifica inventario real.
begin;

do $$
declare q numeric; sample numeric;
begin
  if public.inventory_base_quantity('metro',1,'rollo',array['metro'],25) <> 0.04 then
    raise exception 'Conversión 1 metro / 25 falló';
  end if;
  if 2-public.inventory_base_quantity('metro',1,'rollo',array['metro'],25) <> 1.96 then
    raise exception 'Dos rollos menos un metro no produce 1.96';
  end if;
  foreach sample in array array[0.001,0.01,0.1,0.25,0.5,0.75,0.99,1,1.01,1.5,2,10,24.99,25,25.01,100]::numeric[] loop
    q:=public.inventory_base_quantity('metro',sample,'rollo',array['metro'],25);
    if q*25 <> sample then raise exception 'Deriva decimal para %',sample; end if;
  end loop;
  begin
    perform public.inventory_base_quantity('metro',0,'rollo',array['metro'],25);
    raise exception 'Aceptó cero';
  exception when others then if sqlerrm='Aceptó cero' then raise; end if; end;
  begin
    perform public.inventory_base_quantity('caja',1,'rollo',array['metro'],25);
    raise exception 'Aceptó unidad desconocida';
  exception when others then if sqlerrm='Aceptó unidad desconocida' then raise; end if; end;
end $$;

-- La prueba se revierte deliberadamente. Las pruebas de venta, cancelación,
-- transferencia, packs y concurrencia requieren fixtures de staging con los
-- IDs/roles reales; nunca deben apuntar a producción.
rollback;
