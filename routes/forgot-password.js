// routes/forgot-password.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const nodemailer = require('nodemailer');

// Fungsi untuk menghasilkan kata sandi acak
function generateRandomPassword(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        // Memeriksa apakah email ada di database
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(404).json({ msg: "Email not found" });
        }

        // Menghasilkan kata sandi baru
        const newPassword = generateRandomPassword();

        // Meng-hash kata sandi baru
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Memperbarui kata sandi pengguna di database
        await pool.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

        // Mengatur transporter untuk Nodemailer
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'ari957752@gmail.com',
                pass: 'alnl blta obzm tymm'
            }
        });

        // Mengirim email berisi kata sandi baru
        await transporter.sendMail({
            from: 'noreply@example.com',
            to: email,
            subject: 'Password Reset',
            text: `Your new password is: ${newPassword}`
        });

        // Menampilkan kata sandi baru di console (opsional, sebaiknya dihapus untuk keamanan)
        console.log(`New password for ${email}: ${newPassword}`);

        // Mengirim respons sukses
        res.status(200).json({ msg: "Password has been reset and sent to your email" });

    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
