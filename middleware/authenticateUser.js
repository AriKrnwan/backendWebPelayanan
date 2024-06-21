const jwt = require('jsonwebtoken');
const secretKey = 'your_jwt_secret_key_here'; // Ganti dengan kunci rahasia Anda

const authenticateUser = (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
        return res.status(401).json({ message: 'Authentication failed: No token provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ message: 'Authentication failed: No token provided' });
    }

    try {
        const decoded = jwt.verify(token, secretKey);
        req.user = decoded; // Asumsikan payload token berisi `id`
        next();
    } catch (error) {
        console.error('Authentication failed:', error);
        return res.status(401).json({ message: 'Authentication failed: Invalid token' });
    }
};

module.exports = authenticateUser;
