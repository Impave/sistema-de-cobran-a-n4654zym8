// Worker da integração FlexSmart: roda a cada minuto, pega a sincronização
// pendente mais antiga, faz login no ERP, consulta /Cliente/getAll e importa
// os clientes para a collection clients (dono: conta daniel@impave.com.br).
// A chamada ao getAll pode demorar muitos minutos; o watchdog cancela
// jobs presos há mais de 30 minutos.
cronAdd('flexsmart-sync-worker', '* * * * *', () => {
  const cutoff = new DateTime(new Date(Date.now() - 30 * 60 * 1000).toISOString()).string()
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
    job.set('error', 'Cancelada: ERP nao respondeu em 30 min')
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

    // 2) lista de clientes (pode demorar muitos minutos)
    const cliRes = $http.send({
      url: base + '/Cliente/getAll',
      method: 'GET',
      headers: { AuthToken: token },
      timeout: 1500,
    })
    if (cliRes.statusCode < 200 || cliRes.statusCode >= 300) {
      throw new Error('Cliente/getAll retornou HTTP ' + cliRes.statusCode)
    }

    // 3) localiza a lista de clientes na resposta
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
    if (!lista) {
      throw new Error(
        'Resposta do getAll sem lista de clientes' +
          (chaves ? ' (chaves raiz: ' + chaves.join(',') + ')' : ''),
      )
    }

    job.set('count', lista.length)
    job.set('sample', JSON.stringify(lista.slice(0, 20)))
    $app.save(job)

    // 4) importação para clients
    const pick = (o, keys) => {
      for (const k of keys) {
        const v = o[k]
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
      }
      return ''
    }

    let donoId = job.getString('owner')
    try {
      const u = $app.findAuthRecordByEmail('users', 'daniel@impave.com.br')
      if (u) donoId = u.id
    } catch (_) {}

    const existentes = $app.findRecordsByFilter(
      'clients',
      'owner = {:owner}',
      '-created',
      20000,
      0,
      {
        owner: donoId,
      },
    )
    const vistos = {}
    for (const r of existentes) {
      const d = r.getString('document')
      if (d) vistos[d] = true
    }

    const col = $app.findCollectionByNameOrId('clients')
    let importados = 0
    let falhas = 0
    const total = Math.min(lista.length, 10000)
    for (let i = 0; i < total; i++) {
      const it = lista[i]
      if (!it || typeof it !== 'object') {
        falhas++
        continue
      }
      const doc = pick(it, [
        'cnpj',
        'cpf',
        'cnpjCpf',
        'cnpj_cpf',
        'cpf_cnpj',
        'cgccpf',
        'cgc',
        'documento',
        'doc',
        'nrCnpj',
        'nr_cnpj',
        'nrCpfCnpj',
      ])
      const email = pick(it, ['email', 'e_mail', 'dsEmail'])
      const nome0 = pick(it, [
        'nome',
        'razaoSocial',
        'razao_social',
        'name',
        'nomeCliente',
        'nome_fantasia',
        'fantasia',
        'descricao',
        'dsNome',
        'nmCliente',
      ])
      const chave = doc || email || nome0
      if (chave && vistos[chave]) continue

      let nome = nome0
      if (nome.length < 2) nome = 'Cliente ' + (doc || i + 1)

      const rec = new Record(col)
      rec.set('owner', donoId)
      rec.set('name', nome)
      if (email && email.indexOf('@') > 0) rec.set('email', email)
      if (doc) rec.set('document', doc)
      const fone = pick(it, [
        'telefone',
        'fone',
        'phone',
        'celular',
        'tel',
        'telefone1',
        'nrTelefone',
        'dsTelefone',
      ])
      if (fone) rec.set('phone', fone)
      const end = pick(it, [
        'endereco',
        'address',
        'logradouro',
        'rua',
        'dsEndereco',
        'nmLogradouro',
      ])
      if (end) rec.set('address', end)
      const cid = pick(it, ['cidade', 'city', 'municipio', 'dsCidade', 'nmCidade'])
      if (cid) rec.set('city', cid)
      const uf = pick(it, ['uf', 'estado', 'state', 'siglaUf', 'dsUf', 'sgUf'])
      if (uf) rec.set('state', uf)

      try {
        $app.save(rec)
        importados++
        if (chave) vistos[chave] = true
      } catch (e2) {
        falhas++
      }
    }

    job.set('imported', importados)
    job.set('status', 'done')
    job.set('finished_at', new DateTime().string())
    $app.save(job)
    $app
      .logger()
      .info(
        'flexsmart sync concluida',
        'count',
        lista.length,
        'importados',
        importados,
        'falhas',
        falhas,
      )
  } catch (err) {
    job.set('status', 'error')
    job.set('error', String(err).slice(0, 1900))
    job.set('finished_at', new DateTime().string())
    $app.save(job)
    $app.logger().error('flexsmart sync falhou', 'erro', String(err))
  }
})
