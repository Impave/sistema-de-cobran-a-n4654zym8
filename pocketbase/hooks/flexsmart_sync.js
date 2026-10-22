// Inicia sincronização assíncrona dos clientes do ERP FlexSmart.
// POST /backend/v1/flexsmart/sync (requer usuário autenticado do app).
// Cria um registro em flex_sync com status "pending"; o worker
// (flexsmart_sync_worker.js, cron) processa e grava o resultado.
routerAdd(
  'POST',
  '/backend/v1/flexsmart/sync',
  (e) => {
    // evita sincronização duplicada para o mesmo usuário
    const abertas = $app.findRecordsByFilter(
      'flex_sync',
      "owner = {:owner} && (status = 'pending' || status = 'running')",
      '-created',
      1,
      0,
      { owner: e.auth.id },
    )
    if (abertas.length > 0) {
      return e.json(409, {
        error: 'Já existe uma sincronização em andamento',
        id: abertas[0].id,
        status: abertas[0].getString('status'),
      })
    }

    const col = $app.findCollectionByNameOrId('flex_sync')
    const rec = new Record(col)
    rec.set('owner', e.auth.id)
    rec.set('status', 'pending')
    rec.set('started_at', new DateTime().string())
    rec.set('count', 0)
    rec.set('imported', 0)
    $app.save(rec)

    return e.json(200, { id: rec.id, status: 'pending' })
  },
  $apis.requireAuth(),
)
