migrate(
  (app) => {
    const clients = app.findCollectionByNameOrId('clients')

    // 1. Modificar campo cnpj_cpf para passar a ser obrigatório
    const cnpjCpfField = clients.fields.getByName('cnpj_cpf')
    if (cnpjCpfField) {
      cnpjCpfField.required = true
    } else {
      clients.fields.add(
        new TextField({
          name: 'cnpj_cpf',
          required: true,
        }),
      )
    }

    // 2. Modificar campo nome_cliente para deixar de ser obrigatório e remover min
    const nomeClienteField = clients.fields.getByName('nome_cliente')
    if (nomeClienteField) {
      nomeClienteField.required = false
      nomeClienteField.min = 0
    } else {
      clients.fields.add(
        new TextField({
          name: 'nome_cliente',
          required: false,
          min: 0,
        }),
      )
    }

    app.save(clients)
  },
  (app) => {
    const clients = app.findCollectionByNameOrId('clients')

    const cnpjCpfField = clients.fields.getByName('cnpj_cpf')
    if (cnpjCpfField) {
      cnpjCpfField.required = false
    }

    const nomeClienteField = clients.fields.getByName('nome_cliente')
    if (nomeClienteField) {
      nomeClienteField.required = true
      nomeClienteField.min = 2
    }

    app.save(clients)
  },
)
