# Sincronizar esta base con el catalogo actual

No ejecutes el schema completo exportado por Supabase. Ese bloque es solo contexto y puede romper datos si se intenta usar como migracion.

En Supabase SQL Editor, sobre la base que quedo atrasada, corre estos scripts en este orden:

1. `scripts/add_product_view_column.sql`
2. `scripts/add_product_unit_columns.sql`
3. `scripts/enable_multi_sucursal.sql`
4. `scripts/enable_transferencia_sucursal.sql`
5. `scripts/harden_sales_stock_flow.sql`
6. `scripts/fix_auth_signup_profile_trigger.sql`

Despues verifica con:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'productos'
  and column_name in (
    'vista_producto',
    'unidad_base',
    'unidades_alternativas',
    'factor_conversion',
    'sucursal_id'
  )
order by column_name;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'sucursales',
    'usuario_sucursales',
    'sucursal_settings',
    'transferencias_sucursal'
  )
order by table_name;
```

Si falla algun script, copia el error exacto antes de correr el siguiente.
