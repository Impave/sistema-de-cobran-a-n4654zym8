migrate(
  (app) => {
    let user
    try {
      user = app.findAuthRecordByEmail('_pb_users_auth_', 'daniel@impave.com.br')
    } catch (_) {
      return // usuário ainda não existe
    }

    const clientsCol = app.findCollectionByNameOrId('clients')
    const chargesCol = app.findCollectionByNameOrId('charges')

    const sampleClients = [
      {
        name: 'Maria Oliveira',
        email: 'maria.oliveira@email.com',
        document: '12345678909',
        phone: '11987654321',
        address: 'Rua das Flores, 120',
        city: 'São Paulo',
        state: 'SP',
      },
      {
        name: 'João Santos',
        email: 'joao.santos@email.com',
        document: '98765432100',
        phone: '21976543210',
        address: 'Av. Atlântica, 450',
        city: 'Rio de Janeiro',
        state: 'RJ',
      },
      {
        name: 'Empresa Tech Soluções Ltda',
        email: 'contato@techsolucoes.com.br',
        document: '12345678000195',
        phone: '3132221100',
        address: 'Av. do Contorno, 8000, Sala 402',
        city: 'Belo Horizonte',
        state: 'MG',
      },
      {
        name: 'Ana Paula Souza',
        email: 'anapaula.souza@email.com',
        document: '34567891234',
        phone: '41998877665',
        address: 'Rua XV de Novembro, 230',
        city: 'Curitiba',
        state: 'PR',
      },
    ]

    const clientRecords = {}

    for (let i = 0; i < sampleClients.length; i++) {
      const c = sampleClients[i]
      let clientRec
      try {
        clientRec = app.findFirstRecordByData('clients', 'email', c.email)
      } catch (_) {
        clientRec = new Record(clientsCol)
        clientRec.set('owner', user.id)
        clientRec.set('name', c.name)
        clientRec.set('email', c.email)
        clientRec.set('document', c.document)
        clientRec.set('phone', c.phone)
        clientRec.set('address', c.address)
        clientRec.set('city', c.city)
        clientRec.set('state', c.state)
        app.save(clientRec)
      }
      clientRecords[c.name] = clientRec
    }

    // Datas relativas
    const now = new Date()
    const formatIsoDate = (d) => {
      return d.toISOString().replace('T', ' ').replace('Z', '')
    }

    const addDays = (days) => {
      const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
      return formatIsoDate(d)
    }

    const subDays = (days) => {
      const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      return formatIsoDate(d)
    }

    const sampleCharges = [
      {
        clientName: 'Maria Oliveira',
        description: 'Mensalidade de março',
        number: 'COB-100234',
        amount: 450.0,
        due_date: addDays(3),
        paid_at: null,
        status: 'pending',
      },
      {
        clientName: 'João Santos',
        description: 'Consultoria financeira inicial',
        number: 'COB-100235',
        amount: 1200.5,
        due_date: addDays(10),
        paid_at: null,
        status: 'pending',
      },
      {
        clientName: 'Empresa Tech Soluções Ltda',
        description: 'Serviço de manutenção de servidores',
        number: 'COB-100236',
        amount: 3450.0,
        due_date: addDays(25),
        paid_at: null,
        status: 'pending',
      },
      {
        clientName: 'Ana Paula Souza',
        description: 'Nota fiscal 1234 - Licença de software',
        number: 'COB-100237',
        amount: 890.0,
        due_date: subDays(15),
        paid_at: subDays(16),
        status: 'paid',
      },
      {
        clientName: 'Maria Oliveira',
        description: 'Taxa de adesão anual',
        number: 'COB-100238',
        amount: 350.0,
        due_date: subDays(20),
        paid_at: subDays(21),
        status: 'paid',
      },
      {
        clientName: 'Empresa Tech Soluções Ltda',
        description: 'Desenvolvimento de módulo customizado',
        number: 'COB-100239',
        amount: 2800.0,
        due_date: subDays(5),
        paid_at: null,
        status: 'overdue',
      },
      {
        clientName: 'João Santos',
        description: 'Honorários advocatícios mensais',
        number: 'COB-100240',
        amount: 650.0,
        due_date: subDays(12),
        paid_at: null,
        status: 'overdue',
      },
      {
        clientName: 'Ana Paula Souza',
        description: 'Serviço cancelado - Treinamento',
        number: 'COB-100241',
        amount: 500.0,
        due_date: subDays(2),
        paid_at: null,
        status: 'cancelled',
      },
    ]

    for (let j = 0; j < sampleCharges.length; j++) {
      const sc = sampleCharges[j]
      let chargeRec
      try {
        chargeRec = app.findFirstRecordByData('charges', 'number', sc.number)
      } catch (_) {
        const client = clientRecords[sc.clientName]
        if (!client) continue

        chargeRec = new Record(chargesCol)
        chargeRec.set('owner', user.id)
        chargeRec.set('client', client.id)
        chargeRec.set('description', sc.description)
        chargeRec.set('number', sc.number)
        chargeRec.set('amount', sc.amount)
        chargeRec.set('due_date', sc.due_date)
        if (sc.paid_at) {
          chargeRec.set('paid_at', sc.paid_at)
        }
        chargeRec.set('status', sc.status)
        app.save(chargeRec)
      }
    }
  },
  (app) => {
    // down: opcional
  },
)
