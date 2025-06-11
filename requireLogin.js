function requireLogin(req, res, next) {
  if (req.session && req.session.user && req.session.user.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized access' });
  }
}

module.exports = requireLogin;

