migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter(
        'charges',
        "number = 'DIAG-01' || number = 'DIAG-02'",
        '',
        10,
        0,
      )
      for (const rec of records) {
        app.delete(rec)
      }
    } catch (_) {}
  },
  (app) => {},
)
