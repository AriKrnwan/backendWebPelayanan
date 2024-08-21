const express = require('express');
const db = require('../config/db');
const authenticateUser = require('../middleware/authenticateUser'); // Pastikan jalur ini benar
const router = express.Router();

router.post('/notifikasi', authenticateUser, async (req, res) => {
    const { user_nik, no_lay, layanan, type_message } = req.body;

    try {
        // Pastikan `user_nik`, `no_lay`, `layanan`, dan `type_message` ada dan tidak undefined
        if (!user_nik || !no_lay || !layanan || !type_message) {
            return res.status(400).json({ message: 'Semua field diperlukan' });
        }

        const [result] = await db.execute(
            'INSERT INTO notifikasi (user_nik, no_lay, layanan, type_message, created_at) VALUES (?, ?, ?, ?, NOW())',
            [
                user_nik,
                no_lay,
                layanan,
                type_message
            ]
        );
        
        res.status(201).json({ message: 'Data telah disimpan' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Kesalahan database', error });
    }
});

router.get('/notifikasi/:user_nik', authenticateUser, async (req, res) => {
    const { user_nik } = req.params;

    try {
        const [rows] = await db.execute(
            'SELECT * FROM notifikasi WHERE user_nik = ?',
            [user_nik]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'No notifications found' });
        }

        res.status(200).json(rows); // Send all rows
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.put('/notifikasi/read/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.execute(
            'UPDATE notifikasi SET read_at = NOW() WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.status(200).json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});

router.delete('/notifikasi/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.execute(
            'DELETE FROM notifikasi WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.status(200).json({ message: 'Notification deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Database error', error });
    }
});




module.exports = router;
