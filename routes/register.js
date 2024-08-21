// routes/register.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

router.post('/register', async (req, res) => {
    try {
        const { NIK, nama, gender, alamat, kecamatan, kelurahan, rt, pendidikan, pekerjaan, email, no_telepon, password, role_id } = req.body;

        // Check if the NIK already exists
        const [nikRows] = await pool.query('SELECT * FROM users WHERE nik = ?', [NIK]);
        if (nikRows.length > 0) {
            return res.status(400).json({ msg: "NIK already exists" });
        }

        // Check if the email already exists
        const [emailRows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (emailRows.length > 0) {
            return res.status(400).json({ msg: "Email already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const [result] = await pool.query(
            'INSERT INTO users (nik, full_name, gender, alamat, kecamatan, kelurahan, rt, pendidikan, pekerjaan, email, no_telp, password, role_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [NIK, nama, gender, alamat, kecamatan, kelurahan, rt, pendidikan, pekerjaan, email, no_telepon, hashedPassword, role_id]
        );

        res.status(200).json({ 
            msg: "Registration successful",
            data: {
                id: result.insertId,
                NIK, 
                nama,
                gender,
                alamat, 
                kecamatan,
                kelurahan,
                rt,
                pendidikan,
                pekerjaan,
                email, 
                no_telepon
            }
        });
    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// routes/register.js
router.get('/getUserByNIK/:NIK', async (req, res) => {
    try {
        const { NIK } = req.params;
        const [rows] = await pool.query('SELECT * FROM users WHERE nik = ?', [NIK]);

        if (rows.length === 0) {
            return res.status(404).json({ msg: "User not found" });
        }

        res.status(200).json(rows[0]);
    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
