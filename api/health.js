module.exports = async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({
    ok: true,
    service: 'hyperions-web-test',
    now: new Date().toISOString()
  });
};
