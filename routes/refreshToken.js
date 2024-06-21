const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { secret, refreshSecret } = require('../config/config'); // Mengimpor dari config.js
const authenticateUser = require('../middleware/authenticateUser');

router.post('/refresh-token', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ message: 'Token is required' });
    }

    try {
        const payload = jwt.verify(token, refreshSecret);
        const newToken = jwt.sign({ id: payload.id, role: payload.role }, secret, { expiresIn: '1h' });

        res.status(200).json({ token: newToken });
    } catch (error) {
        res.status(401).json({ message: 'Invalid or expired refresh token', error });
    }
});

module.exports = router;
