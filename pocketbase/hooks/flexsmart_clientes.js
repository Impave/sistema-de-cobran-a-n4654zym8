// Integração ERP FlexSmart: login + lista de clientes
// GET /backend/v1/flexsmart/clientes  (requer usuário autenticado do app)
routerAdd(
  'GET',
  '/backend/v1/flexsmart/clientes',
  (e) => {
    const base = ($secrets.get('FLEXSMART_BASE_URL') || '').replace(/\/+$/, '')
    if (!base) return e.internalServerError('FLEXSMART_BASE_URL não configurado')

    // 1) Login no FlexSmart -> access_token
    let loginRes
    try {
      loginRes = $http.send({
        url: base + '/login?Content-Type=application/json',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: $secrets.get('FLEXSMART_USERNAME'),
          password: $secrets.get('FLEXSMART_PASSWORD'),
        }),
        timeout: 30,
      })
    } catch (err) {
      $app.logger().error('flexsmart: falha de transporte no login', 'erro', String(err))
      return e.badRequestError('FlexSmart inacessível: ' + String(err))
    }
    if (loginRes.statusCode < 200 || loginRes.statusCode >= 300) {
      $app.logger().error('flexsmart: login recusado', 'status', loginRes.statusCode)
      return e.badRequestError('Login FlexSmart falhou (HTTP ' + loginRes.statusCode + ')')
    }
    const token = loginRes.json && loginRes.json.access_token
    if (!token) return e.badRequestError('Resposta do login sem access_token')

    // 2) Lista de clientes com AuthToken
    let cliRes
    try {
      cliRes = $http.send({
        url: base + '/Cliente/getAll',
        method: 'GET',
        headers: { AuthToken: token },
        timeout: 60,
      })
    } catch (err) {
      $app.logger().error('flexsmart: falha de transporte no getAll', 'erro', String(err))
      return e.badRequestError('FlexSmart inacessível: ' + String(err))
    }
    if (cliRes.statusCode < 200 || cliRes.statusCode >= 300) {
      $app.logger().error('flexsmart: getAll falhou', 'status', cliRes.statusCode)
      return e.badRequestError('Consulta de clientes falhou (HTTP ' + cliRes.statusCode + ')')
    }
    return e.json(200, cliRes.json)
  },
  $apis.requireAuth(),
)
