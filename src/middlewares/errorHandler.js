const errorHandler = (err, req, res, next) => {
  console.error('❌ Erro:', err);

  res.status(500).json({
    success: false,
    message: 'Erro interno no servidor',
    error: err.message,
  });
};

module.exports = { errorHandler };