migrate(
  (app) => {
    try {
      const username =
        $os.getenv('FLEXSMART_USERNAME') ||
        ($secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '')
      const password =
        $os.getenv('FLEXSMART_PASSWORD') ||
        ($secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '')

      const rawBase =
        $os.getenv('FLEXSMART_BASE_URL') ||
        ($secrets.has('FLEXSMART_BASE_URL') ? $secrets.get('FLEXSMART_BASE_URL') : '') ||
        'https://api.impave.com.br:8443'
      const base = rawBase.replace(/\/+$/, '')

      console.log('[Diagnostic-0034] Testando login FlexSmart...')
      const loginRes = $http.send({
        url: base + '/login?Content-Type=application/json',
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

      const token = pj && pj.access_token ? pj.access_token : ''
      if (!token) {
        console.log('[Diagnostic-0034] Login falhou, status:', loginRes.statusCode)
        return
      }

      console.log('[Diagnostic-0034] Login OK! Testando GET /Cliente/getByDtAtz?data=26/10/2026...')

      // Teste 1: data 26/10/2026
      const t0 = Date.now()
      const res1 = $http.send({
        url: base + '/Cliente/getByDtAtz?data=26/10/2026',
        method: 'GET',
        headers: {
          AuthToken: token,
          Accept: 'application/json',
        },
        timeout: 60,
      })
      const t1 = Date.now()

      const rawLen1 = res1.raw ? res1.raw.length : 0
      const isArr1 = Array.isArray(res1.json)
      let count1 = isArr1 ? res1.json.length : 0
      let sample1 = null
      let keys1 = []

      if (isArr1 && count1 > 0) {
        sample1 = res1.json[0]
      } else if (res1.json && typeof res1.json === 'object') {
        keys1 = Object.keys(res1.json)
        sample1 = res1.json
      } else if (res1.raw) {
        try {
          const parsed = JSON.parse(res1.raw)
          if (Array.isArray(parsed)) {
            count1 = parsed.length
            sample1 = parsed[0]
          } else if (typeof parsed === 'object') {
            keys1 = Object.keys(parsed)
            sample1 = parsed
          }
        } catch (_) {}
      }

      console.log(
        '[Diagnostic-0034 RESULT 26/10/2026] HTTP=' +
          res1.statusCode +
          ' ms=' +
          (t1 - t0) +
          ' bytes=' +
          rawLen1 +
          ' isArray=' +
          isArr1 +
          ' count=' +
          count1 +
          ' keys=' +
          JSON.stringify(keys1) +
          ' snippet=' +
          String(res1.raw || '').slice(0, 300),
      )

      // Teste 2: data 01/01/2000 (para verificar formato quando nenhum ou quase nenhum cliente retornado)
      console.log('[Diagnostic-0034] Testando GET /Cliente/getByDtAtz?data=01/01/2000...')
      const t2 = Date.now()
      const res2 = $http.send({
        url: base + '/Cliente/getByDtAtz?data=01/01/2000',
        method: 'GET',
        headers: {
          AuthToken: token,
          Accept: 'application/json',
        },
        timeout: 60,
      })
      const t3 = Date.now()

      const rawLen2 = res2.raw ? res2.raw.length : 0
      const isArr2 = Array.isArray(res2.json)
      let count2 = isArr2 ? res2.json.length : 0
      console.log(
        '[Diagnostic-0034 RESULT 01/01/2000] HTTP=' +
          res2.statusCode +
          ' ms=' +
          (t3 - t2) +
          ' bytes=' +
          rawLen2 +
          ' isArray=' +
          isArr2 +
          ' count=' +
          count2 +
          ' snippet=' +
          String(res2.raw || '').slice(0, 300),
      )

      // Salva em flex_sync mais recente para permitir leitura estruturada
      try {
        const rec = app.findFirstRecordByFilter('flex_sync', '1=1', '-created')
        const diagInfo = {
          date26102026: {
            status: res1.statusCode,
            bytes: rawLen1,
            ms: t1 - t0,
            isArray: isArr1,
            count: count1,
            keys: keys1,
            sample: sample1,
            rawSnippet: String(res1.raw || '').slice(0, 400),
          },
          date01012000: {
            status: res2.statusCode,
            bytes: rawLen2,
            ms: t3 - t2,
            isArray: isArr2,
            count: count2,
            rawSnippet: String(res2.raw || '').slice(0, 400),
          },
        }
        rec.set('error', 'DIAGNOSTIC_GETBYDTATZ: ' + JSON.stringify(diagInfo).slice(0, 1900))
        if (sample1) {
          rec.set('sample', sample1)
        }
        app.save(rec)
      } catch (saveErr) {
        console.log('[Diagnostic-0034] Erro ao salvar log no registro:', String(saveErr))
      }
    } catch (err) {
      console.log('[Diagnostic-0034 FATAL]', String(err))
    }
  },
  (app) => {},
)
