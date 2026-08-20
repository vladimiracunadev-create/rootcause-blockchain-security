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
