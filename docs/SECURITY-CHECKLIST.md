# Checklist de despliegue

- [ ] `DEMO_MODE=false` y clave de datos en un gestor de secretos.
- [ ] Bind local o red administrativa dedicada.
- [ ] Autenticación y RBAC delante de la API.
- [ ] RPC aislado, autenticado y sin exposición pública.
- [ ] Egress restringido a observadores aprobados.
- [ ] Backups cifrados y restauración probada.
- [ ] Dos fuentes independientes para eventos críticos.
- [ ] Alertas entregadas fuera del mismo dominio de fallo.
- [ ] Runbooks ensayados sin claves reales.
- [ ] Inventario sin secretos ni datos personales innecesarios.
- [ ] Cuentas vigiladas registradas solo con dirección pública, propósito y política.
- [ ] Allowlists de spenders, operadores y contrapartes revisadas y locales.
- [ ] Límites de allowance y umbrales dust definidos por activo y por red.
- [ ] Configuración esperada de smart accounts (owners, módulos, umbral, delegate) declarada.
- [ ] Runbooks de wallet ensayados: revocación y rotación desde un entorno independiente.
- [ ] Asumido que un RPC remoto ve las direcciones consultadas; nodo propio para vigilancia sensible.
