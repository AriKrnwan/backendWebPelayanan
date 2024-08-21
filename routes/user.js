const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const authenticateUser = require('../middleware/authenticateUser');
const db = require('../config/db');

// Middleware untuk verifikasi token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token.split(' ')[1], 'your_jwt_secret_key_here');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Invalid token' });
    }
};

// GET endpoint untuk mendapatkan data pengguna berdasarkan token
router.get('/user', authenticateUser, verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = rows[0];
        res.status(200).json({
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
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT endpoint untuk memperbarui data pengguna berdasarkan token
router.put('/user', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { nama, alamat, kecamatan, kelurahan, rt, email, no_telp, password } = req.body;

        // Periksa apakah email sudah digunakan oleh pengguna lain
        const [existingUser] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
        if (existingUser.length > 0) {
            return res.status(400).json({ message: 'Email already in use' });
        }

        let hashedPassword = null;
        if (password && password.length >= 8) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        const query = `
            UPDATE users
            SET full_name = ?, alamat = ?, kecamatan = ?, kelurahan = ?, rt = ?, email = ?, no_telp = ?
            ${hashedPassword ? ', password = ?' : ''}
            WHERE id = ?`;

        const params = [nama, alamat, kecamatan, kelurahan, rt, email, no_telp];
        if (hashedPassword) {
            params.push(hashedPassword);
        }
        params.push(userId);

        const [result] = await pool.query(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Generate token baru setelah berhasil memperbarui data
        const token = jwt.sign({ id: userId }, 'your_new_jwt_secret_key_here', { expiresIn: '1h' });

        res.status(200).json({ message: 'User data updated successfully', token });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/all-user', authenticateUser, verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users');
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Users not found' });
        }

        const users = rows.map(user => ({
            id: user.id,
            NIK: user.nik,
            nama: user.full_name,
            alamat: user.alamat,
            kecamatan: user.kecamatan,
            kelurahan: user.kelurahan,
            rt: user.rt,
            email: user.email,
            no_telp: user.no_telp,
            role: user.role_id
        }));

        res.status(200).json(users);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/user/:nik', authenticateUser, verifyToken, async (req, res) => {
    const { nik } = req.params;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM users WHERE nik = ?',
            [nik]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Data not found' });
        }

        const dataUser = rows[0];

        const responseData = {
            ...dataUser
        };

        console.log(responseData)

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.put('/user/:nik', authenticateUser, verifyToken, async (req, res) => {
    const { nik } = req.params;
    const { full_name, alamat, kecamatan, kelurahan, rt, email, no_telp, password } = req.body;

    try {
        // Ambil email yang sekarang ada di database
        const [currentUser] = await db.execute('SELECT email FROM users WHERE nik = ?', [nik]);

        if (currentUser.length === 0) {
            return res.status(404).json({ message: 'User tidak ditemukan' });
        }

        const currentEmail = currentUser[0].email;

        // Jika email diubah dan berbeda dengan email yang sekarang ada di database
        if (email !== currentEmail) {
            const [existingEmail] = await db.execute('SELECT nik FROM users WHERE email = ?', [email]);

            // Jika email sudah digunakan oleh user lain
            if (existingEmail.length > 0 && existingEmail[0].nik !== nik) {
                return res.status(400).json({ message: 'Email sudah digunakan oleh user lain' });
            }
        }

        let hashedPassword = null;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(password, salt);
        }

        const updateFields = {
            full_name,
            alamat,
            kecamatan,
            kelurahan,
            rt,
            email,
            no_telp,
            ...(password && { password: hashedPassword }) // Hanya sertakan password jika diberikan
        };

        const setClause = Object.keys(updateFields)
            .map(field => `${field} = ?`)
            .join(', ');

        const queryParams = [...Object.values(updateFields), nik];

        const [result] = await db.execute(
            `UPDATE users SET ${setClause} WHERE nik = ?`,
            queryParams
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User tidak ditemukan' });
        }

        res.status(200).json({ message: 'Data user berhasil diperbarui' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Terjadi kesalahan pada database', error });
    }
});

// Endpoint untuk menghapus user berdasarkan NIK
router.delete('/user/:nik', authenticateUser, verifyToken, async (req, res) => {
    const { nik } = req.params;

    try {
        const [result] = await db.execute('DELETE FROM users WHERE nik = ?', [nik]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User tidak ditemukan' });
        }

        res.status(200).json({ message: 'User berhasil dihapus' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Terjadi kesalahan pada database', error });
    }
});

router.get('/all-users', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users');
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Users not found' });
        }

        const users = rows.map(user => ({
            id: user.id,
            NIK: user.nik,
            nama: user.full_name,
            alamat: user.alamat,
            kecamatan: user.kecamatan,
            kelurahan: user.kelurahan,
            rt: user.rt,
            email: user.email,
            no_telp: user.no_telp,
            role: user.role_id
        }));

        res.status(200).json(users);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});





module.exports = router;
