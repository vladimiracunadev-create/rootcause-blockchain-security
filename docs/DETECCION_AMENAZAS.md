# Mapa honesto de detección

Qué detecta esta herramienta hoy, amenaza por amenaza, y —más importante— qué
**no** detecta. Un producto de seguridad que solo enumera sus capacidades es un
folleto.

La regla de este documento: si una fila dice «sí», existe un código `BLK-*` que
lo dispara y una prueba que lo cubre. Si dice «no», no hay excusa que lo
disimule.

## Cómo perdió dinero este ecosistema

Las pérdidas grandes en aplicaciones blockchain no vienen mayoritariamente de
romper criptografía. Vienen de **controles mal puestos**. Esta es la taxonomía
que usa el producto, ordenada por lo que más ha costado históricamente:

| # | Familia de amenaza | ¿Se detecta? | Cómo |
|---|---|---|---|
| 1 | Clave administrativa única sobre un contrato con valor | **Sí** | `BLK-ACCESS-001` |
| 2 | Multisig que no aporta quorum real | **Sí** | `BLK-ACCESS-002` |
| 3 | Upgrade ejecutable sin ventana de detección | **Sí** | `BLK-UPGRADE-001` |
| 4 | Gobernanza sin timelock suficiente | **Sí** | `BLK-GOV-001` |
| 5 | Oráculo concentrado sin alternativa | **Sí** | `BLK-ORACLE-001` |
| 6 | Precio vencido consumido como si fuera actual | **Sí** | `BLK-ORACLE-002` |
| 7 | Puente con quorum débil u operadores no independientes | **Sí (declarado)** | `BLK-BRIDGE-001` |
| 8 | Dependencia sin fijar o sin procedencia | **Sí (declarado)** | `BLK-SUPPLY-001` |
| 9 | Bytecode sin relación verificable con la fuente | **Sí (declarado)** | `BLK-CONTRACT-001` |
| 10 | Cambio de rol privilegiado sin aprobación previa | **Sí (con evento)** | `BLK-EVENT-001` |
| 11 | Salida de valor anómala fuera de política | **Sí (con evento)** | `BLK-FUNDS-001` |
| 12 | Ceguera del observador: caído, cadena equivocada, atrasado | **Sí** | `BLK-NODE-001/002/003` |
| 13 | Reentrancy, overflow, lógica defectuosa del contrato | **No** | Requiere análisis de bytecode |
| 14 | Manipulación económica de precio (oracle manipulation) | **No** | Requiere simulación y datos de mercado |
| 15 | Ataque de gobernanza por acumulación de tokens | **No** | Requiere seguimiento de tenencia |
| 16 | MEV, sandwich, front-running | **No** | Requiere observar el mempool |
| 17 | Phishing de firmantes, ingeniería social | **No** | Fuera de la superficie on-chain |
| 18 | Compromiso del equipo desde el que se firma | **No** | Es el trabajo de RootCause Windows/macOS Inspector |

## Los tres grados de «sí»

No todos los «sí» valen lo mismo, y mezclarlos sería deshonesto.

### Sí verificado contra la cadena

`BLK-NODE-001`, `BLK-NODE-002`, `BLK-NODE-003`.

Se comprueban contra el nodo: disponibilidad, chain ID y atraso son hechos que
el observador obtiene por JSON-RPC. Con el límite de siempre: **un RPC puede
mentir o estar comprometido.**

### Sí sobre hechos observados

`BLK-EVENT-001`, `BLK-FUNDS-001`.

Dependen de que alguien —el adaptador de cadena— entregue el hecho a la API. El
producto evalúa correctamente lo que recibe; **no puede detectar un evento que
nadie le contó.** Si tu pipeline de eventos se cae, estas dos reglas quedan
mudas sin dar señal, que es exactamente por qué existe `BLK-NODE-001`.

### Sí sobre lo que tú declaras

`BLK-CONTRACT-001`, `BLK-ACCESS-001/002`, `BLK-UPGRADE-001`, `BLK-ORACLE-001/002`,
`BLK-BRIDGE-001`, `BLK-GOV-001`, `BLK-SUPPLY-001`.

Evalúan el inventario que registraste. **Si declaras que tu puente tiene tres
operadores independientes y en realidad los tres están en la misma cuenta de
AWS, la regla te dará la razón.**

Esto no es un defecto disimulable: es el modelo. La herramienta te obliga a
escribir tus controles y luego te confronta con tu propia declaración. Su valor
está en que *hacer el inventario* ya descubre la mitad de los problemas, y en
que la declaración queda registrada, fechada y auditable — de modo que si
resultó falsa, eso también es un hallazgo.

## Lo que estructuralmente no puede hacer

### No analiza el contrato

No hay decompilación, ni análisis simbólico, ni verificación formal, ni
simulación. Un contrato con un `reentrancy` de manual pasa este producto sin
una sola alerta si sus controles administrativos están bien puestos.

**Qué usar en su lugar:** auditoría profesional, Slither/Mythril en el pipeline,
verificación formal para las invariantes que importan, y `foundry`/`echidna`
para fuzzing.

### No observa el mempool

No ve transacciones pendientes. MEV, front-running y sandwich quedan fuera por
construcción: el observador consulta bloques, no la cola.

### No consulta reputación externa

No hay listas de direcciones maliciosas ni servicios de terceros. Es una
decisión, no una carencia: consultar una lista externa filtraría **qué estás
vigilando** al proveedor de la lista, que es información sensible sobre tu
sistema. Ver [`ADR-0001`](ADR-0001-plataforma-y-lenguaje.md).

### No infiere intención

Un cambio privilegiado sin aprobación puede ser un ataque en curso o un
operador saltándose el proceso un viernes por la tarde. La regla dice **qué
pasó**; decidir cuál de las dos cosas es trabajo humano, y por eso todo
incidente trae runbook y no botón.

### No ejecuta la respuesta

No firma, no pausa, no rota claves. Aunque la arquitectura on-chain lo
permitiera, el producto no custodia el material necesario para hacerlo — y esa
ausencia es la propiedad de seguridad central.

## Cobertura por superficie

| Superficie | Cobertura | Comentario |
|---|---|---|
| Plano de control (admin, proxy, upgrade, timelock) | **Alta** | Es el foco del producto |
| Dependencias externas (oráculos, puentes) | **Media-alta** | Depende de lo declarado |
| Cadena de suministro de software | **Media** | Fijación y procedencia, no análisis del código |
| Eventos on-chain | **Media** | Requiere adaptador que entregue hechos |
| Integridad del observador | **Alta** | Tratada como incidente, no como aviso |
| Semántica del contrato | **Ninguna** | Fuera de alcance por diseño |
| Capa económica | **Ninguna** | Fuera de alcance por diseño |
| Endpoint del operador | **Ninguna** | Cubierto por otra edición de la familia |

## Cómo se complementa con el resto de la familia

Un incidente real rara vez vive en una sola superficie:

- **Blockchain Security** te dice que un rol crítico está en una EOA.
- **[Windows Inspector](https://github.com/vladimiracunadev-create/rootcause-windows-inspector)**
  o **macOS Inspector** te dicen si la máquina desde la que se firma está limpia.
- **[Web Inspector](https://github.com/vladimiracunadev-create/rootcause-web-inspector)**
  te dice si el navegador desde el que se aprueba tiene una extensión que puede
  leerlo todo.
- **[Bitcoin Defense](https://github.com/vladimiracunadev-create/rootcause-bitcoin-defense)**
  cubre el dominio UTXO, que este producto no toca.

Ver [`FAMILIA_ROOTCAUSE.md`](FAMILIA_ROOTCAUSE.md).

## Especificación exacta

Umbrales, severidades, evidencia y remediación de cada regla:
[`HEURISTICAS.md`](HEURISTICAS.md).
