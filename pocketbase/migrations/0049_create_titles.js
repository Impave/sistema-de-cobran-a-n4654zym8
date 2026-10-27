migrate(
  (app) => {
    // Idempotente: se já existir, não recria
    try {
      if (app.findCollectionByNameOrId('titles')) {
        return
      }
    } catch (_) {}

    const collection = new Collection({
      name: 'titles',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'menu', type: 'bool' },
        { name: 'filial', type: 'text' },
        { name: 'conta', type: 'text' },
        { name: 'cliente_fornecedor', type: 'text' },
        { name: 'numero', type: 'text' },
        { name: 'parcela', type: 'text' },
        { name: 'emissao', type: 'date' },
        { name: 'vencimento', type: 'date' },
        { name: 'pagamento', type: 'date' },
        { name: 'atraso', type: 'number' },
        { name: 'valor_nominal', type: 'number' },
        { name: 'saldo_atual', type: 'number' },
        { name: 'juros_pago', type: 'number' },
        { name: 'juros_previsto', type: 'number' },
        { name: 'saldo_juros', type: 'number' },
        { name: 'multa', type: 'number' },
        { name: 'saldo_juros_multa', type: 'number' },
        { name: 'desconto', type: 'number' },
        { name: 'forma_pagamento', type: 'text' },
        { name: 'bordero', type: 'number' },
        { name: 'nosso_numero', type: 'number' },
        { name: 'nosso_numero_formatado', type: 'text' },
        { name: 'modelo_dcto', type: 'text' },
        { name: 'portador', type: 'text' },
        { name: 'serie', type: 'text' },
        { name: 'impresso', type: 'text' },
        { name: 'vendedor', type: 'text' },
        { name: 'hora_impressao_boleto', type: 'text' },
        { name: 'observacao', type: 'text' },
        { name: 'condicao_pgto', type: 'text' },
        { name: 'outras_despesas', type: 'number' },
        { name: 'situacao', type: 'text' },
        { name: 'dt_reparcelamento', type: 'date' },
        { name: 'dt_acerto', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_titles_numero ON titles (numero)',
        'CREATE INDEX idx_titles_cliente_fornecedor ON titles (cliente_fornecedor)',
        'CREATE INDEX idx_titles_vencimento ON titles (vencimento)',
        'CREATE INDEX idx_titles_situacao ON titles (situacao)',
        'CREATE INDEX idx_titles_nosso_numero_formatado ON titles (nosso_numero_formatado)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('titles')
      app.delete(collection)
    } catch (_) {}
  },
)
