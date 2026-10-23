migrate(
  (app) => {
    try {
      console.log('[MIGRATION-TEST] Testando chamada ao ERP FlexSmart /Cliente/getAll...')
      const username =
        $os.getenv('FLEXSMART_USERNAME') ||
        ($secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '')
      const password =
        $os.getenv('FLEXSMART_PASSWORD') ||
        ($secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '')

      const loginUrl = 'https://api.impave.com.br:8443/login?Content-Type=application/json'
      const loginRes = $http.send({
        url: loginUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password }),
        timeout: 30,
      })

      let pj = loginRes.json
      if (!pj && loginRes.raw) {
        try {
          pj = JSON.parse(loginRes.raw)
        } catch (_) {}
      }

      if (!pj || !pj.access_token) {
        console.log('[MIGRATION-TEST] Login falhou: ' + (loginRes.raw || ''))
        return
      }

      const token = pj.access_token
      console.log('[MIGRATION-TEST] Login OK! Token: ' + token.slice(0, 8) + '...')

      const getAllRes = $http.send({
        url: 'https://api.impave.com.br:8443/Cliente/getAll',
        method: 'GET',
        headers: {
          AuthToken: token,
          Accept: 'application/json',
        },
        timeout: 60,
      })

      console.log('[MIGRATION-TEST] /Cliente/getAll Status: ' + getAllRes.statusCode)

      let dados = getAllRes.json
      if (!dados && getAllRes.raw) {
        try {
          dados = JSON.parse(getAllRes.raw)
        } catch (_) {}
      }

      const isArr = Array.isArray(dados)
      const count = isArr ? dados.length : dados ? Object.keys(dados).length : 0
      console.log(
        '[MIGRATION-TEST] /Cliente/getAll Resultado: isArray=' + isArr + ', total=' + count,
      )

      if (isArr && dados.length > 0) {
        const item1 = dados[0]
        console.log('[MIGRATION-TEST] Chaves 1º cliente: [' + Object.keys(item1).join(', ') + ']')
        console.log(
          '[MIGRATION-TEST] Exemplo 1º cliente: cdCliente=' +
            item1.cdCliente +
            ', nmCliente=' +
            (item1.nmCliente || item1.nmFantasia) +
            ', cnpjCpf=' +
            item1.cnpjCpf,
        )
      } else if (!isArr && dados) {
        console.log('[MIGRATION-TEST] Objeto retornado: ' + String(getAllRes.raw).slice(0, 300))
      }
    } catch (err) {
      console.log('[MIGRATION-TEST] Erro durante o teste: ' + String(err))
    }
  },
  (app) => {},
)
