// Diagnóstico FlexSmart: testa variantes de chamada ao /Cliente/getAll
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
        chaves: r.json ? Object.keys(r.json).join(',') : '',
      })
    } catch (err) {
      out.push({ passo: 'login', erro: String(err).slice(0, 200), ms: Date.now() - t0 })
    }
    if (!token) return e.json(200, { resultados: out })

    const testes = [
      {
        nome: 'POST corpo {} + AuthToken',
        opts: {
          url: base + '/Cliente/getAll',
          method: 'POST',
          headers: { AuthToken: token, 'Content-Type': 'application/json' },
          body: '{}',
          timeout: 12,
        },
      },
      {
        nome: 'POST corpo {page:1,pageSize:10} + AuthToken',
        opts: {
          url: base + '/Cliente/getAll',
          method: 'POST',
          headers: { AuthToken: token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: 1, pageSize: 10 }),
          timeout: 12,
        },
      },
      {
        nome: 'POST corpo {} sem AuthToken',
        opts: {
          url: base + '/Cliente/getAll',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          timeout: 12,
        },
      },
    ]
    for (const t of testes) {
      const s = Date.now()
      try {
        const r = $http.send(t.opts)
        let corpo = ''
        if (r.json) {
          corpo = JSON.stringify(r.json).slice(0, 400)
        } else if (r.body && r.body.length) {
          const n = Math.min(r.body.length, 400)
          for (let i = 0; i < n; i++) corpo += String.fromCharCode(r.body[i])
        }
        out.push({
          passo: t.nome,
          status: r.statusCode,
          ms: Date.now() - s,
          tipo: r.json ? 'json' : 'texto',
          corpo: corpo,
        })
        if (r.statusCode >= 200 && r.statusCode < 300) break
      } catch (err) {
        out.push({ passo: t.nome, erro: String(err).slice(0, 200), ms: Date.now() - s })
      }
    }
    return e.json(200, { resultados: out })
  },
  $apis.requireAuth(),
)
