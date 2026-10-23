migrate(
  (app) => {
    try {
      const rec = app.findRecordById('flex_sync', 'ih1sm5o2a0n2fo1')
      rec.set('error', 'DUMP_RAW_PARSED')
      app.save(rec)
    } catch (_) {}
  },
  (app) => {},
)
