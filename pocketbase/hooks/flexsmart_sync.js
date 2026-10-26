const msg = 'test'
routerAdd('GET', '/test-static-analysis', (e) => {
  try {
  } catch (err) {
    const msg = 'err'
    console.log(msg)
  }
  return e.json(200, { ok: true })
})
