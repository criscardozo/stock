# Reglas de trabajo

Las reglas que Cristian fijó para este proyecto, juntas y en un solo lado.

`CLAUDE.md` sigue siendo lo que un agente carga solo, y es la fuente de verdad
de las restricciones **técnicas** (esquema, unidades, listeners). Este archivo
recoge además las de **proceso** —las que no viven en el código— y explica el
*por qué* de cada una, que es lo que hace que se puedan aplicar a un caso nuevo
en vez de repetirlas de memoria.

---

## 1. Nada se publica sin que se pida

- **Commitear: libre.** Terminar el trabajo y dejarlo commiteado es lo esperado.
- **`git push`, `firebase deploy` e instalar en el iPhone: sólo cuando se pide,
  en ese mensaje.** Un permiso dado ayer no vale hoy.
- Al terminar, decir qué quedó sin pushear y qué implicaría publicarlo.

**Por qué:** cada push a `master` deploya la web a producción por Vercel, y la
app la usan dos personas de verdad.

**Dos excepciones, y son para avisar fuerte, no para decidir solo:** cuando algo
ya vivo en producción está *roto* por un cambio sin deployar (típicamente las
reglas de Firestore), y cuando deployar es el único modo de completar lo que se
acaba de pedir.

## 2. Cero gastos, sin excepciones

- **Firebase Spark.** Nunca Cloud Functions: exigen Blaze.
- **Vercel Hobby.** Nada de servicios pagos.
- **GitHub Actions no puede costar nada.** Los runners de macOS facturan a 10x,
  así que **no hay pipeline de iOS** — se compila y testea local antes de cada
  cambio. Todo lo que corre en Actions es Ubuntu.
- Las APIs de terceros se usan sólo si son gratis y sin API key (hoy: Open Food
  Facts), y siempre como **comodidad**, nunca como dependencia: si no responde,
  el flujo tiene que seguir funcionando.
- Si algo sólo se resuelve pagando, se dice y se propone la alternativa gratis;
  no se contrata nada.

## 3. Idiomas

- **Conversación:** español rioplatense.
- **Código, comentarios y nombres:** inglés.
- **La UI: sólo español.** Sin next-intl ni String Catalogs — fue una decisión
  explícita (el contenido real, los nombres de los ítems y las recetas, lo
  escribe el usuario en español igual). Si algún día hace falta inglés, se
  agrega entonces.
- **Mensajes de commit:** inglés australiano, en formato **conventional
  commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`,
  `build:`, `ci:`, con scope opcional entre paréntesis).
- **Nunca** el trailer `Co-Authored-By: Claude` (ni ninguna coautoría). Es una
  preferencia global y pisa cualquier default del harness.

## 4. Los datos, antes que la pantalla

- **Las cantidades son enteros** en la unidad del ítem (`unit`, `g`, `ml`).
  Jamás floats: `1,2 kg` es formateo de presentación sobre `1200 g`. Lo que no
  se cuenta en enteros usa el modo `level`, no un decimal.
- **Las fechas son `"YYYY-MM-DD"` en la timezone del hogar**, nunca la del
  dispositivo ni buckets UTC.
- **Lo derivable no se guarda.** La lista de compras y el estado de un ítem
  (`out`/`low`/`expiring`) son funciones de datos que el cliente ya tiene en
  cache. Persistirlos obligaría a reescribirlos para mantenerlos sincronizados
  con algo que ya los determina.
- **Las reglas de Firestore son la única frontera de seguridad.** Cualquier
  chequeo en el cliente es cosmético.
- **Sin backend propio.** Los dos clientes hablan directo con Firebase.

## 5. Firestore: el free tier es parte del diseño

- **Se escucha lo acotado, se pagina lo que crece.** El catálogo del hogar
  (~150 docs) se puede escuchar entero; `moves` crece para siempre y va con
  `getDocs` + `limit()`, nunca con listener. En React, siempre devolver el
  unsubscribe desde el `useEffect`.
- Una página que se *visita* usa lectura única; una pantalla en la que se *vive*
  usa listener.
- Persistencia offline en los dos clientes. El súper es exactamente donde no
  hay señal.
- **No esperar la promesa de una escritura para mover la UI.** Firestore sólo la
  resuelve cuando el servidor confirma: `await` congela el formulario mientras
  no hay señal, aunque el dato ya esté guardado local. Escribir y seguir.
- Lo que toca varios documentos (cocinar, reponer) va en un `writeBatch`.

## 6. Código

- **Sin librerías de gráficos.** Las barras son divs y las líneas SVG a mano.
- **Lógica duplicada entre plataformas ⇒ vectores compartidos.** Si algo se
  implementa dos veces (aritmética de períodos, derivación de la lista de
  compras), los casos viven en `shared/*-vectors.json` y **las dos
  implementaciones los corren**. Se cambia primero el vector.
- Comentar el **por qué**, no el qué; sobre todo cuando la decisión fue contra
  la opción obvia.
- Sin subagentes ni workflows salvo pedido explícito.

## 7. Verificar, no suponer

- Un cambio visual se **mide o se mira** (captura, overflow en píxeles), no se
  deduce del CSS.
- Un test de regresión vale lo que atrapa: **reintroducir el bug** y ver el test
  fallar antes de darlo por bueno.
- Si algo no se pudo verificar, **decirlo** en el reporte. "Compila" no es
  "funciona".
- Lo que dice un paso de CI en verde no reemplaza mirar el artefacto.

## 8. Secretos

- Las claves de service account **nunca** entran al repo (gitignored) y cada
  una tiene su propio alcance, para poder revocar una sin romper el resto.
- La config pública de Firebase **es** pública: la seguridad son las reglas.

## 9. La máquina de Cristian

- **No tocar el stack de Docker propio (`ecko`/`holocron`, puerto 8080).** El
  emulador de Firestore usa ese mismo puerto: antes de matar algo ahí, verificar
  qué proceso es.
- No dejar emuladores ni servidores de dev corriendo al terminar.

---

## Referencias

| Tema | Dónde |
|---|---|
| Especificación del producto | [`README.md`](../README.md) |
| Restricciones técnicas que carga el agente | [`CLAUDE.md`](../CLAUDE.md) |
| Decisiones de arquitectura y su porqué | [`docs/PLAN.md`](PLAN.md) |
| Esquema de Firestore (fuente de verdad) | `shared/schema.md` (Fase 0) |
| Puesta a punto manual (consola, dominio) | [`docs/setup.md`](setup.md) |
