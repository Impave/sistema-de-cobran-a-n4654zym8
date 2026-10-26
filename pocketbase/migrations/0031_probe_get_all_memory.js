migrate(
  (app) => {
    try {
      const username =
        $os.getenv('FLEXSMART_USERNAME') ||
        ($secrets.has('FLEXSMART_USERNAME') ? $secrets.get('FLEXSMART_USERNAME') : '')
      const password =
        $os.getenv('FLEXSMART_PASSWORD') ||
        ($secrets.has('FLEXSMART_PASSWORD') ? $secrets.get('FLEXSMART_PASSWORD') : '')

      const loginRes = $http.send({
        url: 'https://api.impave.com.br:8443/login?Content-Type=application/json',
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
      if (!token) return

      // Testar com timeout pequeno e medir o que acontece
      const t0 = Date.now()
      try {
        const r = $http.send({
          url: 'https://api.impave.com.br:8443/Cliente/getAll',
          method: 'GET',
          headers: { AuthToken: token, Accept: 'application/json' },
          timeout: 45, // 45 segundos
        })
        const t1 = Date.now()
        const rawLen = r.raw ? r.raw.length : 0
        const jsonLen = Array.isArray(r.json) ? r.json.length : r.json ? 'obj' : 'null'
        console.log(
          '[PROBE-RESULT] Sucesso! tempo=' +
            (t1 - t0) +
            'ms, status=' +
            r.statusCode +
            ', rawLen=' +
            rawLen +
            ', jsonLen=' +
            jsonLen,
        )

        const rec = app.findFirstRecordByFilter('flex_sync', '1=1', '-created')
        rec.set('error', 'PROBE_OK: bytes=' + rawLen + ', count=' + jsonLen + ', ms=' + (t1 - t0))
        app.save(rec)
      } catch (eProbe) {
        const t1 = Date.now()
        console.log('[PROBE-ERR] Falha após ' + (t1 - t0) + 'ms: ' + String(eProbe))
        const rec = app.findFirstRecordByFilter('flex_sync', '1=1', '-created')
        rec.set('error', 'PROBE_ERR: ' + String(eProbe) + ' (' + (t1 - t0) + 'ms)')
        app.save(rec)
      }
    } catch (err) {
      console.log('[PROBE-FATAL]', String(err))
    }
  },
  (app) => {},
)
