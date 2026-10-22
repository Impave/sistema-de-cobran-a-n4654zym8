// Diagnóstico FlexSmart: testa variações de chamada ao /Cliente/getAll
// com timeouts curtos e devolve o resultado de cada tentativa.
// GET /backend/v1/flexsmart/probe (requer usuário autenticado do app).
routerAdd(
  'GET',
  '/backend/v1/flexsmart/probe',
  (e) => {
    const base = ($secrets.get('FLEXSMART_BASE_URL') || '').replace(/\/+$/, '')
    const out = []

    // login -> access_token
    const t0 = Date.now()
    let token = ''
    try {
      const r = $http.send({
        url: base + '/login?Content-Type=application/json',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: $secrets.get('FLEXSMART_USERNAME'),
          password: $secrets.get('FLEXSMART_PASSWORD'),
        }),
        timeout: 8,
      })
      token = (r.json && r.json.access_token) || ''
      out.push({
        passo: 'login',
        status: r.statusCode,
        ms: Date.now() - t0,
        corpo: JSON.stringify(r.json || {}).slice(0, 200),
      })
    } catch (err) {
      out.push({ passo: 'login', erro: String(err).slice(0, 200), ms: Date.now() - t0 })
    }
    if (!token) return e.json(200, { resultados: out })

    const testes = [
      {
        nome: 'GET AuthToken (com User-Agent)',
        opts: {
          url: base + '/Cliente/getAll',
          method: 'GET',
          headers: { AuthToken: token, 'User-Agent': 'CobrancaPro/1.0' },
          timeout: 12,
        },
      },
      {
        nome: 'GET com paginação (?page=1&pageSize=10)',
        opts: {
          url: base + '/Cliente/getAll?page=1&pageSize=10',
          method: 'GET',
          headers: { AuthToken: token },
          timeout: 12,
        },
      },
      {
        nome: 'POST AuthToken',
        opts: {
          url: base + '/Cliente/getAll',
          method: 'POST',
          headers: { AuthToken: token, 'Content-Type': 'application/json' },
          body: '{}',
          timeout: 12,
        },
      },
    ]
    for (const t of testes) {
      const s = Date.now()
      try {
        const r = $http.send(t.opts)
        const corpo = r.json
          ? JSON.stringify(r.json).slice(0, 300)
          : new TextDecoder().decode(r.body).slice(0, 300)
        out.push({ passo: t.nome, status: r.statusCode, ms: Date.now() - s, corpo: corpo })
        if (r.statusCode >= 200 && r.statusCode < 300) break
      } catch (err) {
        out.push({ passo: t.nome, erro: String(err).slice(0, 200), ms: Date.now() - s })
      }
    }
    return e.json(200, { resultados: out })
  },
  $apis.requireAuth(),
)
