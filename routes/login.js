// routes/login.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Secret key for JWT
const JWT_SECRET = 'your_jwt_secret_key_here'; // You should keep this in an environment variable

router.post('/login', async (req, res) => {
    try {
        const { NIK, password } = req.body;

        const [rows] = await pool.query('SELECT * FROM users WHERE nik = ?', [NIK]);
        if (rows.length === 0) {
            return res.status(404).json({ msg: "NIK not registered" });
        }

        const user = rows[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: "Incorrect password" });
        }

        const token = jwt.sign({ id: user.id, role: user.role_id }, JWT_SECRET, { expiresIn: '3h' });

        res.status(200).json({ 
            msg: "Login successful",
            token,
            user: {
                id: user.id,
                NIK: user.nik,
                nama: user.full_name,
                gender: user.gender,
                alamat: user.alamat,
                kecamatan: user.kecamatan,
                kelurahan: user.kelurahan,
                rt: user.rt,
                pendidikan: user.pendidikan,
                pekerjaan: user.pekerjaan,
                email: user.email,
                no_telp: user.no_telp,
                role: user.role_id
            }
        });
    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
