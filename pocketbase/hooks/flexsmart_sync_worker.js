// Worker da integração FlexSmart: roda a cada minuto, pega a sincronização
// pendente mais antiga, faz login no ERP, consulta /Cliente/getAll e grava
// o resultado (amostra + contagem) no registro de flex_sync.
// A importação para a collection clients acontece numa etapa posterior,
// após confirmar o formato dos registros do ERP.
cronAdd('flexsmart-sync-worker', '* * * * *', () => {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString().replace('T', ' ')
  const pendentes = $app.findRecordsByFilter(
    'flex_sync',
    "status = 'pending' || (status = 'running' && started_at < {:cutoff})",
    'created',
    1,
    0,
    { cutoff: cutoff },
  )
  if (pendentes.length === 0) return
  const job = pendentes[0]
  if (job.getString('status') === 'running') {
    job.set('status', 'error')
    job.set('error', 'Cancelada: ERP nao respondeu em 15 min')
    job.set('finished_at', new DateTime().string())
    $app.save(job)
    return
  }

  job.set('status', 'running')
  job.set('started_at', new DateTime().string())
  $app.save(job)

  const base = ($secrets.get('FLEXSMART_BASE_URL') || '').replace(/\/+$/, '')
  try {
    // 1) login -> access_token
    const loginRes = $http.send({
      url: base + '/login?Content-Type=application/json',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: $secrets.get('FLEXSMART_USERNAME'),
        password: $secrets.get('FLEXSMART_PASSWORD'),
      }),
      timeout: 30,
    })
    if (loginRes.statusCode < 200 || loginRes.statusCode >= 300) {
      throw new Error('login FlexSmart retornou HTTP ' + loginRes.statusCode)
    }
    const token = loginRes.json && loginRes.json.access_token
    if (!token) throw new Error('login FlexSmart sem access_token')

    // 2) lista de clientes (pode demorar vários minutos)
    const cliRes = $http.send({
      url: base + '/Cliente/getAll',
      method: 'GET',
      headers: { AuthToken: token },
      timeout: 600,
    })
    if (cliRes.statusCode < 200 || cliRes.statusCode >= 300) {
      throw new Error('Cliente/getAll retornou HTTP ' + cliRes.statusCode)
    }

    // 3) identifica a lista de clientes na resposta (array raiz ou em alguma propriedade)
    const dados = cliRes.json
    let lista = Array.isArray(dados) ? dados : null
    let chaves = null
    if (!lista && dados && typeof dados === 'object') {
      chaves = Object.keys(dados)
      for (const k of chaves) {
        if (Array.isArray(dados[k])) {
          lista = dados[k]
          break
        }
      }
    }

    const amostra = lista ? lista.slice(0, 20) : null
    job.set('count', lista ? lista.length : 0)
    if (amostra) {
      job.set('sample', JSON.stringify(amostra))
    } else if (dados && typeof dados === 'object') {
      job.set(
        'sample',
        JSON.stringify({ chaves_raiz: chaves, preview: JSON.stringify(dados).slice(0, 3000) }),
      )
    }
    job.set('status', 'done')
    job.set('finished_at', new DateTime().string())
    $app.save(job)
    $app.logger().info('flexsmart sync concluida', 'count', lista ? lista.length : 0)
  } catch (err) {
    job.set('status', 'error')
    job.set('error', String(err).slice(0, 1900))
    job.set('finished_at', new DateTime().string())
    $app.save(job)
    $app.logger().error('flexsmart sync falhou', 'erro', String(err))
  }
})
