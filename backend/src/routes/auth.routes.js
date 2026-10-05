const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Registrazione (solo admin può creare nuovi utenti)
router.post('/register', authenticate, authController.register);

// Login
router.post('/login', authController.login);

// Refresh token
router.post('/refresh', authController.refreshToken);

// Logout
router.post('/logout', authenticate, authController.logout);

// Verifica token corrente
router.get('/me', authenticate, authController.getCurrentUser);

// Cambio password
router.post('/change-password', authenticate, authController.changePassword);

// Password dimenticata: il link per sceglierne una nuova, e la nuova password
router.post('/password-dimenticata', authController.passwordDimenticata);
router.post('/reimposta-password', authController.reimpostaPassword);

// Cambio della propria email (richiede la password corrente)
router.post('/change-email', authenticate, authController.changeEmail);

module.exports = router;

